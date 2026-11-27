import { vi } from "vitest";

/**
 * A fake browser push setup (Notification, service worker, PushManager) and a fake Karamel
 * server behind /api, for tests. The fake server checks the Bearer secret like the real one.
 */
export const SERVER_KEY = "B" + "A".repeat(86); // 87 base64url characters, like a real VAPID public key.

export class FakeSubscription {
  unsubscribed = false;
  constructor(
    readonly endpoint: string,
    readonly options: { applicationServerKey: ArrayBuffer | null; userVisibleOnly: boolean },
  ) {}
  toJSON() {
    return { endpoint: this.endpoint, expirationTime: null, keys: { p256dh: "p256dh-key", auth: "auth-key" } };
  }
  unsubscribe = vi.fn(async () => {
    this.unsubscribed = true;
    return true;
  });
}

type Call = { method: string; path: string; auth: string | null; body: unknown };

export function installFakePush({
  permission = "default" as NotificationPermission,
  grant = true,
  server = true,
  pushManager = true,
  existing = null as FakeSubscription | null,
} = {}) {
  let subscription: FakeSubscription | null = existing;
  let counter = 0;
  const calls: Call[] = [];
  const devices = new Map<string, string>(); // deviceId -> secret
  const schedules = new Map<string, unknown>(); // deviceId -> last schedule list
  const fake = {
    calls,
    devices,
    schedules,
    get subscription() {
      return subscription;
    },
    set subscription(value: FakeSubscription | null) {
      subscription = value;
    },
    /** Makes the server forget every device, like after the push service reported them gone. */
    forgetAll: () => devices.clear(),
    serverDown: false,
  };

  class FakeNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = vi.fn(async () => {
      FakeNotification.permission = grant ? "granted" : "denied";
      return FakeNotification.permission;
    });
    close = vi.fn();
    onclick: (() => void) | null = null;
  }
  vi.stubGlobal("Notification", FakeNotification);
  if (pushManager) vi.stubGlobal("PushManager", class {});

  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => subscription),
      subscribe: vi.fn(async (options: { applicationServerKey: Uint8Array; userVisibleOnly: boolean }) => {
        subscription = new FakeSubscription(`https://web.push.apple.com/sub-${++counter}`, {
          applicationServerKey: options.applicationServerKey.slice().buffer,
          userVisibleOnly: options.userVisibleOnly,
        });
        return subscription;
      }),
    },
    showNotification: vi.fn(async () => {}),
    getNotifications: vi.fn(async () => []),
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve(registration), controller: {} },
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const auth = new Headers(init.headers).get("Authorization");
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path: input, auth, body });
      if (!server || fake.serverDown) {
        if (fake.serverDown) throw new TypeError("Failed to fetch");
        return new Response("Not found", { status: 404 });
      }
      if (method === "GET" && input === "/api/push/public-key") return Response.json({ publicKey: SERVER_KEY });
      if (method === "POST" && input === "/api/devices") {
        const deviceId = `device-${devices.size + 1}-${calls.length}`;
        const secret = `secret-${calls.length}`;
        devices.set(deviceId, secret);
        return Response.json({ deviceId, secret }, { status: 201 });
      }
      const match = input.match(/^\/api\/devices\/([^/]+)(\/schedules)?$/);
      if (match) {
        const [, deviceId, isSchedules] = match;
        if (devices.get(deviceId) === undefined || auth !== `Bearer ${devices.get(deviceId)}`) {
          return new Response(null, { status: 401 });
        }
        if (method === "PUT" && isSchedules) schedules.set(deviceId, (body as { schedules: unknown }).schedules);
        if (method === "DELETE" && !isSchedules) devices.delete(deviceId);
        return new Response(null, { status: 204 });
      }
      return new Response("Not found", { status: 404 });
    }),
  );
  return fake;
}

/** Removes what installFakePush added to navigator (vi.unstubAllGlobals handles the rest). */
export function removeFakePush() {
  Reflect.deleteProperty(navigator, "serviceWorker");
  Reflect.deleteProperty(navigator, "standalone");
}
