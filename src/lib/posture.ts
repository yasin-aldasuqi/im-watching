/**
 * Posture detection logic.
 *
 * This module is pure: it never touches the camera, timers, or Math.random().
 * The caller passes body landmarks (from the pose model), the current time,
 * and a random number. That keeps every rule easy to unit test.
 *
 * The measurement: how high the ears are above the shoulder line, divided by
 * the shoulder width. Slouching or pushing the head forward brings the ears
 * closer to the shoulders, so the number drops. Dividing by shoulder width
 * keeps it the same when the user moves closer to or further from the camera.
 *
 * Each user calibrates their own "good posture" value, because bodies, chairs,
 * and camera angles all differ.
 */

import { SLOUCH_MESSAGES, pickMessageIndex } from "./messages";

/** A body point from the pose model. x and y are in [0, 1] of the image width and height. */
export type Landmark = { x: number; y: number; visibility?: number };

/** Indices in MediaPipe's 33-point pose model. */
export const LANDMARK = {
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
} as const;

/** Points the model is less sure about than this are ignored. */
export const MIN_VISIBILITY = 0.5;
/** Shoulders narrower than this (in image heights) mean the person is too far away to measure. */
export const MIN_SHOULDER_WIDTH = 0.05;
/** Valid measurements collected during calibration (about 2 seconds at 4 checks per second). */
export const CALIBRATION_SAMPLES = 8;
/** Slouching starts at this fraction below the baseline. */
export const SLOUCH_DROP = 0.15;
/** Back to good only above this fraction below the baseline (hysteresis, so it does not flicker). */
export const RECOVER_DROP = SLOUCH_DROP / 2;
/** Slouching must last this long before an alert. */
export const SLOUCH_HOLD_MS = 5_000;
/** At most one alert per this period. */
export const ALERT_COOLDOWN_MS = 60_000;

function isVisible(point: Landmark | undefined): point is Landmark {
  return point !== undefined && (point.visibility ?? 1) >= MIN_VISIBILITY;
}

/**
 * Returns the head height relative to shoulder width, or null when the
 * shoulders or ears are not clearly visible.
 *
 * @param aspectRatio image width / height. x and y are fractions of different
 *   lengths, so x is scaled to the same unit as y before measuring distances.
 */
export function measureHeadHeight(landmarks: readonly Landmark[], aspectRatio: number): number | null {
  const leftShoulder = landmarks[LANDMARK.LEFT_SHOULDER];
  const rightShoulder = landmarks[LANDMARK.RIGHT_SHOULDER];
  if (!isVisible(leftShoulder) || !isVisible(rightShoulder)) return null;

  const ears = [landmarks[LANDMARK.LEFT_EAR], landmarks[LANDMARK.RIGHT_EAR]].filter(isVisible);
  if (ears.length === 0) return null;

  const dx = (leftShoulder.x - rightShoulder.x) * aspectRatio;
  const dy = leftShoulder.y - rightShoulder.y;
  const shoulderWidth = Math.hypot(dx, dy);
  if (shoulderWidth < MIN_SHOULDER_WIDTH) return null;

  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const earY = ears.reduce((sum, ear) => sum + ear.y, 0) / ears.length;
  // Image y grows downward, so "ears above shoulders" is shoulderY - earY.
  return (shoulderY - earY) / shoulderWidth;
}

/** Median of a non-empty list. Ignores a few odd readings, unlike an average. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export type PostureReading = "good" | "slouching" | "unknown";

export type PostureState = {
  /** The user's calibrated good-posture value, or null before calibration. */
  baseline: number | null;
  /** Measurements collected so far while calibrating, or null when not calibrating. */
  calibrationSamples: number[] | null;
  /** True when the last calibration could not produce a usable baseline. */
  calibrationFailed: boolean;
  reading: PostureReading;
  /** The latest measurement, or null when the person could not be measured. */
  lastValue: number | null;
  /** When the current slouch started, or null. */
  slouchSince: number | null;
  lastAlertAt: number | null;
  /** Goes up by one per alert. */
  alertCount: number;
  /** Index into SLOUCH_MESSAGES for the latest alert. */
  messageIndex: number | null;
};

export type PostureAction =
  | { type: "startCalibration" }
  | { type: "setBaseline"; baseline: number }
  | { type: "sample"; now: number; value: number | null; random: number }
  | { type: "stop" };

export function createPostureState(baseline: number | null = null): PostureState {
  return {
    baseline,
    calibrationSamples: null,
    calibrationFailed: false,
    reading: "unknown",
    lastValue: null,
    slouchSince: null,
    lastAlertAt: null,
    alertCount: 0,
    messageIndex: null,
  };
}

export function isValidBaseline(value: number): boolean {
  // Ears must be clearly above the shoulders when sitting up straight.
  return Number.isFinite(value) && value > 0.1;
}

function nextReading(state: PostureState, value: number, baseline: number): PostureReading {
  if (state.reading === "slouching") {
    return value < baseline * (1 - RECOVER_DROP) ? "slouching" : "good";
  }
  return value < baseline * (1 - SLOUCH_DROP) ? "slouching" : "good";
}

export function postureReducer(state: PostureState, action: PostureAction): PostureState {
  switch (action.type) {
    case "startCalibration":
      return { ...state, calibrationSamples: [], calibrationFailed: false, reading: "unknown", slouchSince: null };

    case "setBaseline":
      if (!isValidBaseline(action.baseline)) return state;
      return { ...state, baseline: action.baseline, calibrationFailed: false };

    case "stop":
      // Keeps the baseline, so the user does not need to calibrate again.
      return { ...state, calibrationSamples: null, reading: "unknown", lastValue: null, slouchSince: null };

    case "sample": {
      const { now, value } = action;

      if (state.calibrationSamples !== null) {
        if (value === null) return { ...state, lastValue: null };
        const samples = [...state.calibrationSamples, value];
        if (samples.length < CALIBRATION_SAMPLES) {
          return { ...state, calibrationSamples: samples, lastValue: value };
        }
        const baseline = median(samples);
        if (!isValidBaseline(baseline)) {
          return { ...state, calibrationSamples: null, calibrationFailed: true, lastValue: value };
        }
        return { ...state, baseline, calibrationSamples: null, reading: "good", lastValue: value };
      }

      // Nobody measurable, or not calibrated yet: no reading, and the slouch timer restarts.
      if (value === null || state.baseline === null) {
        return { ...state, reading: "unknown", lastValue: value, slouchSince: null };
      }

      const reading = nextReading(state, value, state.baseline);
      if (reading === "good") {
        return { ...state, reading, lastValue: value, slouchSince: null };
      }

      const slouchSince = state.slouchSince ?? now;
      const heldLongEnough = now - slouchSince >= SLOUCH_HOLD_MS;
      const cooledDown = state.lastAlertAt === null || now - state.lastAlertAt >= ALERT_COOLDOWN_MS;
      if (heldLongEnough && cooledDown) {
        return {
          ...state,
          reading,
          lastValue: value,
          slouchSince,
          lastAlertAt: now,
          alertCount: state.alertCount + 1,
          messageIndex: pickMessageIndex(state.messageIndex, action.random, SLOUCH_MESSAGES.length),
        };
      }
      return { ...state, reading, lastValue: value, slouchSince };
    }
  }
}
