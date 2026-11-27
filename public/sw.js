/**
 * Karamel's service worker: it keeps a copy of the app so it opens offline.
 *
 * It only ever handles requests to this app's own origin. Requests to other
 * origins are not touched, so they still go through the page's CSP and are
 * blocked as before. It never sends anything anywhere by itself.
 *
 * Caching rules:
 * - /_next/static/...: file names contain a content hash, so a file never
 *   changes. Cache first: use the saved copy, download only if missing.
 * - Everything else (the page, the model, the MediaPipe runtime, icons):
 *   network first, so an update is always picked up; the saved copy is used
 *   only when the network fails (offline). The browser's HTTP cache still
 *   avoids downloading unchanged files again.
 */

// Change the name to drop every saved file, for example after changing the rules above.
const CACHE = "karamel-v1";

// The reminders' titles and messages, saved by the page (src/lib/pushTexts.ts uses the same
// names). A push carries only the reminder's id; the text stays on the device.
const REMINDER_TEXTS_CACHE = "karamel-reminder-texts";
const REMINDER_TEXTS_URL = "/__karamel/reminder-texts.json";

const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      // The page was loaded before this worker existed, so its scripts and
      // styles were not saved. Save the ones the page HTML points to.
      const page = await cache.match("/");
      const html = page ? await page.text() : "";
      const assets = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? []);
      await Promise.all([...assets].map((url) => cache.add(url).catch(() => {})));
      // Take over right away; old saved files stay valid, since they never change.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const keep = [CACHE, REMINDER_TEXTS_CACHE];
      await Promise.all(names.filter((name) => !keep.includes(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

/** Saves a copy of a good response. */
async function save(request, response) {
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function cacheFirst(request) {
  const saved = await caches.match(request);
  return saved ?? save(request, await fetch(request));
}

async function networkFirst(request) {
  try {
    return await save(request, await fetch(request));
  } catch (error) {
    const saved = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
    if (saved) return saved;
    // Offline and never saved: for a page, fall back to the home page.
    if (request.mode === "navigate") {
      const home = await caches.match("/");
      if (home) return home;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Other origins, non-GET requests, and partial (range) requests are left to the browser.
  if (url.origin !== self.location.origin) return;
  if (request.method !== "GET" || request.headers.has("range")) return;
  if (url.pathname === "/sw.js") return;
  // The push server's API is never cached: its answers must always be fresh.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/__karamel/")) return;

  event.respondWith(url.pathname.startsWith("/_next/static/") ? cacheFirst(request) : networkFirst(request));
});

/** The saved title and messages for a reminder id, or null. */
async function reminderText(key) {
  try {
    const cache = await caches.open(REMINDER_TEXTS_CACHE);
    const saved = await cache.match(REMINDER_TEXTS_URL);
    const texts = saved ? await saved.json() : null;
    const text = texts && Object.hasOwn(texts, key) ? texts[key] : null;
    if (text && typeof text.title === "string" && Array.isArray(text.messages)) return text;
  } catch {
    // Missing or broken: the neutral text below is used.
  }
  return null;
}

// A reminder from the push server (server/), while Karamel is closed. The message is only
// {"reminderKey": "..."}. A notification is always shown: Safari takes the push permission
// away from sites whose pushes show nothing.
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let key = null;
      try {
        const data = event.data ? event.data.json() : null;
        if (data && typeof data.reminderKey === "string") key = data.reminderKey;
      } catch {
        // Not JSON: show the neutral text.
      }
      const text = key ? await reminderText(key) : null;
      const messages = text ? text.messages.filter((m) => typeof m === "string" && m.length > 0) : [];
      await self.registration.showNotification(text ? text.title : "🐾 Karamel", {
        body: messages.length > 0 ? messages[Math.floor(Math.random() * messages.length)] : "Time for a little break.",
        // The same tag as the page's own notification for this reminder (src/lib/notifications.ts),
        // so when Karamel is open too, the two show as one.
        tag: key ? `karamel-reminder-${key}` : "karamel-reminder",
        icon: "/icons/icon-192.png",
      });
    })(),
  );
});

// Clicking a notification brings the app window to the front.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) return open.focus();
      return self.clients.openWindow("/");
    })(),
  );
});
