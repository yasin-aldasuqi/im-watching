import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Alert } from "@/lib/alertChannels";
import { SLOUCH_MESSAGES } from "@/lib/messages";
import { showNotification } from "@/lib/notifications";
import { readSetting, storageKey, writeSetting } from "@/lib/storage";
import { createPoseDetector, type PoseDetector } from "@/lib/poseDetector";
import {
  CALIBRATION_SAMPLES,
  createPostureState,
  isValidBaseline,
  measureHeadHeight,
  postureReducer,
} from "@/lib/posture";

const BASELINE_SETTING = "posture-baseline";
export const BASELINE_STORAGE_KEY = storageKey(BASELINE_SETTING);
/** 4 checks per second: enough for posture, which changes slowly, and easy on the battery. */
export const CHECK_INTERVAL_MS = 250;
/** How long the slouch bubble stays up after an alert. */
export const ALERT_VISIBLE_MS = 10_000;

export type CameraStatus = "off" | "starting" | "on" | "error";
export type CameraError = "unsupported" | "denied" | "no-camera" | "in-use" | "ended" | "model" | "unknown";

function cameraErrorFrom(error: unknown): CameraError {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "OverconstrainedError":
      return "no-camera";
    case "NotReadableError":
    case "AbortError":
      return "in-use";
    default:
      return "unknown";
  }
}

function readBaseline(): number | null {
  const value = Number(readSetting(BASELINE_SETTING));
  return isValidBaseline(value) ? value : null;
}

function writeBaseline(value: number): void {
  writeSetting(BASELINE_SETTING, String(value));
}

/**
 * Runs the optional camera posture check.
 *
 * Privacy: video frames go from the camera straight into the pose model in
 * this tab. They are never drawn, stored, or sent anywhere. Only the
 * calibrated baseline (one number) is saved, in localStorage.
 */
export const SLOUCH_ALERT_TITLE = "👀 Caught you slouching";

export function usePostureCamera({ onAlert }: { onAlert?: (alert: Alert) => void } = {}) {
  const [state, dispatch] = useReducer(postureReducer, null, () => createPostureState());
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("off");
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [now, setNow] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<PoseDetector | null>(null);
  const notificationRef = useRef<Notification | null>(null);
  const onAlertRef = useRef(onAlert);
  useEffect(() => {
    onAlertRef.current = onAlert;
  }, [onAlert]);
  // Goes up on every start and stop, so a start that is still in progress
  // knows it was cancelled and must not turn the camera on.
  const runIdRef = useRef(0);

  const closeNotification = useCallback(() => {
    notificationRef.current?.close();
    notificationRef.current = null;
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const fail = useCallback(
    (error: CameraError) => {
      stopStream();
      setCameraStatus("error");
      setCameraError(error);
      dispatch({ type: "stop" });
    },
    [stopStream],
  );

  const start = useCallback(async () => {
    const runId = ++runIdRef.current;
    const cancelled = () => runId !== runIdRef.current;
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      fail("unsupported");
      return;
    }
    setCameraStatus("starting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      if (cancelled()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (!cancelled()) fail("ended");
      });
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
    } catch (error) {
      if (!cancelled()) fail(cameraErrorFrom(error));
      return;
    }

    try {
      detectorRef.current ??= await createPoseDetector();
    } catch {
      if (!cancelled()) fail("model");
      return;
    }
    if (cancelled()) return;
    setCameraStatus("on");
  }, [fail]);

  const stop = useCallback(() => {
    runIdRef.current++;
    stopStream();
    closeNotification();
    setCameraStatus("off");
    setCameraError(null);
    dispatch({ type: "stop" });
  }, [stopStream, closeNotification]);

  const calibrate = useCallback(() => dispatch({ type: "startCalibration" }), []);

  // Load the saved baseline after hydration.
  useEffect(() => {
    const saved = readBaseline();
    if (saved !== null) dispatch({ type: "setBaseline", baseline: saved });
  }, []);

  useEffect(() => {
    if (state.baseline !== null) writeBaseline(state.baseline);
  }, [state.baseline]);

  // The check loop: runs only while the camera is on.
  useEffect(() => {
    if (cameraStatus !== "on") return;
    const check = () => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState < 2 || video.videoWidth === 0) return;

      let value: number | null = null;
      try {
        const landmarks = detector.detect(video, performance.now());
        value = landmarks ? measureHeadHeight(landmarks, video.videoWidth / video.videoHeight) : null;
      } catch {
        value = null;
      }
      const t = Date.now();
      setNow(t);
      dispatch({ type: "sample", now: t, value, random: Math.random() });
    };
    const id = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [cameraStatus]);

  const message = state.messageIndex === null ? null : SLOUCH_MESSAGES[state.messageIndex];

  // One notification per alert; a new one replaces the previous one.
  useEffect(() => {
    if (state.alertCount === 0 || message === null) return;
    closeNotification();
    notificationRef.current = showNotification(message);
    onAlertRef.current?.({ title: SLOUCH_ALERT_TITLE, message });
  }, [state.alertCount, message, closeNotification]);

  // Turn the camera off when leaving the page, and free the model.
  useEffect(
    () => () => {
      runIdRef.current++;
      stopStream();
      closeNotification();
      detectorRef.current?.close();
      detectorRef.current = null;
    },
    [stopStream, closeNotification],
  );

  const alertVisible =
    cameraStatus === "on" &&
    message !== null &&
    state.lastAlertAt !== null &&
    now - state.lastAlertAt < ALERT_VISIBLE_MS;

  return {
    videoRef,
    cameraStatus,
    cameraError,
    reading: state.reading,
    hasBaseline: state.baseline !== null,
    calibrating: state.calibrationSamples !== null,
    calibrationProgress: (state.calibrationSamples?.length ?? 0) / CALIBRATION_SAMPLES,
    calibrationFailed: state.calibrationFailed,
    /** Latest measurement as a fraction of the good-posture baseline, or null. */
    score:
      state.lastValue !== null && state.baseline !== null ? state.lastValue / state.baseline : null,
    canSeeYou: state.lastValue !== null,
    alertVisible,
    message: alertVisible ? message : null,
    start,
    stop,
    calibrate,
  };
}
