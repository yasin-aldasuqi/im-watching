import { describe, expect, it } from "vitest";
import { secondsToMs } from "./reminder";
import { LIMITS, createCustomReminder, defaultReminders } from "./reminders";
import { createSessionState, sessionReducer, sessionStatus, type SessionState } from "./reminderSession";

const T0 = 1_000_000;
const MIN = secondsToMs(60);

function act(state: SessionState, ...actions: Parameters<typeof sessionReducer>[1][]): SessionState {
  return actions.reduce(sessionReducer, state);
}

/** Posture (30 min, waits for Done) and water (45 min, restarts by itself) turned on. */
function postureAndWater(): SessionState {
  return act(createSessionState(), { type: "update", id: "water", patch: { enabled: true }, now: T0 });
}

describe("session basics", () => {
  it("starts idle, with an idle timer for every reminder, and not loaded", () => {
    const state = createSessionState();
    expect(sessionStatus(state)).toBe("idle");
    expect(Object.keys(state.timers)).toEqual(["posture", "water", "eyes", "stretch"]);
    expect(Object.values(state.timers).every((t) => t.status === "idle")).toBe(true);
    expect(state.loaded).toBe(false);
  });

  it("load cleans the saved list and marks the session loaded", () => {
    const state = act(createSessionState(), {
      type: "load",
      reminders: [{ id: "eyes", enabled: true, intervalSec: 7 } as never, { id: "custom-a", name: "A" } as never],
    });
    expect(state.loaded).toBe(true);
    expect(state.reminders.map((r) => r.id)).toEqual(["posture", "water", "eyes", "stretch", "custom-a"]);
    expect(state.reminders.find((r) => r.id === "eyes")).toMatchObject({ enabled: true, intervalSec: 1200 });
    expect(state.timers["custom-a"].status).toBe("idle");
  });

  it("start runs only the reminders that are turned on", () => {
    const state = act(createSessionState(), { type: "start", now: T0 });
    expect(sessionStatus(state)).toBe("running");
    expect(state.timers.posture).toMatchObject({ status: "running", endsAt: T0 + 30 * MIN });
    expect(state.timers.water.status).toBe("idle");
  });

  it("pause, resume, and reset apply to every running reminder", () => {
    let state = act(postureAndWater(), { type: "start", now: T0 }, { type: "pause", now: T0 + 10 * MIN });
    expect(sessionStatus(state)).toBe("paused");
    expect(state.timers.posture).toMatchObject({ status: "paused", remainingMs: 20 * MIN });
    expect(state.timers.water).toMatchObject({ status: "paused", remainingMs: 35 * MIN });

    state = act(state, { type: "resume", now: T0 + 60 * MIN });
    expect(state.timers.posture).toMatchObject({ status: "running", endsAt: T0 + 80 * MIN });

    state = act(state, { type: "reset" });
    expect(sessionStatus(state)).toBe("idle");
  });
});

describe("ticking several reminders", () => {
  it("fires each reminder at its own time, with its own restart rule", () => {
    let state = act(postureAndWater(), { type: "start", now: T0 });

    state = act(state, { type: "tick", now: T0 + 30 * MIN, random: 0 });
    expect(state.timers.posture.status).toBe("due");
    expect(state.timers.water.status).toBe("running");

    state = act(state, { type: "tick", now: T0 + 45 * MIN, random: 0 });
    // Water restarts by itself; posture is still waiting for "Done".
    expect(state.timers.water).toMatchObject({ status: "running", endsAt: T0 + 90 * MIN, reminderCount: 1 });
    expect(state.timers.posture.status).toBe("due");
  });

  it("picks messages from each reminder's own list", () => {
    let state = act(
      postureAndWater(),
      { type: "update", id: "water", patch: { messages: ["A", "B"], intervalSec: 60 }, now: T0 },
      { type: "start", now: T0 },
    );
    for (let i = 1; i <= 20; i++) {
      state = act(state, { type: "tick", now: T0 + i * MIN, random: (i * 0.29) % 1 });
      expect(state.timers.water.messageIndex).toBeLessThan(2);
    }
  });

  it("does not tick reminders that are turned off", () => {
    const state = act(createSessionState(), { type: "start", now: T0 }, { type: "tick", now: T0 + 999 * MIN, random: 0 });
    expect(state.timers.water.reminderCount).toBe(0);
  });

  it("acknowledge restarts only that reminder", () => {
    let state = act(postureAndWater(), { type: "start", now: T0 }, { type: "tick", now: T0 + 30 * MIN, random: 0 });
    const water = state.timers.water;
    state = act(state, { type: "acknowledge", id: "posture", now: T0 + 31 * MIN });
    expect(state.timers.posture).toMatchObject({ status: "running", endsAt: T0 + 61 * MIN });
    expect(state.timers.water).toBe(water);
  });
});

describe("changing a reminder", () => {
  it("turning one on while running starts it now; turning it off stops it", () => {
    let state = act(createSessionState(), { type: "start", now: T0 });
    state = act(state, { type: "update", id: "eyes", patch: { enabled: true }, now: T0 + 5 * MIN });
    expect(state.timers.eyes).toMatchObject({ status: "running", endsAt: T0 + 25 * MIN });

    state = act(state, { type: "update", id: "eyes", patch: { enabled: false }, now: T0 + 6 * MIN });
    expect(state.timers.eyes.status).toBe("idle");
  });

  it("turning one on while paused starts it on resume", () => {
    let state = act(createSessionState(), { type: "start", now: T0 }, { type: "pause", now: T0 + MIN });
    state = act(state, { type: "update", id: "eyes", patch: { enabled: true }, now: T0 + 2 * MIN });
    expect(state.timers.eyes.status).toBe("idle");
    state = act(state, { type: "resume", now: T0 + 3 * MIN });
    expect(state.timers.eyes).toMatchObject({ status: "running", endsAt: T0 + 23 * MIN });
  });

  it("changing the interval restarts only that reminder, even while running", () => {
    let state = act(postureAndWater(), { type: "start", now: T0 });
    const posture = state.timers.posture;
    state = act(state, { type: "update", id: "water", patch: { intervalSec: 3600 }, now: T0 + 10 * MIN });
    expect(state.timers.water).toMatchObject({ status: "running", endsAt: T0 + 70 * MIN, intervalMs: 60 * MIN });
    expect(state.timers.posture).toBe(posture);
  });

  it("ignores an invalid interval and keeps the current one", () => {
    const state = postureAndWater();
    expect(act(state, { type: "update", id: "water", patch: { intervalSec: 7 }, now: T0 })).toBe(state);
  });

  it("changing only the messages does not restart the timer", () => {
    let state = act(createSessionState(), { type: "start", now: T0 });
    const timer = state.timers.posture;
    state = act(state, { type: "update", id: "posture", patch: { messages: ["Sit!"] }, now: T0 + MIN });
    expect(state.reminders[0].messages).toEqual(["Sit!"]);
    expect(state.timers.posture).toBe(timer);
  });

  it("an empty message list falls back to the default messages", () => {
    const state = act(createSessionState(), { type: "update", id: "posture", patch: { messages: [] }, now: T0 });
    expect(state.reminders[0].messages).toEqual(defaultReminders()[0].messages);
  });

  it("does not rename built-in reminders, but does rename custom ones", () => {
    let state = act(createSessionState(), { type: "update", id: "water", patch: { name: "Hacked", emoji: "💀" }, now: T0 });
    expect(state.reminders[1]).toMatchObject({ name: "Drink water", emoji: "💧" });

    state = act(state, { type: "add", reminder: createCustomReminder("a"), now: T0 });
    state = act(state, { type: "update", id: "custom-a", patch: { name: "  Call mom ", emoji: "📞" }, now: T0 });
    expect(state.reminders.at(-1)).toMatchObject({ name: "Call mom", emoji: "📞" });
  });
});

describe("custom reminders", () => {
  it("can be added, and start right away if the session is running", () => {
    let state = act(createSessionState(), { type: "start", now: T0 });
    state = act(state, { type: "add", reminder: createCustomReminder("a"), now: T0 + MIN });
    expect(state.reminders.at(-1)!.id).toBe("custom-a");
    expect(state.timers["custom-a"]).toMatchObject({ status: "running", endsAt: T0 + 31 * MIN });
  });

  it("are limited in number and must have unique ids", () => {
    let state = createSessionState();
    for (let i = 0; i < LIMITS.customReminders + 5; i++) {
      state = act(state, { type: "add", reminder: createCustomReminder(String(i)), now: T0 });
    }
    expect(state.reminders.filter((r) => r.kind === "custom")).toHaveLength(LIMITS.customReminders);
    expect(act(state, { type: "add", reminder: createCustomReminder("0"), now: T0 })).toBe(state);
  });

  it("can be removed, but built-in reminders cannot", () => {
    let state = act(createSessionState(), { type: "add", reminder: createCustomReminder("a"), now: T0 });
    state = act(state, { type: "remove", id: "custom-a" });
    expect(state.reminders.map((r) => r.id)).toEqual(["posture", "water", "eyes", "stretch"]);
    expect(state.timers).not.toHaveProperty("custom-a");
    expect(act(state, { type: "remove", id: "posture" })).toBe(state);
  });
});
