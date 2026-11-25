import type { useReminder } from "@/hooks/useReminder";
import {
  INTERVAL_OPTIONS_SEC,
  formatDuration,
  formatIntervalLabel,
  type ReminderStatus,
} from "@/lib/reminder";
import { primaryButton, secondaryButton } from "./styles";

type Reminder = ReturnType<typeof useReminder>;

const STATUS_MESSAGES: Record<ReminderStatus, string> = {
  idle: "Pick an interval and press Start.",
  running: "I'm watching. Keep that back straight.",
  paused: "Paused. I'll wait for you.",
  due: "Fix your posture, then press “I'm sitting tall”.",
};

/** The big countdown, its status, and the main buttons. The state lives in PostureBuddy. */
export function ReminderTimer({ reminder }: { reminder: Reminder }) {
  const { status, message } = reminder;

  return (
    <div className="flex flex-col items-center gap-4" aria-label="Posture reminder" role="group">
      <p
        className="font-display text-6xl font-semibold tabular-nums tracking-tight sm:text-7xl"
        data-testid="countdown"
      >
        {formatDuration(reminder.remainingMs)}
      </p>

      <p role="status" data-testid="reminder-status" className="min-h-6 text-soft">
        {/* Screen readers also hear the kitten's message, which is only shown visually in the bubble. */}
        {message && <span className="sr-only">{message} </span>}
        {STATUS_MESSAGES[status]}
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        {status === "idle" && (
          <button type="button" className={primaryButton} onClick={reminder.start}>
            Start
          </button>
        )}
        {status === "running" && (
          <button type="button" className={primaryButton} onClick={reminder.pause}>
            Pause
          </button>
        )}
        {status === "paused" && (
          <button type="button" className={primaryButton} onClick={reminder.resume}>
            Resume
          </button>
        )}
        {status === "due" && (
          <button type="button" className={primaryButton} onClick={reminder.acknowledge}>
            I&apos;m sitting tall
          </button>
        )}
        {status !== "idle" && (
          <button type="button" className={secondaryButton} onClick={reminder.reset}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

/** Interval and auto-restart settings. */
export function ReminderSettings({ reminder }: { reminder: Reminder }) {
  const { status } = reminder;

  return (
    <div className="flex flex-col gap-4 text-left">
      <label className="flex items-center justify-between gap-3">
        <span className="font-semibold">Remind me every</span>
        <select
          className="rounded-xl border border-line bg-bg px-3 py-1.5 font-semibold disabled:opacity-60"
          value={reminder.intervalSeconds}
          disabled={status !== "idle"}
          onChange={(event) => reminder.setIntervalSeconds(Number(event.target.value))}
        >
          {INTERVAL_OPTIONS_SEC.map((seconds) => (
            <option key={seconds} value={seconds}>
              {formatIntervalLabel(seconds)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <label className="flex items-center justify-between gap-3">
          <span className="font-semibold">Restart automatically</span>
          <input
            type="checkbox"
            role="switch"
            className="h-5 w-5 accent-accent"
            checked={reminder.autoRestart}
            onChange={(event) => reminder.setAutoRestart(event.target.checked)}
          />
        </label>
        <p className="text-sm text-soft">
          {reminder.autoRestart
            ? "The next countdown starts right after each reminder."
            : "After each reminder, I wait until you press “I'm sitting tall”."}
        </p>
      </div>
    </div>
  );
}
