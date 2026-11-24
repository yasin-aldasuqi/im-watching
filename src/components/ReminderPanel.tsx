"use client";

import type { ReactNode } from "react";
import { useReminder } from "@/hooks/useReminder";
import { INTERVAL_OPTIONS_MIN, formatDuration, type ReminderState } from "@/lib/reminder";

const STATUS_MESSAGES: Record<ReminderState["status"], string> = {
  idle: "Pick an interval and press Start.",
  running: "I'm watching. Keep that back straight.",
  paused: "Paused. I'll wait for you.",
  due: "Time to sit up straight! Roll your shoulders back.",
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
  const { status } = reminder;

  return (
    <section className="flex w-full max-w-md flex-col items-center gap-5" aria-label="Posture reminder">
      <div className="kitten-stage relative" data-state={status}>
        {status === "due" && (
          <div
            aria-hidden="true"
            className="absolute -top-6 left-[62%] whitespace-nowrap rounded-2xl bg-white px-3 py-1.5 text-sm font-semibold shadow-md dark:bg-stone-800"
          >
            Sit up straight! 🐾
          </div>
        )}
        {children}
      </div>

      <p className="font-mono text-5xl font-semibold tabular-nums" data-testid="countdown">
        {formatDuration(reminder.remainingMs)}
      </p>

      <p role="status" className="min-h-6 text-stone-600 dark:text-stone-300">
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
          value={reminder.intervalMinutes}
          disabled={status !== "idle"}
          onChange={(event) => reminder.setIntervalMinutes(Number(event.target.value))}
        >
          {INTERVAL_OPTIONS_MIN.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes}
            </option>
          ))}
        </select>
        minutes
      </label>

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
