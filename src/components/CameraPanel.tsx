import type { RefObject } from "react";
import type { CameraError, usePostureCamera } from "@/hooks/usePostureCamera";
import type { PostureMode } from "@/hooks/usePostureMode";
import type { NotificationStatus } from "@/lib/notifications";
import { CALIBRATION_SAMPLES } from "@/lib/posture";
import { card, cardHeading, primaryButton, secondaryButton } from "./styles";

/** The camera state, without the video ref (which is passed separately). */
export type Camera = Omit<ReturnType<typeof usePostureCamera>, "videoRef">;

const ERROR_MESSAGES: Record<CameraError, string> = {
  unsupported: "This browser can't use the camera here. Camera access needs HTTPS or localhost.",
  denied: "Camera access was blocked. Allow the camera in your browser's site settings, then try again.",
  "no-camera": "No camera was found.",
  "in-use": "The camera is busy. Close other apps that use it, then try again.",
  ended: "The camera stopped. Turn it on again when you're ready.",
  model: "Couldn't load the posture model. Try reloading the page.",
  unknown: "Something went wrong while starting the camera.",
};

function statusText(camera: Camera): string {
  switch (camera.cameraStatus) {
    case "off":
      return "The camera is off.";
    case "starting":
      return "Starting the camera and loading the posture model…";
    case "error":
      return ERROR_MESSAGES[camera.cameraError ?? "unknown"];
    case "on":
      if (camera.calibrating) {
        const done = Math.round(camera.calibrationProgress * CALIBRATION_SAMPLES);
        return camera.canSeeYou
          ? `Calibrating… sit up straight and hold still (${done}/${CALIBRATION_SAMPLES}).`
          : "Calibrating… I can't see your head and shoulders yet.";
      }
      if (camera.calibrationFailed) {
        return "Calibration didn't work. Keep your ears and shoulders in view, then try again.";
      }
      if (!camera.hasBaseline) return "Sit up straight, then press “Set my good posture”.";
      switch (camera.reading) {
        case "good":
          return "Good posture. ✓";
        case "slouching":
          return "You're slouching.";
        case "unknown":
          return "I can't see you. Keep your head and shoulders in view.";
      }
  }
}

/** The optional camera posture check. The state lives in PostureBuddy. */
const MODE_OPTIONS: { value: PostureMode; label: string; hint: string }[] = [
  {
    value: "smart",
    label: "Smart",
    hint: "The posture timer skips its reminder when I can see you're sitting well.",
  },
  {
    value: "camera-only",
    label: "Camera only",
    hint: "No posture timer. I only speak up when I catch you slouching.",
  },
  {
    value: "always",
    label: "Always",
    hint: "The posture timer reminds you on schedule, even when you sit well.",
  },
];

type CameraPanelProps = {
  camera: Camera;
  videoRef: RefObject<HTMLVideoElement | null>;
  mode: PostureMode;
  onModeChange: (mode: PostureMode) => void;
  skippedCount: number;
  notificationStatus: NotificationStatus;
  onEnableNotifications: () => void;
};

export default function CameraPanel({
  camera,
  videoRef,
  mode,
  onModeChange,
  skippedCount,
  notificationStatus,
  onEnableNotifications,
}: CameraPanelProps) {
  const { cameraStatus } = camera;
  const active = cameraStatus === "starting" || cameraStatus === "on";
  const scorePercent = camera.score === null ? null : Math.round(camera.score * 100);

  const chip =
    cameraStatus === "on" && camera.hasBaseline && !camera.calibrating
      ? camera.reading === "good"
        ? "bg-good/10 text-good"
        : camera.reading === "slouching"
          ? "bg-alert/10 text-alert"
          : "bg-tint text-ink"
      : "bg-tint text-ink";

  return (
    <section aria-labelledby="camera-heading" className={`${card} flex flex-col gap-4 p-6`}>
      <div className="flex flex-col gap-1 text-left">
        <h2 id="camera-heading" className={cardHeading}>
          Camera posture check <span className="font-sans text-base font-normal text-soft">(optional)</span>
        </h2>
        <p className="text-sm text-soft">
          <span aria-hidden="true">🔒 </span>
          The video is checked on this device and never leaves it. Nothing is recorded.
        </p>
      </div>

      {/* Mirrored, like looking in a mirror. Kept in the DOM so the stream can attach to it. */}
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Your camera preview"
        hidden={!active}
        className="mx-auto w-48 -scale-x-100 rounded-2xl border border-line bg-tint"
      />

      <p
        role="status"
        data-testid="camera-status"
        data-reading={cameraStatus === "on" ? camera.reading : cameraStatus}
        className={`rounded-2xl px-4 py-2 text-center text-sm font-bold ${chip}`}
      >
        {camera.message && <span className="sr-only">{camera.message} </span>}
        {statusText(camera)}
      </p>

      {cameraStatus === "on" && camera.hasBaseline && !camera.calibrating && scorePercent !== null && (
        <p className="text-center text-sm text-soft" data-testid="posture-score">
          Posture: {scorePercent}% of your good posture
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {cameraStatus === "on" && (
          <button
            type="button"
            className={`${primaryButton} text-sm`}
            onClick={camera.calibrate}
            disabled={camera.calibrating}
          >
            {camera.hasBaseline ? "Reset my good posture" : "Set my good posture"}
          </button>
        )}
        {active ? (
          <button type="button" className={`${secondaryButton} text-sm`} onClick={camera.stop}>
            Turn off camera
          </button>
        ) : (
          <button type="button" className={`${primaryButton} text-sm`} onClick={camera.start}>
            Turn on camera
          </button>
        )}
      </div>

      {cameraStatus === "on" && notificationStatus === "default" && (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-tint px-4 py-3 text-center text-sm">
          <p>Want a desktop notification when I catch you slouching, even in another tab?</p>
          <button type="button" className={`${secondaryButton} text-sm`} onClick={onEnableNotifications}>
            Turn on notifications
          </button>
        </div>
      )}

      {skippedCount > 0 && (
        <p className="text-center text-sm text-good" data-testid="skipped-count">
          Skipped {skippedCount} posture {skippedCount === 1 ? "reminder" : "reminders"} this session because
          you sat well.
        </p>
      )}

      <fieldset className="flex flex-col gap-2 text-left">
        <legend className="mb-1 font-semibold">When the camera is on</legend>
        {MODE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer gap-3 rounded-2xl border px-3 py-2 ${
              mode === option.value ? "border-accent bg-tint" : "border-line"
            }`}
          >
            <input
              type="radio"
              name="posture-mode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => onModeChange(option.value)}
              className="mt-1 accent-accent"
            />
            <span>
              <span className="font-bold">{option.label}</span>
              <span className="block text-sm text-soft">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
