import type { useReminder } from "@/hooks/useReminder";
import {
  INTERVAL_OPTIONS_SEC,
  formatDuration,
  formatIntervalLabel,
  type ReminderStatus,
} from "@/lib/reminder";
import { primaryButton, secondaryButton } from "./buttons";

const STATUS_MESSAGES: Record<ReminderStatus, string> = {
  idle: "Pick an interval and press Start.",
  running: "I'm watching. Keep that back straight.",
  paused: "Paused. I'll wait for you.",
  due: "Fix your posture, then press “I'm sitting tall”.",
};

/** The timer controls. The state lives in PostureBuddy. */
export default function ReminderPanel({ reminder }: { reminder: ReturnType<typeof useReminder> }) {
  const { status, message } = reminder;

  return (
    <section className="flex w-full max-w-md flex-col items-center gap-5" aria-label="Posture reminder">
      <p className="font-mono text-5xl font-semibold tabular-nums" data-testid="countdown">
        {formatDuration(reminder.remainingMs)}
      </p>

      <p role="status" data-testid="reminder-status" className="min-h-6 text-stone-600 dark:text-stone-300">
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

      <label className="flex items-center gap-2 text-sm">
        Remind me every
        <select
          className="rounded-md border border-stone-300 bg-transparent px-2 py-1 disabled:opacity-60 dark:border-stone-600"
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

      <div className="flex flex-col items-center gap-1">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            role="switch"
            className="h-4 w-4 accent-orange-700"
            checked={reminder.autoRestart}
            onChange={(event) => reminder.setAutoRestart(event.target.checked)}
          />
          Restart automatically
        </label>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          {reminder.autoRestart
            ? "The next countdown starts right after each reminder."
            : "After each reminder, I wait until you press “I'm sitting tall”."}
        </p>
      </div>
    </section>
  );
}
