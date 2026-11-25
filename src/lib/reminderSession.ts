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
};

export type ReminderPatch = Partial<
  Pick<ReminderConfig, "name" | "emoji" | "enabled" | "intervalSec" | "autoRestart" | "messages">
>;

export type SessionAction =
  | { type: "load"; reminders: ReminderConfig[] }
  | { type: "start"; now: number }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number }
  | { type: "reset" }
  | { type: "tick"; now: number; random: number }
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

export function createSessionState(reminders: ReminderConfig[] = defaultReminders()): SessionState {
  return { reminders, timers: timersFor(reminders), loaded: false };
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
      return { reminders, timers: timersFor(reminders), loaded: true };
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
      return forEnabled(state, () => ({ type: "reset" }));

    case "tick":
      return state.reminders
        .filter((r) => r.enabled)
        .reduce(
          (s, config, i) =>
            withTimer(s, config.id, {
              type: "tick",
              now: action.now,
              // A different random number per reminder, derived from the one given.
              random: (action.random + i * 0.618_033_988_75) % 1,
              messageCount: config.messages.length,
            }),
          state,
        );

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
