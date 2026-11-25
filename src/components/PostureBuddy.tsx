"use client";

import { useEffect, type ReactNode } from "react";
import { usePostureCamera } from "@/hooks/usePostureCamera";
import { useReminder } from "@/hooks/useReminder";
import { useNotificationPermission } from "@/lib/notifications";
import CameraPanel from "./CameraPanel";
import NotificationControl from "./NotificationControl";
import { ReminderSettings, ReminderTimer } from "./ReminderPanel";
import { card, cardHeading } from "./styles";

export const DUE_TITLE = "⏰ Sit up straight! · Karamel";
export const SLOUCH_TITLE = "👀 Caught you slouching! · Karamel";

type PostureBuddyProps = {
  /** The mascot. Passed in so it can stay a Server Component. */
  children: ReactNode;
};

/**
 * Owns the timer, the camera check, and notification permission, and decides
 * what the kitten says. A camera alert wins over a timer reminder, because it
 * is about what the user is doing right now.
 */
export default function PostureBuddy({ children }: PostureBuddyProps) {
  const reminder = useReminder();
  // The ref is kept apart from the camera state, so the state can be read during render.
  const { videoRef, ...camera } = usePostureCamera();
  const notifications = useNotificationPermission();

  const message = camera.message ?? reminder.message;
  const alertTitle = camera.alertVisible ? SLOUCH_TITLE : reminder.reminderVisible ? DUE_TITLE : null;

  // The tab title is set in one place, so two features never undo each other's change.
  useEffect(() => {
    if (alertTitle === null) return;
    const previousTitle = document.title;
    document.title = alertTitle;
    return () => {
      document.title = previousTitle;
    };
  }, [alertTitle]);

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
        <ReminderTimer reminder={reminder} />
      </section>

      <div className="flex flex-col gap-6">
        <section aria-labelledby="reminder-settings-heading" className={`${card} flex flex-col gap-4 p-6`}>
          <h2 id="reminder-settings-heading" className={`${cardHeading} text-left`}>
            Reminder settings
          </h2>
          <ReminderSettings reminder={reminder} />
          <NotificationControl status={notifications.status} onEnable={notifications.request} />
        </section>
        <CameraPanel camera={camera} videoRef={videoRef} />
      </div>
    </div>
  );
}
