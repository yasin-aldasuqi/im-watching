import { describe, expect, it } from "vitest";
import {
  createInitialState,
  formatDuration,
  isIntervalOption,
  minutesToMs,
  reminderReducer,
  remainingMs,
  type ReminderState,
} from "./reminder";

const INTERVAL = minutesToMs(30);
const T0 = 1_000_000;

function running(endsAt = T0 + INTERVAL): ReminderState {
  return { status: "running", intervalMs: INTERVAL, endsAt };
}

describe("reminderReducer", () => {
  it("starts idle with the given interval", () => {
    expect(createInitialState(INTERVAL)).toEqual({ status: "idle", intervalMs: INTERVAL });
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
    expect(reminderReducer(state, { type: "tick", now: T0 + INTERVAL - 1 })).toBe(state);
  });

  it("tick at the deadline makes the reminder due", () => {
    const next = reminderReducer(running(), { type: "tick", now: T0 + INTERVAL });
    expect(next).toEqual({ status: "due", intervalMs: INTERVAL });
  });

  it("a single late tick (throttled background tab) still makes the reminder due", () => {
    const next = reminderReducer(running(), { type: "tick", now: T0 + minutesToMs(45) });
    expect(next.status).toBe("due");
  });

  it("pause keeps the time left, and resume sets a new deadline from it", () => {
    const paused = reminderReducer(running(), { type: "pause", now: T0 + minutesToMs(10) });
    expect(paused).toEqual({ status: "paused", intervalMs: INTERVAL, remainingMs: minutesToMs(20) });

    // Time spent paused does not count.
    const resumedAt = T0 + minutesToMs(90);
    const resumed = reminderReducer(paused, { type: "resume", now: resumedAt });
    expect(resumed).toEqual(running(resumedAt + minutesToMs(20)));
  });

  it("pause after the deadline makes the reminder due instead", () => {
    const next = reminderReducer(running(), { type: "pause", now: T0 + INTERVAL + 1 });
    expect(next.status).toBe("due");
  });

  it("acknowledge starts the next cycle from the acknowledge time", () => {
    const due: ReminderState = { status: "due", intervalMs: INTERVAL };
    const ackAt = T0 + minutesToMs(100);
    expect(reminderReducer(due, { type: "acknowledge", now: ackAt })).toEqual(running(ackAt + INTERVAL));
  });

  it("acknowledge is ignored when nothing is due", () => {
    const state = running();
    expect(reminderReducer(state, { type: "acknowledge", now: T0 })).toBe(state);
  });

  it("reset goes back to idle and keeps the interval", () => {
    expect(reminderReducer(running(), { type: "reset" })).toEqual(createInitialState(INTERVAL));
  });

  it("setInterval applies only while idle and only for positive values", () => {
    const idle = createInitialState(INTERVAL);
    expect(reminderReducer(idle, { type: "setInterval", intervalMs: minutesToMs(15) })).toEqual(
      createInitialState(minutesToMs(15)),
    );
    expect(reminderReducer(idle, { type: "setInterval", intervalMs: 0 })).toBe(idle);
    expect(reminderReducer(idle, { type: "setInterval", intervalMs: Number.NaN })).toBe(idle);

    const state = running();
    expect(reminderReducer(state, { type: "setInterval", intervalMs: minutesToMs(15) })).toBe(state);
  });
});

describe("remainingMs", () => {
  it("returns the time left for each status and is never negative", () => {
    expect(remainingMs(createInitialState(INTERVAL), T0)).toBe(INTERVAL);
    expect(remainingMs(running(), T0 + 1000)).toBe(INTERVAL - 1000);
    expect(remainingMs(running(), T0 + INTERVAL + 5000)).toBe(0);
    expect(remainingMs({ status: "paused", intervalMs: INTERVAL, remainingMs: 1234 }, T0)).toBe(1234);
    expect(remainingMs({ status: "due", intervalMs: INTERVAL }, T0)).toBe(0);
  });
});

describe("formatDuration", () => {
  it.each([
    [minutesToMs(30), "30:00"],
    [minutesToMs(60), "60:00"],
    [59_001, "01:00"],
    [1_500, "00:02"],
    [1, "00:01"],
    [0, "00:00"],
    [-500, "00:00"],
  ])("formats %d ms as %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe("isIntervalOption", () => {
  it("accepts only the offered intervals", () => {
    expect(isIntervalOption(30)).toBe(true);
    expect(isIntervalOption(7)).toBe(false);
  });
});
