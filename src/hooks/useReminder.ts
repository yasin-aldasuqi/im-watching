import { useCallback, useEffect, useReducer, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_INTERVAL_MIN,
  createInitialState,
  isIntervalOption,
  minutesToMs,
  reminderReducer,
  remainingMs,
} from "@/lib/reminder";

export const INTERVAL_STORAGE_KEY = "im-watching:interval-min";
export const DUE_TITLE = "⏰ Sit up straight! · I'm Watching";

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

function readStoredInterval(): number | null {
  try {
    const minutes = Number(window.localStorage.getItem(INTERVAL_STORAGE_KEY));
    return isIntervalOption(minutes) ? minutes : null;
  } catch {
    // Storage can be blocked (private mode, site settings). Use the default.
    return null;
  }
}

/**
 * Connects the pure reminder state machine to the browser: a 1-second tick
 * while running, an immediate re-check when the tab becomes visible again,
 * and the side effects of a due reminder (tab title and an optional
 * notification).
 */
export function useReminder() {
  const [state, dispatch] = useReducer(
    reminderReducer,
    minutesToMs(DEFAULT_INTERVAL_MIN),
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

  const dispatchNow = useCallback((type: "start" | "pause" | "resume" | "acknowledge") => {
    const t = Date.now();
    setNow(t);
    dispatch({ type, now: t });
  }, []);

  // The saved interval is read after hydration. Reading it during the first
  // render would make the client HTML differ from the server HTML.
  useEffect(() => {
    const saved = readStoredInterval();
    if (saved !== null) dispatch({ type: "setInterval", intervalMs: minutesToMs(saved) });
  }, []);

  useEffect(() => {
    if (state.status !== "running") return;

    const tick = () => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: "tick", now: t });
    };
    const id = window.setInterval(tick, TICK_MS);
    // Background tabs get throttled timers. Re-check as soon as the user is back.
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [state.status]);

  useEffect(() => {
    if (state.status !== "due") return;

    const previousTitle = document.title;
    document.title = DUE_TITLE;

    let notification: Notification | undefined;
    if (notificationsSupported() && Notification.permission === "granted") {
      try {
        notification = new Notification("I'm Watching", {
          body: "Time to sit up straight and roll your shoulders back.",
          tag: "posture-reminder",
        });
        notification.onclick = () => {
          window.focus();
          notification?.close();
        };
      } catch {
        // Some mobile browsers only allow notifications from a service worker.
        // The in-page reminder still works.
      }
    }

    return () => {
      document.title = previousTitle;
      notification?.close();
    };
  }, [state.status]);

  const setIntervalMinutes = useCallback((minutes: number) => {
    if (!isIntervalOption(minutes)) return;
    dispatch({ type: "setInterval", intervalMs: minutesToMs(minutes) });
    try {
      window.localStorage.setItem(INTERVAL_STORAGE_KEY, String(minutes));
    } catch {
      // Not saving the choice is fine.
    }
  }, []);

  const requestNotifications = useCallback(async () => {
    if (!notificationsSupported()) return;
    await Notification.requestPermission();
    permissionListeners.forEach((listener) => listener());
  }, []);

  return {
    status: state.status,
    remainingMs: remainingMs(state, now),
    intervalMinutes: state.intervalMs / minutesToMs(1),
    start: () => dispatchNow("start"),
    pause: () => dispatchNow("pause"),
    resume: () => dispatchNow("resume"),
    acknowledge: () => dispatchNow("acknowledge"),
    reset: () => dispatch({ type: "reset" }),
    setIntervalMinutes,
    notificationStatus,
    requestNotifications,
  };
}
