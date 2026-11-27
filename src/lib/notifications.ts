import { useCallback, useSyncExternalStore } from "react";

export const NOTIFICATION_TITLE = "Karamel 👀";

export type NotificationStatus = "unsupported" | NotificationPermission;

function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

// Notification permission lives outside React, so it is read with
// useSyncExternalStore. The server snapshot is "unsupported", which keeps the
// server HTML and the first client render the same.
const permissionListeners = new Set<() => void>();

function subscribeToPermission(onChange: () => void): () => void {
  permissionListeners.add(onChange);
  let permissionStatus: PermissionStatus | undefined;
  let unsubscribed = false;
  // Also follow changes made in the browser's site settings, where supported.
  navigator.permissions
    ?.query({ name: "notifications" })
    .then((result) => {
      if (unsubscribed) return;
      permissionStatus = result;
      result.addEventListener("change", onChange);
    })
    .catch(() => {});
  return () => {
    unsubscribed = true;
    permissionListeners.delete(onChange);
    permissionStatus?.removeEventListener("change", onChange);
  };
}

function getPermissionSnapshot(): NotificationStatus {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

function getPermissionServerSnapshot(): NotificationStatus {
  return "unsupported";
}

/** The current notification permission, and a function that asks for it. */
export function useNotificationPermission() {
  const status = useSyncExternalStore(
    subscribeToPermission,
    getPermissionSnapshot,
    getPermissionServerSnapshot,
  );
  const request = useCallback(async () => {
    if (!notificationsSupported()) return;
    await Notification.requestPermission();
    permissionListeners.forEach((listener) => listener());
  }, []);
  return { status, request };
}

/** A shown notification that can be closed again. */
export type NotificationHandle = { close: () => void };

let nextTag = 0;

/**
 * The tag for a reminder's notification. A new notification with the same tag replaces the
 * old one, so the page's own notification and the push for the same firing show as one.
 * public/sw.js builds the same tag for pushes (a test checks they match).
 */
export function reminderNotificationTag(reminderId: string): string {
  return `karamel-reminder-${reminderId}`;
}

export const SLOUCH_NOTIFICATION_TAG = "karamel-slouch";

/**
 * Android browsers do not allow `new Notification()` from a page; only a
 * service worker can show one. When there is a worker, ask it instead.
 * The tag lets us find the notification again to close it.
 */
function showFromServiceWorker(title: string, body: string, givenTag?: string): NotificationHandle | null {
  const worker = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  if (!worker?.controller) return null;
  const tag = givenTag ?? `karamel-${Date.now()}-${nextTag++}`;
  const shown = worker.ready
    .then((registration) => registration.showNotification(title, { body, tag, icon: "/icons/icon-192.png" }))
    .catch(() => {});
  return {
    close: () => {
      void shown
        .then(() => worker.ready)
        .then((registration) => registration.getNotifications({ tag }))
        .then((list) => list.forEach((notification) => notification.close()))
        .catch(() => {});
    },
  };
}

/**
 * Shows a desktop notification if permission was granted. Returns a handle, or null.
 * `tag`: a notification with the same tag replaces this one (see reminderNotificationTag).
 */
export function showNotification(
  body: string,
  title: string = NOTIFICATION_TITLE,
  tag?: string,
): NotificationHandle | null {
  if (!notificationsSupported() || Notification.permission !== "granted") return null;
  try {
    const notification = new Notification(title, tag ? { body, tag } : { body });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return notification;
  } catch {
    // Without a service worker, the in-page reminder still works.
    return showFromServiceWorker(title, body, tag);
  }
}
