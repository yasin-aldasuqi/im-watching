import type { ReactNode } from "react";
import type { AlertChannels } from "@/lib/alertChannels";
import type { NotificationStatus } from "@/lib/notifications";
import NotificationControl from "./NotificationControl";
import { secondaryButton } from "./styles";

type AlertSettingsProps = {
  channels: AlertChannels;
  onChange: (patch: Partial<AlertChannels>) => void;
  notificationStatus: NotificationStatus;
  onEnableNotifications: () => void;
  hasLocalVoice: boolean;
  onTestSound: () => void;
  onTestSpeech: () => void;
  onTestNudge: () => void;
};

const testButton = `${secondaryButton} px-3 py-1 text-xs`;

function ChannelRow({
  emoji,
  title,
  hint,
  checked,
  onToggle,
  disabled = false,
  test,
  children,
}: {
  emoji: string;
  title: string;
  hint: string;
  checked: boolean;
  onToggle: (on: boolean) => void;
  disabled?: boolean;
  test?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-line px-4 py-3">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="font-bold">
            <span aria-hidden="true">{emoji} </span>
            {title}
          </span>
          <span className="block text-sm text-soft">{hint}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="h-5 w-5 shrink-0 accent-accent"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </label>
      {(children || test) && (
        <div className="flex flex-wrap items-center gap-3">
          {children}
          {test}
        </div>
      )}
    </li>
  );
}

/** The "How should I remind you?" card. */
export default function AlertSettings({
  channels,
  onChange,
  notificationStatus,
  onEnableNotifications,
  hasLocalVoice,
  onTestSound,
  onTestSpeech,
  onTestNudge,
}: AlertSettingsProps) {
  return (
    <div className="flex flex-col gap-3 text-left">
      <p className="text-sm text-soft">
        <span aria-hidden="true">💬 </span>The speech bubble is always on.
      </p>

      <div className="rounded-2xl border border-line px-4 py-3">
        <p className="font-bold">
          <span aria-hidden="true">🔔 </span>Desktop notifications
        </p>
        <div className="mt-1">
          <NotificationControl status={notificationStatus} onEnable={onEnableNotifications} />
          {notificationStatus === "unsupported" && (
            <p className="text-sm text-soft">This browser can&apos;t show desktop notifications.</p>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        <ChannelRow
          emoji="🔊"
          title="Sound"
          hint="A short meow."
          checked={channels.sound}
          onToggle={(sound) => onChange({ sound })}
          test={
            <button type="button" className={testButton} onClick={onTestSound}>
              Test sound
            </button>
          }
        >
          <label className="flex flex-1 items-center gap-2 text-sm">
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={channels.volume}
              onChange={(event) => onChange({ volume: Number(event.target.value) })}
              className="flex-1 accent-accent"
            />
          </label>
        </ChannelRow>

        <ChannelRow
          emoji="🗣️"
          title="Kitten speaks"
          hint={
            hasLocalVoice
              ? "Reads the message out loud with an offline voice."
              : "No offline voice in this browser. Online voices would send your messages to a server, so I stay quiet."
          }
          checked={channels.speak && hasLocalVoice}
          disabled={!hasLocalVoice}
          onToggle={(speak) => onChange({ speak })}
          test={
            hasLocalVoice && (
              <button type="button" className={testButton} onClick={onTestSpeech}>
                Test voice
              </button>
            )
          }
        />

        <ChannelRow
          emoji="🖥️"
          title="Full-screen nudge"
          hint="Covers the page until you press “Got it”."
          checked={channels.nudge}
          onToggle={(nudge) => onChange({ nudge })}
          test={
            <button type="button" className={testButton} onClick={onTestNudge}>
              Test nudge
            </button>
          }
        />

        <ChannelRow
          emoji="✨"
          title="Blinking tab"
          hint="Flashes the tab title and icon while you're in another tab."
          checked={channels.blink}
          onToggle={(blink) => onChange({ blink })}
        />
      </ul>
    </div>
  );
}
