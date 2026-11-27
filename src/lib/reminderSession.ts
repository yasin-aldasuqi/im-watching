/**
 * Runs several reminders at once: the list of reminder settings plus one
 * timer per reminder. Each timer is the tested single-reminder state machine
 * from ./reminder; this module only coordinates them.
 *
 * Pure: the current time and a random number come in with the actions.
 */

import {
  createInitialState,
  isIntervalOption,
  reminderReducer,
  secondsToMs,
  type ReminderAction,
  type ReminderState,
} from "./reminder";
import { LIMITS, defaultReminders, isBuiltIn, sanitizeReminders, type ReminderConfig } from "./reminders";

export type SessionStatus = "idle" | "running" | "paused";

export type SessionState = {
  reminders: ReminderConfig[];
  timers: Record<string, ReminderState>;
  /** False until saved reminders were loaded, so defaults never overwrite saved data. */
  loaded: boolean;
  /** Posture reminders skipped because the camera saw good posture (or watches instead). */
  skippedCount: number;
  lastSkippedAt: number | null;
};

export type ReminderPatch = Partial<
  Pick<ReminderConfig, "name" | "emoji" | "enabled" | "intervalSec" | "autoRestart" | "messages">
>;

export type SessionAction =
  /**
   * `savedTimers`: the timers saved before Karamel was closed (untrusted), restored with
   * `restoreTimer` at time `now`. Missing or invalid ones start fresh.
   */
  | { type: "load"; reminders: ReminderConfig[]; savedTimers?: unknown; now?: number }
  | { type: "start"; now: number }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number }
  | { type: "reset" }
  /**
   * `skipPosture`: when the posture reminder is due at this tick, restart it
   * quietly instead of reminding (the camera sees good posture, or watches instead).
   */
  | { type: "tick"; now: number; random: number; skipPosture?: boolean }
  | { type: "acknowledge"; id: string; now: number }
  | { type: "update"; id: string; patch: ReminderPatch; now: number }
  | { type: "add"; reminder: ReminderConfig; now: number }
  | { type: "remove"; id: string };

function freshTimer(config: ReminderConfig): ReminderState {
  return createInitialState(secondsToMs(config.intervalSec), config.autoRestart);
}

function timersFor(reminders: ReminderConfig[]): Record<string, ReminderState> {
  return Object.fromEntries(reminders.map((r) => [r.id, freshTimer(r)]));
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * A timer saved before Karamel was closed, brought back at time `now`, or null when the
 * saved value is unusable (then the reminder starts fresh). Saved data is untrusted.
 *
 * Phones close apps in the background all the time, so a running session has to survive
 * that. If a deadline passed while Karamel was closed, there is no new alert now (with
 * push turned on, the push already reminded the user):
 * - a repeating reminder continues on the same beat (start + n × interval), which is also
 *   the beat the push server keeps;
 * - a one-time reminder waits for "Done".
 */
export function restoreTimer(config: ReminderConfig, saved: unknown, now: number): ReminderState | null {
  if (!config.enabled || typeof saved !== "object" || saved === null) return null;
  const t = saved as Record<string, unknown>;
  const intervalMs = secondsToMs(config.intervalSec);
  const { reminderCount, lastReminderAt, messageIndex } = t;
  if (typeof reminderCount !== "number" || !Number.isInteger(reminderCount) || reminderCount < 0) return null;
  if (lastReminderAt !== null && !isFiniteNumber(lastReminderAt)) return null;
  const base = {
    // The current settings win over saved ones.
    intervalMs,
    autoRestart: config.autoRestart,
    reminderCount,
    lastReminderAt,
    messageIndex:
      typeof messageIndex === "number" && Number.isInteger(messageIndex) && messageIndex >= 0 ? messageIndex : null,
  };

  switch (t.status) {
    case "idle":
      return { ...base, status: "idle" };
    case "paused":
      return isFiniteNumber(t.remainingMs) && t.remainingMs > 0 && t.remainingMs <= intervalMs
        ? { ...base, status: "paused", remainingMs: t.remainingMs }
        : null;
    case "due":
      // Only one-time reminders wait for "Done".
      return config.autoRestart ? null : { ...base, status: "due" };
    case "running": {
      const endsAt = t.endsAt;
      // More than one interval ahead: the data or the clock is off.
      if (!isFiniteNumber(endsAt) || endsAt - now > intervalMs) return null;
      if (endsAt > now) return { ...base, status: "running", endsAt };
      if (config.autoRestart) {
        const missed = Math.floor((now - endsAt) / intervalMs) + 1;
        return {
          ...base,
          status: "running",
          endsAt: endsAt + missed * intervalMs,
          reminderCount: reminderCount + missed,
          lastReminderAt: endsAt + (missed - 1) * intervalMs,
          messageIndex: base.messageIndex ?? 0,
        };
      }
      return {
        ...base,
        status: "due",
        reminderCount: reminderCount + 1,
        lastReminderAt: endsAt,
        messageIndex: base.messageIndex ?? 0,
      };
    }
    default:
      return null;
  }
}

export function createSessionState(reminders: ReminderConfig[] = defaultReminders()): SessionState {
  return { reminders, timers: timersFor(reminders), loaded: false, skippedCount: 0, lastSkippedAt: null };
}

/** running: some timer is counting or waiting for "Done". paused: some timer is paused. */
export function sessionStatus(state: SessionState): SessionStatus {
  const statuses = state.reminders.filter((r) => r.enabled).map((r) => state.timers[r.id]?.status);
  if (statuses.some((s) => s === "running" || s === "due")) return "running";
  if (statuses.some((s) => s === "paused")) return "paused";
  return "idle";
}

function withTimer(state: SessionState, id: string, action: ReminderAction): SessionState {
  const timer = state.timers[id];
  if (!timer) return state;
  const next = reminderReducer(timer, action);
  return next === timer ? state : { ...state, timers: { ...state.timers, [id]: next } };
}

function forEnabled(state: SessionState, action: (config: ReminderConfig) => ReminderAction): SessionState {
  return state.reminders
    .filter((r) => r.enabled)
    .reduce((s, config) => withTimer(s, config.id, action(config)), state);
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "load": {
      const reminders = sanitizeReminders(action.reminders);
      const saved =
        typeof action.savedTimers === "object" && action.savedTimers !== null
          ? (action.savedTimers as Record<string, unknown>)
          : {};
      const now = action.now ?? 0;
      const timers = Object.fromEntries(
        reminders.map((config) => [
          config.id,
          (Object.hasOwn(saved, config.id) && restoreTimer(config, saved[config.id], now)) || freshTimer(config),
        ]),
      );
      return { ...state, reminders, timers, loaded: true };
    }

    case "start":
      return forEnabled(state, () => ({ type: "start", now: action.now }));

    case "pause":
      return forEnabled(state, () => ({ type: "pause", now: action.now }));

    case "resume":
      // Paused timers continue; reminders turned on while paused start now.
      return forEnabled(state, (config) =>
        state.timers[config.id]?.status === "idle"
          ? { type: "start", now: action.now }
          : { type: "resume", now: action.now },
      );

    case "reset":
      return { ...forEnabled(state, () => ({ type: "reset" })), skippedCount: 0, lastSkippedAt: null };

    case "tick":
      return state.reminders
        .filter((r) => r.enabled)
        .reduce((s, config, i) => {
          const timer = s.timers[config.id];
          const wouldFire = timer?.status === "running" && action.now >= timer.endsAt;
          if (wouldFire && config.kind === "posture" && action.skipPosture) {
            // Restart the posture countdown quietly: no message, no notification.
            // Reset and start the same timer, so its message history is kept.
            const restarted = reminderReducer(reminderReducer(timer, { type: "reset" }), {
              type: "start",
              now: action.now,
            });
            return {
              ...s,
              timers: { ...s.timers, [config.id]: restarted },
              skippedCount: s.skippedCount + 1,
              lastSkippedAt: action.now,
            };
          }
          return withTimer(s, config.id, {
            type: "tick",
            now: action.now,
            // A different random number per reminder, derived from the one given.
            random: (action.random + i * 0.618_033_988_75) % 1,
            messageCount: config.messages.length,
          });
        }, state);

    case "acknowledge":
      return withTimer(state, action.id, { type: "acknowledge", now: action.now });

    case "update": {
      const index = state.reminders.findIndex((r) => r.id === action.id);
      if (index === -1) return state;
      const before = state.reminders[index];
      // An invalid interval is ignored, so the reminder keeps its current one.
      if (action.patch.intervalSec !== undefined && !isIntervalOption(action.patch.intervalSec)) {
        return state;
      }
      // Built-in names and emoji stay fixed; sanitizing also applies all limits.
      const patch = isBuiltIn(before.kind) ? { ...action.patch, name: undefined, emoji: undefined } : action.patch;
      const merged = { ...before, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
      const after = sanitizeReminders([...state.reminders.slice(0, index), merged, ...state.reminders.slice(index + 1)])
        .find((r) => r.id === action.id)!;
      const reminders = state.reminders.map((r) => (r.id === action.id ? after : r));

      const timingChanged =
        before.enabled !== after.enabled ||
        before.intervalSec !== after.intervalSec ||
        before.autoRestart !== after.autoRestart;
      if (!timingChanged) return { ...state, reminders };

      // Restart only this reminder's timer with its new settings. If the
      // session is running, an enabled reminder starts counting right away.
      const running = sessionStatus(state) === "running";
      let timer = freshTimer(after);
      if (after.enabled && running) timer = reminderReducer(timer, { type: "start", now: action.now });
      return { ...state, reminders, timers: { ...state.timers, [after.id]: timer } };
    }

    case "add": {
      const customs = state.reminders.filter((r) => r.kind === "custom").length;
      if (customs >= LIMITS.customReminders || state.timers[action.reminder.id]) return state;
      const [added] = sanitizeReminders([...state.reminders, action.reminder]).filter(
        (r) => r.id === action.reminder.id,
      );
      if (!added) return state;
      let timer = freshTimer(added);
      if (added.enabled && sessionStatus(state) === "running") {
        timer = reminderReducer(timer, { type: "start", now: action.now });
      }
      return { ...state, reminders: [...state.reminders, added], timers: { ...state.timers, [added.id]: timer } };
    }

    case "remove": {
      const target = state.reminders.find((r) => r.id === action.id);
      if (!target || isBuiltIn(target.kind)) return state;
      const timers = { ...state.timers };
      delete timers[action.id];
      return { ...state, reminders: state.reminders.filter((r) => r.id !== action.id), timers };
    }
  }
}
