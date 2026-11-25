import type { RefObject } from "react";
import type { CameraError, usePostureCamera } from "@/hooks/usePostureCamera";
import { CALIBRATION_SAMPLES } from "@/lib/posture";
import { primaryButton, secondaryButton } from "./buttons";

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
export default function CameraPanel({
  camera,
  videoRef,
}: {
  camera: Camera;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const { cameraStatus } = camera;
  const active = cameraStatus === "starting" || cameraStatus === "on";
  const scorePercent = camera.score === null ? null : Math.round(camera.score * 100);

  return (
    <section
      aria-labelledby="camera-heading"
      className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-stone-200 p-5 dark:border-stone-700"
    >
      <h2 id="camera-heading" className="text-lg font-semibold">
        Camera posture check <span className="font-normal text-stone-500 dark:text-stone-400">(optional)</span>
      </h2>
      <p className="text-xs text-stone-500 dark:text-stone-400">
        The video is checked on this device and never leaves it. Nothing is recorded.
      </p>

      {/* Mirrored, like looking in a mirror. Kept in the DOM so the stream can attach to it. */}
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Your camera preview"
        hidden={!active}
        className="w-40 -scale-x-100 rounded-xl bg-stone-200 dark:bg-stone-800"
      />

      <p
        role="status"
        data-testid="camera-status"
        data-reading={cameraStatus === "on" ? camera.reading : cameraStatus}
        className={`min-h-6 text-sm font-medium ${
          cameraStatus === "on" && camera.hasBaseline && camera.reading === "slouching"
            ? "text-orange-700 dark:text-orange-400"
            : "text-stone-700 dark:text-stone-300"
        }`}
      >
        {camera.message && <span className="sr-only">{camera.message} </span>}
        {statusText(camera)}
      </p>

      {cameraStatus === "on" && camera.hasBaseline && !camera.calibrating && scorePercent !== null && (
        <p className="text-xs text-stone-500 dark:text-stone-400" data-testid="posture-score">
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
          <button type="button" className={`${secondaryButton} text-sm`} onClick={camera.start}>
            Turn on camera
          </button>
        )}
      </div>
    </section>
  );
}
