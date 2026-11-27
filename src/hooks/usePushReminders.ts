import { useCallback, useEffect, useRef, useState } from "react";
import {
  PushError,
  checkPushDevice,
  pushServerConfigured,
  pushSupport,
  syncPushSchedules,
  turnOffPush,
  turnOnPush,
  type PushProblem,
} from "@/lib/pushClient";
import { pushSchedules, scheduleSignature, type PushScheduleOptions } from "@/lib/pushSchedules";
import { deleteReminderTexts, saveReminderTexts } from "@/lib/pushTexts";
import type { ReminderState } from "@/lib/reminder";
import type { ReminderConfig } from "@/lib/reminders";

/** "hidden": this website has no push server, so the option does not show. */
export type PushAvailability = "checking" | "hidden" | "unsupported" | "needs-home-screen" | "ready";

/** Waits this long after the last change before syncing, so a burst of changes is one call. */
export const PUSH_SYNC_DELAY_MS = 500;

type Options = {
  /** False until the saved session was loaded: before that, the timers are placeholders. */
  loaded: boolean;
  reminders: readonly ReminderConfig[];
  active: readonly { config: ReminderConfig; timer: ReminderState }[];
} & PushScheduleOptions;

/** "Remind me when Karamel is closed": turning it on and off, and keeping the server in sync. */
export function usePushReminders({ loaded, reminders, active, postureOnDevice }: Options) {
  const [availability, setAvailability] = useState<PushAvailability>("checking");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<PushProblem | null>(null);
  const [retries, setRetries] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Awaited first, so every state update below happens after this effect.
      await Promise.resolve();
      if (cancelled) return;
      if (!pushServerConfigured()) return setAvailability("hidden");
      const support = pushSupport();
      if (support !== "supported") return setAvailability(support);
      const device = await checkPushDevice();
      if (cancelled) return;
      setEnabled(device !== null);
      setAvailability("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Read when the sync runs, so the timeout always sends the latest times.
  const latest = useRef({ active, postureOnDevice });
  useEffect(() => {
    latest.current = { active, postureOnDevice };
  });

  const signature = scheduleSignature(active, { postureOnDevice });
  useEffect(() => {
    if (!enabled || !loaded) return;
    const id = window.setTimeout(async () => {
      try {
        const { active: now, postureOnDevice: onDevice } = latest.current;
        const result = await syncPushSchedules(pushSchedules(now, Date.now(), { postureOnDevice: onDevice }));
        if (result === "off") setEnabled(false);
        setProblem(null);
      } catch {
        setProblem("server"); // Tried again on the next change, or when the network is back.
      }
    }, PUSH_SYNC_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [enabled, loaded, signature, retries]);

  // A failed sync is retried when the device is back online or Karamel is back on screen.
  useEffect(() => {
    if (problem === null) return;
    const retry = () => {
      if (document.visibilityState === "visible") setRetries((n) => n + 1);
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [problem]);

  // The service worker needs the texts to show a push; they stay on the device.
  useEffect(() => {
    if (enabled && loaded) void saveReminderTexts(reminders).catch(() => {});
  }, [enabled, loaded, reminders]);

  const turnOn = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    try {
      await turnOnPush();
      setEnabled(true);
    } catch (error) {
      setProblem(error instanceof PushError ? error.problem : "server");
    } finally {
      setBusy(false);
    }
  }, []);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    try {
      await turnOffPush();
      await deleteReminderTexts().catch(() => {});
    } finally {
      setEnabled(false);
      setBusy(false);
    }
  }, []);

  return { availability, enabled, busy, problem, turnOn, turnOff };
}
