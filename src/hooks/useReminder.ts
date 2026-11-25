import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { REMINDER_MESSAGES } from "@/lib/messages";
import { showNotification } from "@/lib/notifications";
import { readSetting, storageKey, writeSetting } from "@/lib/storage";
import {
  DEFAULT_INTERVAL_SEC,
  createInitialState,
  isIntervalOption,
  reminderReducer,
  remainingMs,
  secondsToMs,
} from "@/lib/reminder";

const INTERVAL_SETTING = "interval-sec";
const AUTO_RESTART_SETTING = "auto-restart";
export const INTERVAL_STORAGE_KEY = storageKey(INTERVAL_SETTING);
export const AUTO_RESTART_STORAGE_KEY = storageKey(AUTO_RESTART_SETTING);

/** How long the bubble stays up after an automatic restart. */
export const REMINDER_VISIBLE_MS = 10_000;

const TICK_MS = 1000;

/**
 * Connects the pure reminder state machine to the browser: a 1-second tick
 * while running, an immediate re-check when the tab becomes visible again,
 * and an optional notification for each reminder. The parent component
 * handles the tab title, because more than one feature can change it.
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
    const seconds = Number(readSetting(INTERVAL_SETTING));
    if (isIntervalOption(seconds)) {
      dispatch({ type: "setInterval", intervalMs: secondsToMs(seconds) });
    }
    if (readSetting(AUTO_RESTART_SETTING) === "true") {
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

  const setIntervalSeconds = useCallback((seconds: number) => {
    if (!isIntervalOption(seconds)) return;
    dispatch({ type: "setInterval", intervalMs: secondsToMs(seconds) });
    writeSetting(INTERVAL_SETTING, String(seconds));
  }, []);

  const setAutoRestart = useCallback((autoRestart: boolean) => {
    dispatch({ type: "setAutoRestart", autoRestart });
    writeSetting(AUTO_RESTART_SETTING, String(autoRestart));
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
  };
}
