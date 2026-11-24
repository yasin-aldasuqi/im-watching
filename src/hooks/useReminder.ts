import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { REMINDER_MESSAGES } from "@/lib/messages";
import {
  DEFAULT_INTERVAL_SEC,
  createInitialState,
  isIntervalOption,
  reminderReducer,
  remainingMs,
  secondsToMs,
} from "@/lib/reminder";

export const INTERVAL_STORAGE_KEY = "im-watching:interval-sec";
export const AUTO_RESTART_STORAGE_KEY = "im-watching:auto-restart";
export const DUE_TITLE = "⏰ Sit up straight! · I'm Watching";
export const NOTIFICATION_TITLE = "I'm Watching 👀";

/** How long the bubble stays up after an automatic restart. */
export const REMINDER_VISIBLE_MS = 10_000;

const TICK_MS = 1000;

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

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Storage can be blocked (private mode, site settings). Use the defaults.
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not saving the choice is fine.
  }
}

function showNotification(body: string): Notification | null {
  if (!notificationsSupported() || Notification.permission !== "granted") return null;
  try {
    const notification = new Notification(NOTIFICATION_TITLE, { body });
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

/**
 * Connects the pure reminder state machine to the browser: a 1-second tick
 * while running, an immediate re-check when the tab becomes visible again,
 * and the side effects of a reminder (tab title and an optional notification).
 */
export function useReminder() {
  const [state, dispatch] = useReducer(
    reminderReducer,
    secondsToMs(DEFAULT_INTERVAL_SEC),
    createInitialState,
  );
  // The clock is never read during render: the page is prerendered, and a
  // render must give the same HTML every time. `now` only matters while
  // running, and every action that starts a run sets it first.
  const [now, setNow] = useState(0);
  const notificationStatus = useSyncExternalStore(
    subscribeToPermission,
    getPermissionSnapshot,
    getPermissionServerSnapshot,
  );
  const notificationRef = useRef<Notification | null>(null);

  const closeNotification = useCallback(() => {
    notificationRef.current?.close();
    notificationRef.current = null;
  }, []);

  const dispatchNow = useCallback((type: "start" | "pause" | "resume" | "acknowledge") => {
    const t = Date.now();
    setNow(t);
    dispatch({ type, now: t });
  }, []);

  // Saved settings are read after hydration. Reading them during the first
  // render would make the client HTML differ from the server HTML.
  useEffect(() => {
    const seconds = Number(readStorage(INTERVAL_STORAGE_KEY));
    if (isIntervalOption(seconds)) {
      dispatch({ type: "setInterval", intervalMs: secondsToMs(seconds) });
    }
    if (readStorage(AUTO_RESTART_STORAGE_KEY) === "true") {
      dispatch({ type: "setAutoRestart", autoRestart: true });
    }
  }, []);

  useEffect(() => {
    if (state.status !== "running") return;

    const tick = () => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: "tick", now: t, random: Math.random() });
    };
    const id = window.setInterval(tick, TICK_MS);
    // Background tabs get throttled timers. Re-check as soon as the user is back.
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [state.status]);

  const message = state.messageIndex === null ? null : REMINDER_MESSAGES[state.messageIndex];

  // One notification per reminder. A new one replaces the previous one, so
  // they never pile up while the user is away.
  useEffect(() => {
    if (state.reminderCount === 0 || message === null) return;
    closeNotification();
    notificationRef.current = showNotification(message);
  }, [state.reminderCount, message, closeNotification]);

  useEffect(() => closeNotification, [closeNotification]);

  // A reminder is "visible" while waiting for the user, or for a few seconds
  // after an automatic restart.
  const reminderVisible =
    message !== null &&
    (state.status === "due" ||
      (state.status === "running" &&
        state.lastReminderAt !== null &&
        now - state.lastReminderAt < REMINDER_VISIBLE_MS));

  useEffect(() => {
    if (!reminderVisible) return;
    const previousTitle = document.title;
    document.title = DUE_TITLE;
    return () => {
      document.title = previousTitle;
    };
  }, [reminderVisible]);

  const setIntervalSeconds = useCallback((seconds: number) => {
    if (!isIntervalOption(seconds)) return;
    dispatch({ type: "setInterval", intervalMs: secondsToMs(seconds) });
    writeStorage(INTERVAL_STORAGE_KEY, String(seconds));
  }, []);

  const setAutoRestart = useCallback((autoRestart: boolean) => {
    dispatch({ type: "setAutoRestart", autoRestart });
    writeStorage(AUTO_RESTART_STORAGE_KEY, String(autoRestart));
  }, []);

  const requestNotifications = useCallback(async () => {
    if (!notificationsSupported()) return;
    await Notification.requestPermission();
    permissionListeners.forEach((listener) => listener());
  }, []);

  return {
    status: state.status,
    remainingMs: remainingMs(state, now),
    intervalSeconds: state.intervalMs / 1000,
    autoRestart: state.autoRestart,
    reminderVisible,
    message: reminderVisible ? message : null,
    start: () => dispatchNow("start"),
    pause: () => dispatchNow("pause"),
    resume: () => dispatchNow("resume"),
    acknowledge: () => {
      closeNotification();
      dispatchNow("acknowledge");
    },
    reset: () => {
      closeNotification();
      dispatch({ type: "reset" });
    },
    setIntervalSeconds,
    setAutoRestart,
    notificationStatus,
    requestNotifications,
  };
}
