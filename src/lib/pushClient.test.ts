import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSubscription, SERVER_KEY, installFakePush, removeFakePush } from "@/test-utils/fakePush";
import {
  PUSH_DEVICE_STORAGE_KEY,
  PushError,
  checkPushDevice,
  pushSupport,
  savedDevice,
  serverPublicKey,
  syncPushSchedules,
  turnOffPush,
  turnOnPush,
} from "./pushClient";

const SCHEDULES = [{ reminderKey: "posture", firesInSeconds: 1800, intervalSeconds: 1800 }];

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  removeFakePush();
});

describe("support", () => {
  it("is supported with a service worker, PushManager, and notifications", () => {
    installFakePush();
    expect(pushSupport()).toBe("supported");
  });

  it("needs the Home Screen on iPhone and iPad in the browser", () => {
    installFakePush({ pushManager: false });
    Object.defineProperty(navigator, "standalone", { configurable: true, value: false });
    expect(pushSupport()).toBe("needs-home-screen");
  });

  it("is unsupported elsewhere without PushManager", () => {
    installFakePush({ pushManager: false });
    expect(pushSupport()).toBe("unsupported");
  });
});

describe("the server's public key", () => {
  it("is null without a server, when unreachable, or when the answer is not a key", async () => {
    installFakePush({ server: false });
    expect(await serverPublicKey()).toBeNull();
    const fake = installFakePush();
    fake.serverDown = true;
    expect(await serverPublicKey()).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ publicKey: "<script>" })));
    expect(await serverPublicKey()).toBeNull();
  });

  it("is returned when a server answers", async () => {
    installFakePush();
    expect(await serverPublicKey()).toBe(SERVER_KEY);
  });
});

describe("turning push on", () => {
  it("asks permission, subscribes with the server's key, and registers the subscription", async () => {
    const fake = installFakePush();
    const device = await turnOnPush();

    expect(Notification.requestPermission).toHaveBeenCalled();
    const subscription = fake.subscription!;
    expect(subscription.options.userVisibleOnly).toBe(true);
    expect(new Uint8Array(subscription.options.applicationServerKey!)).toEqual(
      Uint8Array.from(atob(SERVER_KEY.replace(/-/g, "+").replace(/_/g, "/") + "="), (c) => c.charCodeAt(0)),
    );
    const post = fake.calls.find((c) => c.method === "POST")!;
    expect(post).toMatchObject({ path: "/api/devices", body: { subscription: subscription.toJSON() } });
    expect(savedDevice()).toEqual(device);
    expect(device.endpoint).toBe(subscription.endpoint);
  });

  it("stops when permission is refused, before subscribing or calling the server", async () => {
    const fake = installFakePush({ grant: false });
    await expect(turnOnPush()).rejects.toEqual(new PushError("denied"));
    expect(fake.subscription).toBeNull();
    expect(fake.calls).toEqual([]);
    expect(savedDevice()).toBeNull();
  });

  it("replaces a subscription made with other server keys", async () => {
    const old = new FakeSubscription("https://web.push.apple.com/old", {
      applicationServerKey: new Uint8Array(65).buffer,
      userVisibleOnly: true,
    });
    const fake = installFakePush({ existing: old });
    await turnOnPush();
    expect(old.unsubscribed).toBe(true);
    expect(fake.subscription!.endpoint).not.toBe(old.endpoint);
  });
});

describe("syncing", () => {
  it("sends the whole list with the device's secret", async () => {
    const fake = installFakePush();
    const device = await turnOnPush();
    expect(await syncPushSchedules(SCHEDULES)).toBe("synced");
    const put = fake.calls.find((c) => c.method === "PUT")!;
    expect(put).toMatchObject({
      path: `/api/devices/${device.deviceId}/schedules`,
      auth: `Bearer ${device.secret}`,
      body: { schedules: SCHEDULES },
    });
  });

  it("registers again and retries once when the server forgot the device", async () => {
    const fake = installFakePush();
    const first = await turnOnPush();
    fake.forgetAll();

    expect(await syncPushSchedules(SCHEDULES)).toBe("synced");

    const second = savedDevice()!;
    expect(second.deviceId).not.toBe(first.deviceId);
    expect(fake.schedules.get(second.deviceId)).toEqual(SCHEDULES);
  });

  it("is off without a saved device, and when the subscription is gone too", async () => {
    const fake = installFakePush();
    expect(await syncPushSchedules(SCHEDULES)).toBe("off");
    expect(fake.calls).toEqual([]);

    await turnOnPush();
    fake.forgetAll();
    fake.subscription = null;
    expect(await syncPushSchedules(SCHEDULES)).toBe("off");
    expect(savedDevice()).toBeNull();
  });

  it("throws when the server fails, so the caller can retry later", async () => {
    const fake = installFakePush();
    await turnOnPush();
    fake.serverDown = true;
    await expect(syncPushSchedules(SCHEDULES)).rejects.toThrow();
  });
});

describe("turning push off", () => {
  it("makes the server forget the device and drops the subscription", async () => {
    const fake = installFakePush();
    const device = await turnOnPush();
    await turnOffPush();
    expect(fake.calls.at(-1)).toMatchObject({
      method: "DELETE",
      path: `/api/devices/${device.deviceId}`,
      auth: `Bearer ${device.secret}`,
    });
    expect(fake.devices.has(device.deviceId)).toBe(false);
    expect(fake.subscription!.unsubscribed).toBe(true);
    expect(window.localStorage.getItem(PUSH_DEVICE_STORAGE_KEY)).toBeNull();
  });
});

describe("checking on load", () => {
  it("registers again when the browser replaced the subscription", async () => {
    const fake = installFakePush();
    const first = await turnOnPush();
    fake.subscription = new FakeSubscription("https://web.push.apple.com/new", {
      applicationServerKey: null,
      userVisibleOnly: true,
    });
    const device = await checkPushDevice();
    expect(device!.endpoint).toBe("https://web.push.apple.com/new");
    expect(device!.deviceId).not.toBe(first.deviceId);
  });

  it("turns off when the subscription is gone", async () => {
    const fake = installFakePush();
    await turnOnPush();
    fake.subscription = null;
    expect(await checkPushDevice()).toBeNull();
    expect(savedDevice()).toBeNull();
  });

  it("ignores broken saved data", () => {
    window.localStorage.setItem(PUSH_DEVICE_STORAGE_KEY, '{"deviceId": 5}');
    expect(savedDevice()).toBeNull();
    window.localStorage.setItem(PUSH_DEVICE_STORAGE_KEY, "not json");
    expect(savedDevice()).toBeNull();
  });
});
