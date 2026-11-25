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
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
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

  event.respondWith(url.pathname.startsWith("/_next/static/") ? cacheFirst(request) : networkFirst(request));
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
