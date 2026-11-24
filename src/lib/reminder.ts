/**
 * Posture reminder state machine.
 *
 * This module is pure: no timers, no DOM, no Date.now(), no Math.random().
 * The caller passes the current time (and a random number) in each action.
 * That keeps every transition easy to unit test.
 *
 * Time is tracked as a deadline (`endsAt`), not as a counter that is decreased
 * every second. Browsers throttle timers in background tabs, so a counter would
 * fall behind. With a deadline, a late tick still computes the right result.
 */

import { pickMessageIndex } from "./messages";

/** Interval choices, in seconds: 30 seconds up to 30 minutes. */
export const INTERVAL_OPTIONS_SEC = [30, 60, 120, 300, 600, 900, 1200, 1800] as const;
export const DEFAULT_INTERVAL_SEC = 1800;

export function secondsToMs(seconds: number): number {
  return seconds * 1000;
}

export function isIntervalOption(seconds: number): boolean {
  return (INTERVAL_OPTIONS_SEC as readonly number[]).includes(seconds);
}

/** "30 seconds", "1 minute", "5 minutes". */
export function formatIntervalLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = seconds / 60;
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

type BaseState = {
  intervalMs: number;
  /** When true, a new cycle starts right after each reminder. */
  autoRestart: boolean;
  /** How many reminders have fired. Goes up by one per reminder. */
  reminderCount: number;
  /** When the latest reminder fired, or null once it has been handled. */
  lastReminderAt: number | null;
  /** Index into REMINDER_MESSAGES for the latest reminder. */
  messageIndex: number | null;
};

export type ReminderState = BaseState &
  (
    | { status: "idle" }
    | { status: "running"; endsAt: number }
    | { status: "paused"; remainingMs: number }
    | { status: "due" }
  );

export type ReminderStatus = ReminderState["status"];

export type ReminderAction =
  | { type: "start"; now: number }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number }
  | { type: "tick"; now: number; random: number }
  | { type: "acknowledge"; now: number }
  | { type: "reset" }
  | { type: "setInterval"; intervalMs: number }
  | { type: "setAutoRestart"; autoRestart: boolean };

export function createInitialState(intervalMs: number, autoRestart = false): ReminderState {
  return {
    status: "idle",
    intervalMs,
    autoRestart,
    reminderCount: 0,
    lastReminderAt: null,
    messageIndex: null,
  };
}

/** Copies the shared fields, so fields of the old status never leak into the new one. */
function base(state: ReminderState): BaseState {
  const { intervalMs, autoRestart, reminderCount, lastReminderAt, messageIndex } = state;
  return { intervalMs, autoRestart, reminderCount, lastReminderAt, messageIndex };
}

export function reminderReducer(state: ReminderState, action: ReminderAction): ReminderState {
  const { intervalMs } = state;

  switch (action.type) {
    case "start":
      if (state.status !== "idle") return state;
      return { ...base(state), status: "running", endsAt: action.now + intervalMs };

    case "pause":
      if (state.status !== "running") return state;
      if (action.now >= state.endsAt) return state; // A tick will fire the reminder.
      return {
        ...base(state),
        status: "paused",
        remainingMs: state.endsAt - action.now,
        lastReminderAt: null,
      };

    case "resume":
      if (state.status !== "paused") return state;
      return { ...base(state), status: "running", endsAt: action.now + state.remainingMs };

    case "tick": {
      if (state.status !== "running" || action.now < state.endsAt) return state;
      const fired = {
        ...base(state),
        reminderCount: state.reminderCount + 1,
        lastReminderAt: action.now,
        messageIndex: pickMessageIndex(state.messageIndex, action.random),
      };
      if (state.autoRestart) {
        // The next deadline counts from now, not from the old deadline. After a
        // long time away (sleep, throttled tab) this gives one reminder, not a
        // burst of missed ones.
        return { ...fired, status: "running", endsAt: action.now + intervalMs };
      }
      // Without auto restart, wait until the user confirms they fixed their
      // posture, so nobody gets a pile of reminders while away from the desk.
      return { ...fired, status: "due" };
    }

    case "acknowledge":
      if (state.status !== "due") return state;
      return {
        ...base(state),
        status: "running",
        endsAt: action.now + intervalMs,
        lastReminderAt: null,
      };

    case "reset":
      return { ...base(state), status: "idle", lastReminderAt: null };

    case "setInterval":
      // The interval can only change while idle, so a running cycle never
      // jumps unexpectedly.
      if (state.status !== "idle" || !(action.intervalMs > 0)) return state;
      return { ...base(state), status: "idle", intervalMs: action.intervalMs };

    case "setAutoRestart":
      // Can change at any time. It applies the next time a cycle ends.
      if (state.autoRestart === action.autoRestart) return state;
      return { ...state, autoRestart: action.autoRestart };
  }
}

/** Time left in the current cycle, never negative. */
export function remainingMs(state: ReminderState, now: number): number {
  switch (state.status) {
    case "idle":
      return state.intervalMs;
    case "running":
      return Math.max(0, state.endsAt - now);
    case "paused":
      return state.remainingMs;
    case "due":
      return 0;
  }
}

/**
 * Formats milliseconds as "MM:SS". Seconds are rounded up, so the display
 * shows "00:00" only once the time is really up.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
