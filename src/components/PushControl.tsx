import type { PushAvailability } from "@/hooks/usePushReminders";
import type { PushProblem } from "@/lib/pushClient";
import { primaryButton, secondaryButton } from "./styles";

export type PushControlProps = {
  availability: PushAvailability;
  enabled: boolean;
  busy: boolean;
  problem: PushProblem | null;
  turnOn: () => void;
  turnOff: () => void;
};

const PROBLEMS: Record<PushProblem, string> = {
  denied: "Notifications are blocked for Karamel. Allow them in your browser or phone settings, then try again.",
  "no-worker": "Karamel isn't fully loaded yet. Reload the page and try again.",
  server: "Couldn't reach Karamel's server. I'll try again when you're back online.",
};

/** "Remind me when Karamel is closed": reminders by Web Push from Karamel's server. */
export default function PushControl({ availability, enabled, busy, problem, turnOn, turnOff }: PushControlProps) {
  // No server is configured for this website (or the check is still running).
  if (availability === "checking" || availability === "hidden") return null;
  const note = "text-sm text-soft";

  return (
    <div role="group" aria-labelledby="push-title" className="flex flex-col gap-2 rounded-2xl border border-line px-4 py-3">
      <p id="push-title" className="font-bold">
        <span aria-hidden="true">📱 </span>Remind me when Karamel is closed
      </p>

      {availability === "unsupported" && <p className={note}>This browser can&apos;t get reminders while Karamel is closed.</p>}

      {availability === "needs-home-screen" && (
        <p className={note}>
          On iPhone and iPad, add Karamel to your Home Screen first: tap <strong>Share</strong>, then{" "}
          <strong>Add to Home Screen</strong>, and open Karamel from there.
        </p>
      )}

      {availability === "ready" &&
        (enabled ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="status" className="text-sm font-bold text-good">
              On: reminders arrive even when Karamel is closed.
            </p>
            <button type="button" className={`${secondaryButton} px-3 py-1 text-xs`} onClick={turnOff} disabled={busy}>
              Turn off
            </button>
          </div>
        ) : (
          <button type="button" className={`${primaryButton} self-start text-sm`} onClick={turnOn} disabled={busy}>
            {busy ? "Turning on…" : "Turn on"}
          </button>
        ))}

      {problem && (
        <p role="alert" className="text-sm text-alert">
          {PROBLEMS[problem]}
        </p>
      )}

      {availability !== "unsupported" && (
        <p className="text-xs text-soft">
          How it works: Karamel&apos;s server keeps only your reminder times and an anonymous push address, and
          Apple, Google, or Mozilla deliver the wake-up. Your reminder names and messages stay on this device.
          Turning this off deletes everything about this device from the server.
        </p>
      )}
    </div>
  );
}
