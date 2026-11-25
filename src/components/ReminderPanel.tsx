"use client";

import { useState } from "react";
import type { useReminders } from "@/hooks/useReminders";
import { INTERVAL_OPTIONS_SEC, formatDuration, formatIntervalLabel } from "@/lib/reminder";
import { LIMITS, isBuiltIn, parseMessagesText, type ReminderConfig } from "@/lib/reminders";
import { primaryButton, secondaryButton } from "./styles";

type Reminders = ReturnType<typeof useReminders>;

/**
 * The button that confirms a reminder. Posture keeps its friendly wording.
 * Others show a short "Done ✓"; the accessible name says which reminder,
 * because a screen reader user does not see the row around the button.
 */
function doneButton(config: ReminderConfig): { text: string; label: string } {
  if (config.kind === "posture") return { text: "I'm sitting tall", label: "I'm sitting tall" };
  return { text: "Done ✓", label: `Done: ${config.name}` };
}

function statusText(reminders: Reminders): string {
  if (reminders.active.length === 0) return "Turn on a reminder in “My reminders”.";
  if (reminders.due.length > 0) {
    const posture = reminders.due.find((d) => d.config.kind === "posture");
    if (posture && reminders.due.length === 1) return "Fix your posture, then press “I'm sitting tall”.";
    return "Press “Done” when you've done it.";
  }
  switch (reminders.status) {
    case "idle":
      return "Press Start when you're ready.";
    case "running":
      return "I'm watching. Keep that back straight.";
    case "paused":
      return "Paused. I'll wait for you.";
  }
}

/** The main card: what is due, the next countdown, and the session buttons. */
export function ReminderTimer({ reminders }: { reminders: Reminders }) {
  const { status, next, due, message } = reminders;
  const upcoming = reminders.active.filter((a) => a !== next && a.timer.status !== "due");

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {due.length > 0 && (
        <ul className="flex w-full flex-col gap-2" aria-label="Time for">
          {due.map(({ config }) => (
            <li
              key={config.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-tint px-4 py-2 text-left"
            >
              <span className="font-bold">
                <span aria-hidden="true">{config.emoji} </span>
                {config.name}
              </span>
              <button
                type="button"
                className={`${primaryButton} shrink-0 px-4 py-1.5 text-sm`}
                aria-label={doneButton(config).label}
                onClick={() => reminders.acknowledge(config.id)}
              >
                {doneButton(config).text}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col items-center">
        <p className="text-sm font-semibold text-soft" data-testid="next-label">
          {next ? (
            <>
              Next: <span aria-hidden="true">{next.config.emoji} </span>
              {next.config.name}
            </>
          ) : (
            " "
          )}
        </p>
        <p
          className="font-display text-6xl font-semibold tabular-nums tracking-tight sm:text-7xl"
          data-testid="countdown"
        >
          {next ? formatDuration(next.remainingMs) : due.length > 0 ? "00:00" : "--:--"}
        </p>
      </div>

      <p role="status" data-testid="reminder-status" className="min-h-6 text-soft">
        {/* Screen readers also hear the kitten's message, which is only shown visually in the bubble. */}
        {message && <span className="sr-only">{message} </span>}
        {statusText(reminders)}
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        {status === "idle" && (
          <button
            type="button"
            className={primaryButton}
            onClick={reminders.start}
            disabled={reminders.active.length === 0}
          >
            Start
          </button>
        )}
        {status === "running" && (
          <button type="button" className={primaryButton} onClick={reminders.pause}>
            Pause
          </button>
        )}
        {status === "paused" && (
          <button type="button" className={primaryButton} onClick={reminders.resume}>
            Resume
          </button>
        )}
        {status !== "idle" && (
          <button type="button" className={secondaryButton} onClick={reminders.reset}>
            Reset
          </button>
        )}
      </div>

      {upcoming.length > 0 && (
        <ul className="flex w-full flex-col gap-1 text-sm text-soft" aria-label="Coming up">
          {upcoming.map(({ config, remainingMs }) => (
            <li key={config.id} className="flex justify-between gap-3 px-2">
              <span>
                <span aria-hidden="true">{config.emoji} </span>
                {config.name}
              </span>
              <span className="tabular-nums" data-testid={`upcoming-${config.id}`}>
                {formatDuration(remainingMs)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Text fields are edited as a draft and saved together with one button. */
function ReminderEditor({ config, reminders }: { config: ReminderConfig; reminders: Reminders }) {
  const custom = !isBuiltIn(config.kind);
  const [name, setName] = useState(config.name);
  const [emoji, setEmoji] = useState(config.emoji);
  const [messagesText, setMessagesText] = useState(config.messages.join("\n"));
  const draftMessages = parseMessagesText(messagesText);
  const inputClass = "rounded-xl border border-line bg-bg px-3 py-1.5";

  const save = () =>
    reminders.update(config.id, {
      messages: draftMessages,
      ...(custom ? { name, emoji } : {}),
    });

  return (
    <div className="flex flex-col gap-3 pt-3">
      {custom && (
        <div className="flex gap-3">
          <label className="flex w-20 flex-col gap-1 text-sm font-semibold">
            Emoji
            <input
              className={inputClass}
              value={emoji}
              maxLength={LIMITS.emojiLength}
              onChange={(event) => setEmoji(event.target.value)}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
            Name
            <input
              className={inputClass}
              value={name}
              maxLength={LIMITS.nameLength}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </div>
      )}

      <label className="flex items-center justify-between gap-3 text-sm font-semibold">
        Remind me every
        <select
          className={`${inputClass} font-semibold`}
          value={config.intervalSec}
          onChange={(event) => reminders.update(config.id, { intervalSec: Number(event.target.value) })}
        >
          {INTERVAL_OPTIONS_SEC.map((seconds) => (
            <option key={seconds} value={seconds}>
              {formatIntervalLabel(seconds)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <label className="flex items-center justify-between gap-3 text-sm font-semibold">
          Restart automatically
          <input
            type="checkbox"
            role="switch"
            className="h-5 w-5 accent-accent"
            checked={config.autoRestart}
            onChange={(event) => reminders.update(config.id, { autoRestart: event.target.checked })}
          />
        </label>
        <p className="text-xs text-soft">
          {config.autoRestart
            ? "The next countdown starts right after each reminder."
            : "After each reminder, I wait until you press “Done”."}
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        Messages (one per line, up to {LIMITS.messages})
        <textarea
          className={`${inputClass} min-h-28 font-normal`}
          value={messagesText}
          onChange={(event) => setMessagesText(event.target.value)}
        />
      </label>
      {draftMessages.length === 0 && (
        <p className="text-xs text-soft">With no messages, saving brings back the default ones.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${primaryButton} px-4 py-1.5 text-sm`} onClick={save}>
          Save
        </button>
        {custom ? (
          <button
            type="button"
            className={`${secondaryButton} px-4 py-1.5 text-sm`}
            onClick={() => reminders.remove(config.id)}
          >
            Delete reminder
          </button>
        ) : (
          <button
            type="button"
            className={`${secondaryButton} px-4 py-1.5 text-sm`}
            onClick={() => reminders.restoreMessages(config)}
          >
            Restore default messages
          </button>
        )}
      </div>
    </div>
  );
}

/** The "My reminders" card: turn reminders on and off, edit them, add your own. */
export function RemindersSettings({ reminders }: { reminders: Reminders }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const customCount = reminders.reminders.filter((r) => r.kind === "custom").length;
  const canAdd = customCount < LIMITS.customReminders;

  const setOpen = (id: string, open: boolean) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-3 text-left">
      <ul className="flex flex-col gap-2">
        {reminders.reminders.map((config) => (
          <li
            key={config.id}
            role="group"
            aria-label={config.name}
            className="rounded-2xl border border-line px-4 py-3"
          >
            <label className="flex items-center justify-between gap-3">
              <span className="font-bold">
                <span aria-hidden="true">{config.emoji} </span>
                {config.name}
                <span className="ml-2 text-sm font-normal text-soft">
                  every {formatIntervalLabel(config.intervalSec)}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={`${config.name} on`}
                className="h-5 w-5 accent-accent"
                checked={config.enabled}
                onChange={(event) => reminders.update(config.id, { enabled: event.target.checked })}
              />
            </label>
            <details
              open={openIds.has(config.id)}
              onToggle={(event) => setOpen(config.id, event.currentTarget.open)}
            >
              <summary className="mt-1 cursor-pointer text-sm font-semibold text-accent">Edit</summary>
              {/* Remount the editor when saved text changes, so its draft starts from the saved values. */}
              <ReminderEditor
                key={`${config.name}|${config.emoji}|${config.messages.join("\n")}`}
                config={config}
                reminders={reminders}
              />
            </details>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={`${secondaryButton} self-start text-sm`}
        disabled={!canAdd}
        onClick={() => setOpen(reminders.addCustom(), true)}
      >
        + Add a custom reminder
      </button>
      {!canAdd && (
        <p className="text-xs text-soft">You can have up to {LIMITS.customReminders} custom reminders.</p>
      )}
    </div>
  );
}
