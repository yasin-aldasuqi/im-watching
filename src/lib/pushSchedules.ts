import type { ReminderState } from "./reminder";
import type { ReminderConfig } from "./reminders";

/** What the push server needs for one reminder: the app's id and timing, never its name or text. */
export type PushSchedule = { reminderKey: string; firesInSeconds: number; intervalSeconds: number | null };

type Timed = { config: ReminderConfig; timer: ReminderState };

export type PushScheduleOptions = {
  /** While the camera watches posture, posture stays on the device: only the page knows how the user sits. */
  postureOnDevice: boolean;
};

function sent(active: readonly Timed[], { postureOnDevice }: PushScheduleOptions) {
  return active.flatMap(({ config, timer }) =>
    config.enabled && timer.status === "running" && !(postureOnDevice && config.kind === "posture")
      ? [{ config, endsAt: timer.endsAt }]
      : [],
  );
}

/**
 * The reminders the push server should fire: every running timer. Paused, idle, and
 * waiting-for-Done reminders have nothing to send.
 *
 * Times are relative ("in N seconds") and rounded up: when Karamel is open, its own
 * reminder fires first and the push arrives a moment later, replacing it (same tag).
 */
export function pushSchedules(active: readonly Timed[], now: number, options: PushScheduleOptions): PushSchedule[] {
  return sent(active, options).map(({ config, endsAt }) => ({
    reminderKey: config.id,
    firesInSeconds: Math.max(0, Math.ceil((endsAt - now) / 1000)),
    intervalSeconds: config.autoRestart ? config.intervalSec : null,
  }));
}

/**
 * Changes only when the schedule itself changes (start, pause, a firing, a new interval),
 * not every second, because it uses the absolute deadlines.
 */
export function scheduleSignature(active: readonly Timed[], options: PushScheduleOptions): string {
  return JSON.stringify(
    sent(active, options).map(({ config, endsAt }) => [config.id, endsAt, config.autoRestart ? config.intervalSec : null]),
  );
}
