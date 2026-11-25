import { describe, expect, it } from "vitest";
import { REMINDER_MESSAGES } from "./messages";
import {
  createInitialState,
  formatDuration,
  formatIntervalLabel,
  isIntervalOption,
  reminderReducer,
  remainingMs,
  secondsToMs,
  type ReminderState,
} from "./reminder";

const INTERVAL = secondsToMs(1800);
const T0 = 1_000_000;
const MINUTE = secondsToMs(60);

function running(endsAt = T0 + INTERVAL, overrides: Partial<ReminderState> = {}): ReminderState {
  return { ...createInitialState(INTERVAL), status: "running", endsAt, ...overrides } as ReminderState;
}

describe("reminderReducer", () => {
  it("starts idle with the given interval and auto restart off", () => {
    expect(createInitialState(INTERVAL)).toEqual({
      status: "idle",
      intervalMs: INTERVAL,
      autoRestart: false,
      reminderCount: 0,
      lastReminderAt: null,
      messageIndex: null,
    });
  });

  it("start sets a deadline one interval from now", () => {
    const next = reminderReducer(createInitialState(INTERVAL), { type: "start", now: T0 });
    expect(next).toEqual(running(T0 + INTERVAL));
  });

  it("start is ignored when not idle", () => {
    const state = running();
    expect(reminderReducer(state, { type: "start", now: T0 + 5 })).toBe(state);
  });

  it("tick before the deadline keeps the same state object", () => {
    const state = running();
    expect(reminderReducer(state, { type: "tick", now: T0 + INTERVAL - 1, random: 0 })).toBe(state);
  });

  it("tick at the deadline makes the reminder due and records it", () => {
    const next = reminderReducer(running(), { type: "tick", now: T0 + INTERVAL, random: 0 });
    expect(next).toMatchObject({
      status: "due",
      reminderCount: 1,
      lastReminderAt: T0 + INTERVAL,
      messageIndex: 0,
    });
    expect(next).not.toHaveProperty("endsAt");
  });

  it("a single late tick (throttled background tab) still fires exactly one reminder", () => {
    const next = reminderReducer(running(), { type: "tick", now: T0 + 5 * INTERVAL, random: 0 });
    expect(next.status).toBe("due");
    expect(next.reminderCount).toBe(1);
  });

  it("with auto restart, tick at the deadline fires a reminder and starts the next cycle from now", () => {
    const state = running(T0 + INTERVAL, { autoRestart: true });
    const firedAt = T0 + INTERVAL + 400;
    const next = reminderReducer(state, { type: "tick", now: firedAt, random: 0 });
    expect(next).toMatchObject({
      status: "running",
      endsAt: firedAt + INTERVAL,
      reminderCount: 1,
      lastReminderAt: firedAt,
      messageIndex: 0,
    });
  });

  it("with auto restart, a long time away gives one reminder, not a burst", () => {
    const state = running(T0 + INTERVAL, { autoRestart: true });
    const back = T0 + 10 * INTERVAL;
    const next = reminderReducer(state, { type: "tick", now: back, random: 0 });
    expect(next.reminderCount).toBe(1);
    // The new deadline is in the future, so the very next tick does not fire again.
    expect(reminderReducer(next, { type: "tick", now: back + 1000, random: 0 })).toBe(next);
  });

  it("picks from the reminder's own number of messages", () => {
    let state = running(T0 + INTERVAL, { autoRestart: true });
    let now = T0 + INTERVAL;
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) {
      state = reminderReducer(state, { type: "tick", now, random: (i * 0.37) % 1, messageCount: 3 });
      seen.add(state.messageIndex!);
      now += INTERVAL;
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it("never picks the same message twice in a row", () => {
    let state = running(T0 + INTERVAL, { autoRestart: true });
    let now = T0 + INTERVAL;
    for (let i = 0; i < 20; i++) {
      const previous = state.messageIndex;
      state = reminderReducer(state, { type: "tick", now, random: 0.5 });
      expect(state.messageIndex).not.toBe(previous);
      now += INTERVAL;
    }
    expect(state.reminderCount).toBe(20);
  });

  it("pause keeps the time left, and resume sets a new deadline from it", () => {
    const paused = reminderReducer(running(), { type: "pause", now: T0 + 10 * MINUTE });
    expect(paused).toMatchObject({ status: "paused", remainingMs: 20 * MINUTE });

    // Time spent paused does not count.
    const resumedAt = T0 + 90 * MINUTE;
    const resumed = reminderReducer(paused, { type: "resume", now: resumedAt });
    expect(resumed).toEqual(running(resumedAt + 20 * MINUTE));
  });

  it("pause after the deadline is ignored, so the next tick fires the reminder", () => {
    const state = running();
    expect(reminderReducer(state, { type: "pause", now: T0 + INTERVAL + 1 })).toBe(state);
  });

  it("pause hides a recent auto-restart reminder", () => {
    const state = running(T0 + INTERVAL, { autoRestart: true, lastReminderAt: T0, messageIndex: 2 });
    const paused = reminderReducer(state, { type: "pause", now: T0 + 1000 });
    expect(paused.lastReminderAt).toBeNull();
  });

  it("acknowledge starts the next cycle from the acknowledge time and clears the reminder", () => {
    const due = reminderReducer(running(), { type: "tick", now: T0 + INTERVAL, random: 0 });
    const ackAt = T0 + 100 * MINUTE;
    const next = reminderReducer(due, { type: "acknowledge", now: ackAt });
    expect(next).toMatchObject({
      status: "running",
      endsAt: ackAt + INTERVAL,
      lastReminderAt: null,
      reminderCount: 1,
    });
  });

  it("acknowledge is ignored when nothing is due", () => {
    const state = running();
    expect(reminderReducer(state, { type: "acknowledge", now: T0 })).toBe(state);
  });

  it("reset goes back to idle and keeps the interval and auto restart", () => {
    const next = reminderReducer(running(T0 + INTERVAL, { autoRestart: true }), { type: "reset" });
    expect(next).toMatchObject({ status: "idle", intervalMs: INTERVAL, autoRestart: true });
    expect(next).not.toHaveProperty("endsAt");
  });

  it("setInterval applies only while idle and only for positive values", () => {
    const idle = createInitialState(INTERVAL);
    expect(reminderReducer(idle, { type: "setInterval", intervalMs: secondsToMs(30) })).toEqual(
      createInitialState(secondsToMs(30)),
    );
    expect(reminderReducer(idle, { type: "setInterval", intervalMs: 0 })).toBe(idle);
    expect(reminderReducer(idle, { type: "setInterval", intervalMs: Number.NaN })).toBe(idle);

    const state = running();
    expect(reminderReducer(state, { type: "setInterval", intervalMs: secondsToMs(30) })).toBe(state);
  });

  it("setAutoRestart works in any status and keeps the rest of the state", () => {
    const state = running();
    const next = reminderReducer(state, { type: "setAutoRestart", autoRestart: true });
    expect(next).toEqual({ ...state, autoRestart: true });
    expect(reminderReducer(next, { type: "setAutoRestart", autoRestart: true })).toBe(next);
  });
});

describe("remainingMs", () => {
  it("returns the time left for each status and is never negative", () => {
    expect(remainingMs(createInitialState(INTERVAL), T0)).toBe(INTERVAL);
    expect(remainingMs(running(), T0 + 1000)).toBe(INTERVAL - 1000);
    expect(remainingMs(running(), T0 + INTERVAL + 5000)).toBe(0);
    expect(
      remainingMs({ ...createInitialState(INTERVAL), status: "paused", remainingMs: 1234 }, T0),
    ).toBe(1234);
    expect(remainingMs({ ...createInitialState(INTERVAL), status: "due" }, T0)).toBe(0);
  });
});

describe("formatDuration", () => {
  it.each([
    [secondsToMs(1800), "30:00"],
    [secondsToMs(30), "00:30"],
    [secondsToMs(3600), "1:00:00"],
    [secondsToMs(5400) - 500, "1:30:00"],
    [secondsToMs(3599), "59:59"],
    [59_001, "01:00"],
    [1_500, "00:02"],
    [1, "00:01"],
    [0, "00:00"],
    [-500, "00:00"],
  ])("formats %d ms as %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe("interval options", () => {
  it("go from 30 seconds to 2 hours", () => {
    expect(isIntervalOption(30)).toBe(true);
    expect(isIntervalOption(1800)).toBe(true);
    expect(isIntervalOption(7200)).toBe(true);
    expect(isIntervalOption(15)).toBe(false);
    expect(isIntervalOption(10800)).toBe(false);
  });

  it.each([
    [30, "30 seconds"],
    [60, "1 minute"],
    [300, "5 minutes"],
    [1800, "30 minutes"],
    [3600, "1 hour"],
    [5400, "1.5 hours"],
    [7200, "2 hours"],
  ])("labels %d seconds as %s", (seconds, label) => {
    expect(formatIntervalLabel(seconds)).toBe(label);
  });
});

describe("messages", () => {
  it("has messages, including the three the user asked for", () => {
    expect(REMINDER_MESSAGES.length).toBeGreaterThan(5);
    const all = REMINDER_MESSAGES.join(" ");
    expect(all).toContain("I can see you");
    expect(all).toContain("Do what we agreed on");
    expect(all).toContain("Don't mess this up");
  });
});
