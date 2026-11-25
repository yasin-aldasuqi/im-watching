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

/** Shows a desktop notification if permission was granted. Returns it, or null. */
export function showNotification(body: string, title: string = NOTIFICATION_TITLE): Notification | null {
  if (!notificationsSupported() || Notification.permission !== "granted") return null;
  try {
    const notification = new Notification(title, { body });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return notification;
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
    // The in-page reminder still works.
    return null;
  }
}
