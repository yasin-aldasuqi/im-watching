import { useCallback, useSyncExternalStore } from "react";

/**
 * Registers the service worker (public/sw.js), which keeps a copy of the app
 * so it opens offline. Production only: in development, saved files would hide
 * code changes.
 */
export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    // Without the worker the app still works, just not offline.
  });
}

/**
 * Chromium browsers fire `beforeinstallprompt` when the app can be installed.
 * Saving the event lets our own button open the install window later. Other
 * browsers (Firefox, Safari) never fire it; they have their own menu entries.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let installEvent: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function onBeforeInstallPrompt(event: Event) {
  event.preventDefault(); // Keep the event for our button; the browser's own icon still shows.
  installEvent = event as InstallPromptEvent;
  notify();
}

function onInstalled() {
  installEvent = null;
  notify();
}

/** Starts listening. Called when this module loads, so an early event is not missed. */
export function listenForInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.removeEventListener("appinstalled", onInstalled);
  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.addEventListener("appinstalled", onInstalled);
}
listenForInstallPrompt();

/** For tests: forget a saved install event. */
export function resetInstallPromptForTests(): void {
  installEvent = null;
  notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Whether our Install button can be shown, and a function that opens the install window. */
export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(
    subscribe,
    () => installEvent !== null,
    () => false,
  );
  const install = useCallback(async () => {
    const event = installEvent;
    if (!event) return;
    // An install event can only be used once, whatever the user chooses.
    installEvent = null;
    notify();
    await event.prompt();
  }, []);
  return { canInstall, install };
}
