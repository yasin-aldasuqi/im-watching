/**
 * Posture reminder state machine.
 *
 * This module is pure: no timers, no DOM, no Date.now(). The caller passes the
 * current time in each action. That keeps every transition easy to unit test.
 *
 * Time is tracked as a deadline (`endsAt`), not as a counter that is decreased
 * every second. Browsers throttle timers in background tabs, so a counter would
 * fall behind. With a deadline, a late tick still computes the right result.
 */

export const INTERVAL_OPTIONS_MIN = [15, 20, 30, 45, 60] as const;
export const DEFAULT_INTERVAL_MIN = 30;

const MS_PER_MINUTE = 60_000;

export function minutesToMs(minutes: number): number {
  return minutes * MS_PER_MINUTE;
}

export function isIntervalOption(minutes: number): boolean {
  return (INTERVAL_OPTIONS_MIN as readonly number[]).includes(minutes);
}

export type ReminderState =
  | { status: "idle"; intervalMs: number }
  | { status: "running"; intervalMs: number; endsAt: number }
  | { status: "paused"; intervalMs: number; remainingMs: number }
  | { status: "due"; intervalMs: number };

export type ReminderAction =
  | { type: "start"; now: number }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number }
  | { type: "tick"; now: number }
  | { type: "acknowledge"; now: number }
  | { type: "reset" }
  | { type: "setInterval"; intervalMs: number };

export function createInitialState(intervalMs: number): ReminderState {
  return { status: "idle", intervalMs };
}

export function reminderReducer(state: ReminderState, action: ReminderAction): ReminderState {
  const { intervalMs } = state;

  switch (action.type) {
    case "start":
      if (state.status !== "idle") return state;
      return { status: "running", intervalMs, endsAt: action.now + intervalMs };

    case "pause":
      if (state.status !== "running") return state;
      if (action.now >= state.endsAt) return { status: "due", intervalMs };
      return { status: "paused", intervalMs, remainingMs: state.endsAt - action.now };

    case "resume":
      if (state.status !== "paused") return state;
      return { status: "running", intervalMs, endsAt: action.now + state.remainingMs };

    case "tick":
      if (state.status !== "running" || action.now < state.endsAt) return state;
      return { status: "due", intervalMs };

    case "acknowledge":
      // The next cycle starts only when the user confirms they fixed their
      // posture, so nobody gets a pile of reminders while away from the desk.
      if (state.status !== "due") return state;
      return { status: "running", intervalMs, endsAt: action.now + intervalMs };

    case "reset":
      return createInitialState(intervalMs);

    case "setInterval":
      // The interval can only change while idle, so a running cycle never
      // jumps unexpectedly.
      if (state.status !== "idle" || !(action.intervalMs > 0)) return state;
      return createInitialState(action.intervalMs);
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
