import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Alert } from "@/lib/alertChannels";
import { showNotification } from "@/lib/notifications";
import { remainingMs, type ReminderState } from "@/lib/reminder";
import {
  createCustomReminder,
  defaultMessages,
  defaultReminders,
  migrateLegacySettings,
  sanitizeReminders,
  type ReminderConfig,
} from "@/lib/reminders";
import {
  createSessionState,
  sessionReducer,
  sessionStatus,
  type ReminderPatch,
} from "@/lib/reminderSession";
import { readSetting, removeSetting, storageKey, writeSetting } from "@/lib/storage";

const REMINDERS_SETTING = "reminders";
// Settings from before custom reminders. Migrated into the posture reminder once.
const LEGACY_INTERVAL_SETTING = "interval-sec";
const LEGACY_AUTO_RESTART_SETTING = "auto-restart";

export const REMINDERS_STORAGE_KEY = storageKey(REMINDERS_SETTING);
/** How long the bubble stays up after a reminder that restarts by itself. */
export const REMINDER_VISIBLE_MS = 10_000;
const TICK_MS = 1000;

export type ActiveReminder = {
  config: ReminderConfig;
  timer: ReminderState;
  remainingMs: number;
  /** True while this reminder's message should be on screen. */
  visible: boolean;
  /** The message picked for the latest firing, or null. */
  message: string | null;
};

function loadSavedReminders(): ReminderConfig[] {
  const saved = readSetting(REMINDERS_SETTING);
  if (saved !== null) {
    try {
      return sanitizeReminders(JSON.parse(saved));
    } catch {
      // Corrupted JSON: start from the defaults instead of crashing.
      return defaultReminders();
    }
  }
  const interval = readSetting(LEGACY_INTERVAL_SETTING);
  const autoRestart = readSetting(LEGACY_AUTO_RESTART_SETTING);
  return migrateLegacySettings(
    interval === null ? null : Number(interval),
    autoRestart === null ? null : autoRestart === "true",
  );
}

function messageFor(config: ReminderConfig, timer: ReminderState): string | null {
  if (timer.messageIndex === null || config.messages.length === 0) return null;
  return config.messages[timer.messageIndex % config.messages.length];
}

export function notificationTitle(config: ReminderConfig): string {
  return `${config.emoji} ${config.name} · Karamel`;
}

/**
 * Connects the reminder session to the browser: loading and saving the list,
 * a 1-second tick while running (and an immediate re-check when the tab is
 * visible again), and one desktop notification per firing.
 */
type ReminderOptions = {
  /** Called once per firing, for the extra ways to remind (sound, speech, nudge). */
  onAlert?: (alert: Alert) => void;
  /** Skip the posture reminder if it fires now (smart mode with good posture, or camera-only mode). */
  skipPosture?: boolean;
  /** The camera watches posture instead of the timer (camera-only mode), so hide its countdown. */
  postureWatched?: boolean;
};

export function useReminders({ skipPosture = false, postureWatched = false, onAlert }: ReminderOptions = {}) {
  const [state, dispatch] = useReducer(sessionReducer, undefined, () => createSessionState());
  // Read by the 1-second tick, so the tick uses the latest rendered camera
  // reading without restarting the interval each time the reading changes.
  // The ref is updated after each render, so it can lag the camera by a few
  // milliseconds, which does not matter for posture.
  const skipPostureRef = useRef(skipPosture);
  useEffect(() => {
    skipPostureRef.current = skipPosture;
  }, [skipPosture]);
  const onAlertRef = useRef(onAlert);
  useEffect(() => {
    onAlertRef.current = onAlert;
  }, [onAlert]);
  // The clock is never read during render (the page is prerendered); every
  // action that starts a countdown sets it first.
  const [now, setNow] = useState(0);
  const notificationsRef = useRef(new Map<string, Notification>());
  const seenCountsRef = useRef(new Map<string, number>());

  const at = useCallback(() => {
    const t = Date.now();
    setNow(t);
    return t;
  }, []);

  useEffect(() => {
    dispatch({ type: "load", reminders: loadSavedReminders() });
  }, []);

  // Save after loading only, so the defaults never overwrite saved reminders.
  useEffect(() => {
    if (!state.loaded) return;
    writeSetting(REMINDERS_SETTING, JSON.stringify(state.reminders));
    removeSetting(LEGACY_INTERVAL_SETTING);
    removeSetting(LEGACY_AUTO_RESTART_SETTING);
  }, [state.loaded, state.reminders]);

  const status = sessionStatus(state);

  useEffect(() => {
    if (status !== "running") return;
    const tick = () =>
      dispatch({ type: "tick", now: at(), random: Math.random(), skipPosture: skipPostureRef.current });
    const id = window.setInterval(tick, TICK_MS);
    // Background tabs get throttled timers. Re-check as soon as the user is back.
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [status, at]);

  const closeNotification = useCallback((id: string) => {
    notificationsRef.current.get(id)?.close();
    notificationsRef.current.delete(id);
  }, []);

  // One notification (and one onAlert call) per firing. A new notification
  // replaces that reminder's previous one.
  useEffect(() => {
    for (const config of state.reminders) {
      const timer = state.timers[config.id];
      if (!timer) continue;
      const seen = seenCountsRef.current.get(config.id) ?? 0;
      const message = messageFor(config, timer);
      if (timer.reminderCount > seen && message !== null) {
        closeNotification(config.id);
        const notification = showNotification(message, notificationTitle(config));
        if (notification) notificationsRef.current.set(config.id, notification);
        onAlertRef.current?.({ title: `${config.emoji} ${config.name}`, message });
      }
      seenCountsRef.current.set(config.id, timer.reminderCount);
    }
  }, [state.reminders, state.timers, closeNotification]);

  useEffect(() => {
    const notifications = notificationsRef.current;
    return () => notifications.forEach((notification) => notification.close());
  }, []);

  const active: ActiveReminder[] = state.reminders
    .filter((config) => config.enabled && state.timers[config.id])
    .map((config) => {
      const timer = state.timers[config.id];
      const visible =
        timer.status === "due" ||
        (timer.status === "running" &&
          timer.lastReminderAt !== null &&
          now - timer.lastReminderAt < REMINDER_VISIBLE_MS);
      return { config, timer, remainingMs: remainingMs(timer, now), visible, message: messageFor(config, timer) };
    });

  /** True for the posture reminder while the camera watches posture instead of the timer. */
  const isWatched = (a: ActiveReminder) => postureWatched && a.config.kind === "posture";
  /** The reminder that fires next (not counting ones waiting for "Done" or watched by the camera). */
  const next =
    active
      .filter((a) => a.timer.status !== "due" && !isWatched(a))
      .sort((a, b) => a.remainingMs - b.remainingMs)[0] ?? null;
  /** Other running reminders, for the "Coming up" list. */
  const upcoming = active.filter((a) => a !== next && a.timer.status !== "due" && !isWatched(a));
  const due = active.filter((a) => a.timer.status === "due");
  /** The newest reminder on screen; its message goes in the speech bubble. */
  const latestVisible =
    active
      .filter((a) => a.visible && a.message !== null)
      .sort((a, b) => (b.timer.lastReminderAt ?? 0) - (a.timer.lastReminderAt ?? 0))[0] ?? null;

  const closeAll = () => notificationsRef.current.forEach((_, id) => closeNotification(id));

  return {
    reminders: state.reminders,
    active,
    status,
    next,
    upcoming,
    due,
    postureWatched: postureWatched && active.some((a) => a.config.kind === "posture"),
    skippedCount: state.skippedCount,
    /** True for a few seconds after a posture reminder was skipped. */
    skipNoteVisible: state.lastSkippedAt !== null && now - state.lastSkippedAt < REMINDER_VISIBLE_MS,
    latestVisible,
    message: latestVisible?.message ?? null,
    start: () => dispatch({ type: "start", now: at() }),
    pause: () => dispatch({ type: "pause", now: at() }),
    resume: () => dispatch({ type: "resume", now: at() }),
    reset: () => {
      closeAll();
      dispatch({ type: "reset" });
    },
    acknowledge: (id: string) => {
      closeNotification(id);
      dispatch({ type: "acknowledge", id, now: at() });
    },
    update: (id: string, patch: ReminderPatch) => dispatch({ type: "update", id, patch, now: at() }),
    restoreMessages: (config: ReminderConfig) =>
      dispatch({ type: "update", id: config.id, patch: { messages: defaultMessages(config) }, now: at() }),
    /** Adds a custom reminder and returns its id. */
    addCustom: () => {
      const reminder = createCustomReminder(crypto.randomUUID().slice(0, 8));
      dispatch({ type: "add", reminder, now: at() });
      return reminder.id;
    },
    remove: (id: string) => {
      closeNotification(id);
      dispatch({ type: "remove", id });
    },
  };
}
