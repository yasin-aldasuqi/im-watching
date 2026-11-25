"use client";

import { useEffect, type ReactNode } from "react";
import { usePostureCamera } from "@/hooks/usePostureCamera";
import { useReminder } from "@/hooks/useReminder";
import { useNotificationPermission } from "@/lib/notifications";
import CameraPanel from "./CameraPanel";
import NotificationControl from "./NotificationControl";
import ReminderPanel from "./ReminderPanel";

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
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <div className="kitten-stage flex flex-col items-center" data-reminding={message !== null}>
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

      <ReminderPanel reminder={reminder} />
      <NotificationControl status={notifications.status} onEnable={notifications.request} />
      <CameraPanel camera={camera} videoRef={videoRef} />
    </div>
  );
}
