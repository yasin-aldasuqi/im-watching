import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reminderNotificationTag } from "./notifications";
import { REMINDER_TEXTS_CACHE, saveReminderTexts } from "./pushTexts";
import { createCustomReminder, defaultReminders } from "./reminders";

/** An in-memory Cache Storage, shared by the page code and the service worker in these tests. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const key = (request: RequestInfo | URL) => (typeof request === "string" ? request : String(request));
  return {
    stores,
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        put: async (request: RequestInfo, response: Response) => void store.set(key(request), response),
        match: async (request: RequestInfo) => store.get(key(request))?.clone(),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async () => undefined,
  };
}

type Listener = (event: unknown) => void;

/** Loads the real public/sw.js into a fake service worker global. */
function loadServiceWorker(caches: ReturnType<typeof fakeCaches>) {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn(async (title: string, options: NotificationOptions) => ({ title, options }));
  const self = {
    location: new URL("https://karamel.example/"),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    registration: { showNotification },
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => []), openWindow: vi.fn() },
    skipWaiting: vi.fn(async () => {}),
  };
  const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
  const fetch = vi.fn(async () => new Response("<html>", { status: 200 }));
  vm.runInNewContext(source, { self, caches, fetch, URL, Response, console });

  /** Dispatches an event and waits for the work it hands to waitUntil. */
  async function dispatch(type: string, event: Record<string, unknown>) {
    let work: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ ...event, waitUntil: (p: Promise<unknown>) => (work = p) });
    await work;
  }
  return { dispatch, showNotification, listeners };
}

const pushOf = (data: unknown) => ({ data: { json: () => (typeof data === "string" ? JSON.parse(data) : data) } });

let caches: ReturnType<typeof fakeCaches>;
beforeEach(() => {
  caches = fakeCaches();
  vi.stubGlobal("caches", caches);
});
afterEach(() => vi.unstubAllGlobals());

describe("a push while Karamel is closed", () => {
  it("shows the reminder's own title and one of its messages, saved on the device", async () => {
    const water = defaultReminders().find((r) => r.id === "water")!;
    const call = { ...createCustomReminder("k3x9"), name: "Call mom", emoji: "📞", messages: ["Call her! 💛"] };
    await saveReminderTexts([water, call]);
    const worker = loadServiceWorker(caches);

    await worker.dispatch("push", pushOf({ reminderKey: call.id }));
    await worker.dispatch("push", pushOf({ reminderKey: "water" }));

    const [first, second] = worker.showNotification.mock.calls;
    expect(first[0]).toBe("📞 Call mom · Karamel");
    expect(first[1]).toMatchObject({ body: "Call her! 💛", tag: reminderNotificationTag(call.id) });
    expect(second[0]).toBe("💧 Drink water · Karamel");
    expect(water.messages).toContain(second[1].body);
    expect(second[1].tag).toBe(reminderNotificationTag("water")); // Same tag as the page: one notification.
  });

  it("still shows a neutral notification when the text is unknown or the message is broken", async () => {
    const worker = loadServiceWorker(caches);
    await worker.dispatch("push", pushOf({ reminderKey: "posture" })); // No texts saved yet.
    await worker.dispatch("push", { data: { json: () => JSON.parse("not json") } });
    await worker.dispatch("push", { data: null });

    expect(worker.showNotification).toHaveBeenCalledTimes(3);
    for (const [title, options] of worker.showNotification.mock.calls) {
      expect(title).toBe("🐾 Karamel");
      expect(options.body).toBe("Time for a little break.");
    }
  });
});

describe("the service worker's caches and requests", () => {
  it("keeps the saved texts when cleaning up old caches", async () => {
    await saveReminderTexts(defaultReminders());
    await caches.open("karamel-v0");
    const worker = loadServiceWorker(caches);

    await worker.dispatch("activate", {});

    expect([...caches.stores.keys()]).toEqual([REMINDER_TEXTS_CACHE]);
  });

  it("never answers /api requests from a saved copy", () => {
    const worker = loadServiceWorker(caches);
    const respondWith = vi.fn();
    for (const path of ["/api/push/public-key", "/__karamel/reminder-texts.json", "/"]) {
      worker.listeners.get("fetch")!({
        request: { url: `https://karamel.example${path}`, method: "GET", mode: "cors", headers: new Headers() },
        respondWith,
      });
    }
    expect(respondWith).toHaveBeenCalledTimes(1); // Only "/", the page itself.
  });
});
