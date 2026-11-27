import { describe, expect, it } from "vitest";
import { secondsToMs } from "./reminder";
import { defaultReminders } from "./reminders";
import { createSessionState, sessionReducer } from "./reminderSession";
import { pushSchedules, scheduleSignature } from "./pushSchedules";

const T0 = 1_000_000;
const MIN = secondsToMs(60);

/** Posture (30 min, waits for Done), water (45 min, restarts by itself), and eyes (off). */
function session() {
  const reminders = defaultReminders().map((r) => (r.id === "water" ? { ...r, enabled: true } : r));
  return sessionReducer(createSessionState(), { type: "load", reminders });
}
const timed = (state: ReturnType<typeof session>) =>
  state.reminders.map((config) => ({ config, timer: state.timers[config.id] }));

describe("push schedules", () => {
  it("lists running reminders with their time left (rounded up) and how they repeat", () => {
    const state = sessionReducer(session(), { type: "start", now: T0 });
    expect(pushSchedules(timed(state), T0 + 10 * MIN + 500, { postureOnDevice: false })).toEqual([
      { reminderKey: "posture", firesInSeconds: 20 * 60, intervalSeconds: null },
      { reminderKey: "water", firesInSeconds: 35 * 60, intervalSeconds: 45 * 60 },
    ]);
  });

  it("sends nothing for idle, paused, or waiting-for-Done reminders", () => {
    expect(pushSchedules(timed(session()), T0, { postureOnDevice: false })).toEqual([]);
    const paused = sessionReducer(sessionReducer(session(), { type: "start", now: T0 }), { type: "pause", now: T0 + MIN });
    expect(pushSchedules(timed(paused), T0 + MIN, { postureOnDevice: false })).toEqual([]);
    let due = sessionReducer(session(), { type: "start", now: T0 });
    due = sessionReducer(due, { type: "tick", now: T0 + 30 * MIN, random: 0 });
    expect(due.timers.posture.status).toBe("due");
    expect(pushSchedules(timed(due), T0 + 30 * MIN, { postureOnDevice: false }).map((s) => s.reminderKey)).toEqual([
      "water",
    ]);
  });

  it("keeps posture on the device while the camera watches it", () => {
    const state = sessionReducer(session(), { type: "start", now: T0 });
    expect(pushSchedules(timed(state), T0, { postureOnDevice: true }).map((s) => s.reminderKey)).toEqual(["water"]);
  });

  it("has a signature that stays the same while time passes and changes when the schedule does", () => {
    const running = sessionReducer(session(), { type: "start", now: T0 });
    const signature = scheduleSignature(timed(running), { postureOnDevice: false });
    const later = sessionReducer(running, { type: "tick", now: T0 + 5 * MIN, random: 0 });
    expect(scheduleSignature(timed(later), { postureOnDevice: false })).toBe(signature);
    const paused = sessionReducer(running, { type: "pause", now: T0 + 5 * MIN });
    expect(scheduleSignature(timed(paused), { postureOnDevice: false })).not.toBe(signature);
    expect(scheduleSignature(timed(running), { postureOnDevice: true })).not.toBe(signature);
  });
});
