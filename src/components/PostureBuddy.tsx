"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAlertChannels } from "@/hooks/useAlertChannels";
import { usePostureCamera } from "@/hooks/usePostureCamera";
import { usePostureMode } from "@/hooks/usePostureMode";
import { usePushReminders } from "@/hooks/usePushReminders";
import { useReminders } from "@/hooks/useReminders";
import { blinkTitle, type Alert } from "@/lib/alertChannels";
import { useNotificationPermission } from "@/lib/notifications";
import type { ReminderConfig } from "@/lib/reminders";
import { playMeow, unlockAudio } from "@/lib/sound";
import { speak, useHasLocalVoice } from "@/lib/speech";
import { showTabDot } from "@/lib/tabIcon";
import AlertSettings from "./AlertSettings";
import CameraPanel from "./CameraPanel";
import NudgeDialog from "./NudgeDialog";
import { ReminderTimer, RemindersSettings } from "./ReminderPanel";
import { card, cardHeading } from "./styles";

export const DUE_TITLE = "⏰ Sit up straight! · Karamel";

/** The tab title while a reminder shows. Posture keeps its own wording. */
export function reminderTitle(config: ReminderConfig): string {
  return config.kind === "posture" ? DUE_TITLE : `⏰ ${config.emoji} ${config.name}! · Karamel`;
}
export const SLOUCH_TITLE = "👀 Caught you slouching! · Karamel";
/** How often the tab title changes while blinking. */
export const BLINK_MS = 1000;

type PostureBuddyProps = {
  /** The mascot. Passed in so it can stay a Server Component. */
  children: ReactNode;
};

/**
 * Owns the reminders, the camera check, notification permission, and the ways
 * to remind, and decides what the kitten says. A camera alert wins over a
 * timer reminder, because it is about what the user is doing right now.
 */
export default function PostureBuddy({ children }: PostureBuddyProps) {
  const { channels, update: updateChannels } = useAlertChannels();
  const hasLocalVoice = useHasLocalVoice();
  const [nudge, setNudge] = useState<Alert | null>(null);

  /** Runs once per reminder firing or slouch alert. Skipped reminders never get here. */
  const handleAlert = (alert: Alert) => {
    if (channels.sound) playMeow(channels.volume);
    if (channels.speak && hasLocalVoice) speak(alert.message);
    if (channels.nudge) setNudge(alert);
  };

  // The ref is kept apart from the camera state, so the state can be read during render.
  const { videoRef, ...camera } = usePostureCamera({ onAlert: handleAlert });
  const { mode, setMode } = usePostureMode();
  const notifications = useNotificationPermission();

  // The modes only apply while the camera can judge posture: on, calibrated, not calibrating.
  const cameraJudging = camera.cameraStatus === "on" && camera.hasBaseline && !camera.calibrating;
  const reminders = useReminders({
    skipPosture: cameraJudging && (mode === "camera-only" || (mode === "smart" && camera.reading === "good")),
    postureWatched: cameraJudging && mode === "camera-only",
    onAlert: handleAlert,
  });
  const push = usePushReminders({
    loaded: reminders.loaded,
    reminders: reminders.reminders,
    active: reminders.active,
    // In Smart and Camera-only modes the camera decides about posture, and only the page
    // knows what the camera sees, so posture is not handed to the push server meanwhile.
    postureOnDevice: cameraJudging && mode !== "always",
  });

  const message = camera.message ?? reminders.message;
  const alertTitle = camera.alertVisible
    ? SLOUCH_TITLE
    : reminders.latestVisible
      ? reminderTitle(reminders.latestVisible.config)
      : null;

  // The tab title is set in one place, so two features never undo each other's
  // change. With blinking on, while the user is in another tab, the title
  // alternates and the tab icon gets a dot; back in the tab, it stays still.
  useEffect(() => {
    if (alertTitle === null) return;
    const previousTitle = document.title;
    let frame = 0;
    const show = () => {
      const blinking = channels.blink && document.hidden;
      document.title = blinking ? blinkTitle(alertTitle, frame++) : alertTitle;
      showTabDot(blinking);
    };
    show();
    const id = channels.blink ? window.setInterval(show, BLINK_MS) : undefined;
    document.addEventListener("visibilitychange", show);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", show);
      document.title = previousTitle;
      showTabDot(false);
    };
  }, [alertTitle, channels.blink]);

  // Browsers only allow sound after a user interaction, so the first click or
  // key press on the page unlocks audio while sound is on.
  useEffect(() => {
    if (!channels.sound) return;
    const unlock = () => unlockAudio();
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [channels.sound]);

  return (
    <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-2 lg:items-start">
      <section aria-label="Karamel" className={`${card} flex flex-col items-center gap-2 px-6 py-8`}>
        <div className="kitten-stage flex flex-col items-center" data-reminding={message !== null}>
          {/* The bubble has its own reserved space, so it never covers other text,
              never goes past the screen edge, and the page does not jump when it appears. */}
          <div className="mb-3 flex min-h-16 items-end justify-center">
            {message && (
              <div
                aria-hidden="true"
                data-testid="speech-bubble"
                className="relative max-w-72 rounded-2xl border border-line bg-bg px-4 py-2 text-center text-sm font-bold shadow-md after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-transparent after:border-t-[var(--bg)]"
              >
                {message}
              </div>
            )}
          </div>
          {/* A soft caramel glow behind the kitten. */}
          <div className="flex aspect-square w-60 items-center justify-center rounded-full bg-tint sm:w-64">
            {children}
          </div>
        </div>
        <ReminderTimer reminders={reminders} />
      </section>

      <div className="flex flex-col gap-6">
        <section aria-labelledby="reminder-settings-heading" className={`${card} flex flex-col gap-4 p-6`}>
          <h2 id="reminder-settings-heading" className={`${cardHeading} text-left`}>
            My reminders
          </h2>
          <RemindersSettings reminders={reminders} />
        </section>
        <section aria-labelledby="alert-settings-heading" className={`${card} flex flex-col gap-4 p-6`}>
          <h2 id="alert-settings-heading" className={`${cardHeading} text-left`}>
            How should I remind you?
          </h2>
          <AlertSettings
            channels={channels}
            onChange={(patch) => {
              unlockAudio();
              updateChannels(patch);
            }}
            notificationStatus={notifications.status}
            onEnableNotifications={notifications.request}
            hasLocalVoice={hasLocalVoice}
            onTestSound={() => {
              unlockAudio();
              playMeow(channels.volume);
            }}
            onTestSpeech={() => speak("Hi! I'm Karamel. Sit up tall. 🐾")}
            onTestNudge={() => setNudge({ title: "🐾 Karamel", message: "This is how a full-screen nudge looks." })}
            push={push}
          />
        </section>
        <CameraPanel
          camera={camera}
          videoRef={videoRef}
          mode={mode}
          onModeChange={setMode}
          skippedCount={reminders.skippedCount}
          notificationStatus={notifications.status}
          onEnableNotifications={notifications.request}
        />
      </div>
      <NudgeDialog alert={nudge} onClose={() => setNudge(null)} />
    </div>
  );
}
