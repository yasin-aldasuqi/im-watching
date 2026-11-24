"use client";

import type { ReactNode } from "react";
import { useReminder } from "@/hooks/useReminder";
import {
  INTERVAL_OPTIONS_SEC,
  formatDuration,
  formatIntervalLabel,
  type ReminderStatus,
} from "@/lib/reminder";

const STATUS_MESSAGES: Record<ReminderStatus, string> = {
  idle: "Pick an interval and press Start.",
  running: "I'm watching. Keep that back straight.",
  paused: "Paused. I'll wait for you.",
  due: "Fix your posture, then press “I'm sitting tall”.",
};

const primaryButton =
  "rounded-full bg-orange-700 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700";
const secondaryButton =
  "rounded-full border border-stone-300 px-6 py-2.5 font-semibold transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 dark:border-stone-600 dark:hover:bg-stone-800";

type ReminderPanelProps = {
  /** The mascot. Passed in so it can stay a Server Component. */
  children: ReactNode;
};

export default function ReminderPanel({ children }: ReminderPanelProps) {
  const reminder = useReminder();
  const { status, message } = reminder;

  return (
    <section className="flex w-full max-w-md flex-col items-center gap-5" aria-label="Posture reminder">
      <div className="kitten-stage flex flex-col items-center" data-reminding={reminder.reminderVisible}>
        {/* The bubble has its own reserved space, so it never covers other text,
            never goes past the screen edge, and the page does not jump when it appears. */}
        <div className="mb-3 flex min-h-16 items-end justify-center">
          {message && (
            <div
              aria-hidden="true"
              data-testid="speech-bubble"
              className="relative max-w-72 rounded-2xl bg-white px-4 py-2 text-center text-sm font-semibold shadow-md after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-transparent after:border-t-white dark:bg-stone-800 dark:after:border-t-stone-800"
            >
              {message}
            </div>
          )}
        </div>
        {children}
      </div>

      <p className="font-mono text-5xl font-semibold tabular-nums" data-testid="countdown">
        {formatDuration(reminder.remainingMs)}
      </p>

      <p role="status" className="min-h-6 text-stone-600 dark:text-stone-300">
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

      <NotificationControl
        status={reminder.notificationStatus}
        onEnable={reminder.requestNotifications}
      />
    </section>
  );
}

function NotificationControl({
  status,
  onEnable,
}: {
  status: ReturnType<typeof useReminder>["notificationStatus"];
  onEnable: () => void;
}) {
  const note = "text-sm text-stone-500 dark:text-stone-400";
  switch (status) {
    case "unsupported":
      return null;
    case "default":
      return (
        <button type="button" className={`${secondaryButton} text-sm`} onClick={onEnable}>
          Enable notifications
        </button>
      );
    case "granted":
      return <p className={note}>Desktop notifications are on.</p>;
    case "denied":
      return <p className={note}>Notifications are blocked in your browser settings.</p>;
  }
}
