/**
 * Reminders while Karamel is closed: the browser side of Web Push.
 *
 * The browser subscribes with the push service (Apple's, Google's, ...) and registers that
 * subscription with Karamel's server (server/), which then wakes the device at the right
 * times. All calls go to /api on the website's own origin; the website forwards them to the
 * server (see next.config.ts), so the CSP stays connect-src 'self'.
 */
import type { PushSchedule } from "./pushSchedules";
import { readSetting, removeSetting, storageKey, writeSetting } from "./storage";

const DEVICE_SETTING = "push-device";
export const PUSH_DEVICE_STORAGE_KEY = storageKey(DEVICE_SETTING);

/** The server's id for this device and the secret key that proves it is this device. */
export type PushDevice = { deviceId: string; secret: string; endpoint: string };

export type PushSupport = "supported" | "needs-home-screen" | "unsupported";

export type PushProblem = "denied" | "no-worker" | "server";

export class PushError extends Error {
  constructor(readonly problem: PushProblem) {
    super(problem);
  }
}

/**
 * iPhone and iPad offer Web Push only to web apps added to the Home Screen. Safari there has
 * `navigator.standalone` (false in the browser), which tells that case apart from a browser
 * that cannot do push at all.
 */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "supported";
  if ((navigator as Navigator & { standalone?: boolean }).standalone === false) return "needs-home-screen";
  return "unsupported";
}

/** Whether this website was built with a push server (KARAMEL_API_URL, see next.config.ts). */
export function pushServerConfigured(): boolean {
  return process.env.KARAMEL_PUSH_SERVER === "on";
}

/** The server's VAPID public key, or null when it cannot be reached. */
export async function serverPublicKey(): Promise<string | null> {
  try {
    const response = await fetch("/api/push/public-key");
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const key = (body as { publicKey?: unknown } | null)?.publicKey;
    return typeof key === "string" && /^[A-Za-z0-9_-]{80,100}$/.test(key) ? key : null;
  } catch {
    return null;
  }
}

/** The saved device, or null. Saved data is untrusted. */
export function savedDevice(): PushDevice | null {
  try {
    const raw: unknown = JSON.parse(readSetting(DEVICE_SETTING) ?? "null");
    const { deviceId, secret, endpoint } = (raw ?? {}) as Record<string, unknown>;
    return typeof deviceId === "string" && typeof secret === "string" && typeof endpoint === "string"
      ? { deviceId, secret, endpoint }
      : null;
  } catch {
    return null;
  }
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function sameBytes(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const view = new Uint8Array(a);
  return view.every((byte, i) => byte === b[i]);
}

/** The service worker (public/sw.js). It only runs in production builds, so do not wait forever. */
async function workerRegistration(timeoutMs = 10_000): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PushError("no-worker")), timeoutMs);
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function register(subscription: PushSubscription): Promise<PushDevice> {
  const response = await fetch("/api/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!response.ok) throw new PushError("server");
  const body = (await response.json()) as { deviceId?: unknown; secret?: unknown };
  if (typeof body.deviceId !== "string" || typeof body.secret !== "string") throw new PushError("server");
  const device = { deviceId: body.deviceId, secret: body.secret, endpoint: subscription.endpoint };
  writeSetting(DEVICE_SETTING, JSON.stringify(device));
  return device;
}

/**
 * Turns push on. Must be called from a tap or click: browsers (Safari especially) only
 * show the permission prompt then.
 */
export async function turnOnPush(): Promise<PushDevice> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new PushError("denied");
  const publicKey = await serverPublicKey();
  if (!publicKey) throw new PushError("server");
  const registration = await workerRegistration();
  const key = base64UrlToBytes(publicKey);

  let subscription = await registration.pushManager.getSubscription();
  // Subscribed with other server keys (they were changed): those pushes would be refused.
  if (subscription && !sameBytes(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return register(subscription);
}

/** Turns push off: the server forgets this device, and the browser drops the subscription. */
export async function turnOffPush(): Promise<void> {
  const device = savedDevice();
  removeSetting(DEVICE_SETTING);
  if (device) {
    // If this fails, the push service reports the subscription as gone on the next push,
    // and the server forgets the device then.
    await fetch(`/api/devices/${encodeURIComponent(device.deviceId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${device.secret}` },
    }).catch(() => {});
  }
  try {
    const subscription = await (await workerRegistration(2_000)).pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // No worker or no subscription: nothing to drop.
  }
}

/**
 * On load: is push still on? The browser may have dropped or replaced the subscription
 * (for example after the user cleared site data); a replaced one is registered again.
 */
export async function checkPushDevice(): Promise<PushDevice | null> {
  const device = savedDevice();
  if (!device) return null;
  try {
    const subscription = await (await workerRegistration(5_000)).pushManager.getSubscription();
    if (!subscription || Notification.permission !== "granted") {
      removeSetting(DEVICE_SETTING);
      return null;
    }
    return subscription.endpoint === device.endpoint ? device : await register(subscription);
  } catch {
    return device; // Cannot check now (offline, worker still starting): keep it.
  }
}

function putSchedules(device: PushDevice, schedules: readonly PushSchedule[]): Promise<Response> {
  return fetch(`/api/devices/${encodeURIComponent(device.deviceId)}/schedules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${device.secret}` },
    body: JSON.stringify({ schedules }),
  });
}

/**
 * Sends the whole list of reminder times. Returns "off" when push turned out to be off.
 * A 401 means the server forgot this device (for example after the push service reported it
 * gone): register the current subscription again and retry once.
 */
export async function syncPushSchedules(schedules: readonly PushSchedule[]): Promise<"synced" | "off"> {
  let device = savedDevice();
  if (!device) return "off";
  let response = await putSchedules(device, schedules);
  if (response.status === 401) {
    const subscription = await (await workerRegistration(5_000)).pushManager.getSubscription();
    if (!subscription) {
      removeSetting(DEVICE_SETTING);
      return "off";
    }
    device = await register(subscription);
    response = await putSchedules(device, schedules);
  }
  if (!response.ok) throw new PushError("server");
  return "synced";
}
