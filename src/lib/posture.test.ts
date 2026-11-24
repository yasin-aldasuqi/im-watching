import { describe, expect, it } from "vitest";
import { SLOUCH_MESSAGES } from "./messages";
import {
  ALERT_COOLDOWN_MS,
  CALIBRATION_SAMPLES,
  LANDMARK,
  SLOUCH_HOLD_MS,
  createPostureState,
  measureHeadHeight,
  median,
  postureReducer,
  type Landmark,
  type PostureState,
} from "./posture";

type PoseOptions = {
  earY?: number;
  shoulderY?: number;
  /** Half of the shoulder width, in image widths. */
  halfWidth?: number;
  centerX?: number;
  leftEarVisibility?: number;
  rightEarVisibility?: number;
  shoulderVisibility?: number;
  tilt?: number;
};

/** Builds a 33-point pose with only the points this module uses filled in. */
function pose({
  earY = 0.4,
  shoulderY = 0.7,
  halfWidth = 0.15,
  centerX = 0.5,
  leftEarVisibility = 0.9,
  rightEarVisibility = 0.9,
  shoulderVisibility = 0.9,
  tilt = 0,
}: PoseOptions = {}): Landmark[] {
  const points: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  points[LANDMARK.LEFT_EAR] = { x: centerX + 0.05, y: earY, visibility: leftEarVisibility };
  points[LANDMARK.RIGHT_EAR] = { x: centerX - 0.05, y: earY, visibility: rightEarVisibility };
  points[LANDMARK.LEFT_SHOULDER] = { x: centerX + halfWidth, y: shoulderY + tilt, visibility: shoulderVisibility };
  points[LANDMARK.RIGHT_SHOULDER] = { x: centerX - halfWidth, y: shoulderY - tilt, visibility: shoulderVisibility };
  return points;
}

describe("measureHeadHeight", () => {
  it("is the ear height above the shoulders divided by the shoulder width", () => {
    // (0.7 - 0.4) / (2 * 0.15) = 1
    expect(measureHeadHeight(pose(), 1)).toBeCloseTo(1);
    expect(measureHeadHeight(pose({ earY: 0.55 }), 1)).toBeCloseTo(0.5);
  });

  it("converts x to the same unit as y using the aspect ratio", () => {
    // On a 16:9 image, the same fractions mean wider shoulders in real pixels.
    expect(measureHeadHeight(pose(), 16 / 9)).toBeCloseTo(1 / (16 / 9));
  });

  it("does not change when the person moves closer to or further from the camera", () => {
    const near = measureHeadHeight(pose({ earY: 0.3, shoulderY: 0.8, halfWidth: 0.25 }), 1);
    const far = measureHeadHeight(pose({ earY: 0.45, shoulderY: 0.65, halfWidth: 0.1 }), 1);
    expect(near).toBeCloseTo(1);
    expect(far).toBeCloseTo(1);
  });

  it("uses one ear when the other is hidden", () => {
    expect(measureHeadHeight(pose({ leftEarVisibility: 0.1 }), 1)).toBeCloseTo(1);
  });

  it("returns null when it cannot measure reliably", () => {
    expect(measureHeadHeight(pose({ shoulderVisibility: 0.2 }), 1)).toBeNull();
    expect(measureHeadHeight(pose({ leftEarVisibility: 0.2, rightEarVisibility: 0.2 }), 1)).toBeNull();
    expect(measureHeadHeight(pose({ halfWidth: 0.01 }), 1)).toBeNull();
    expect(measureHeadHeight([], 1)).toBeNull();
  });

  it("includes shoulder tilt in the shoulder width", () => {
    const level = measureHeadHeight(pose(), 1)!;
    const tilted = measureHeadHeight(pose({ tilt: 0.05 }), 1)!;
    expect(tilted).toBeLessThan(level);
  });
});

describe("median", () => {
  it("handles odd and even lengths and ignores an outlier", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([1, 1, 1, 1, 50])).toBe(1);
  });
});

const T0 = 1_000_000;

function sample(state: PostureState, value: number | null, now: number, random = 0): PostureState {
  return postureReducer(state, { type: "sample", now, value, random });
}

/** Feeds the same value once per 250 ms (4 checks per second) for `ms` milliseconds. */
function hold(state: PostureState, value: number | null, from: number, ms: number) {
  let s = state;
  let now = from;
  for (; now <= from + ms; now += 250) s = sample(s, value, now);
  return { state: s, now: now - 250 };
}

describe("calibration", () => {
  it("collects samples and uses their median as the baseline", () => {
    let state = postureReducer(createPostureState(), { type: "startCalibration" });
    const values = [1, 1.02, 0.98, 1, 5 /* odd reading */, 1.01, 0.99, 1];
    values.forEach((v, i) => {
      state = sample(state, v, T0 + i * 250);
    });
    expect(values).toHaveLength(CALIBRATION_SAMPLES);
    expect(state.calibrationSamples).toBeNull();
    expect(state.baseline).toBeCloseTo(1);
    expect(state.reading).toBe("good");
  });

  it("only counts measurable samples", () => {
    let state = postureReducer(createPostureState(), { type: "startCalibration" });
    for (let i = 0; i < 20; i++) state = sample(state, null, T0 + i);
    expect(state.calibrationSamples).toEqual([]);
    expect(state.baseline).toBeNull();
  });

  it("fails clearly when the posture cannot be a valid baseline", () => {
    let state = postureReducer(createPostureState(), { type: "startCalibration" });
    for (let i = 0; i < CALIBRATION_SAMPLES; i++) state = sample(state, 0.01, T0 + i);
    expect(state.baseline).toBeNull();
    expect(state.calibrationFailed).toBe(true);
    expect(state.calibrationSamples).toBeNull();
  });

  it("setBaseline accepts only a usable value", () => {
    expect(postureReducer(createPostureState(), { type: "setBaseline", baseline: 0.9 }).baseline).toBe(0.9);
    const state = createPostureState();
    expect(postureReducer(state, { type: "setBaseline", baseline: -1 })).toBe(state);
    expect(postureReducer(state, { type: "setBaseline", baseline: Number.NaN })).toBe(state);
  });
});

describe("reading", () => {
  const calibrated = createPostureState(1);

  it("is unknown before calibration, even with a measurement", () => {
    expect(sample(createPostureState(), 0.5, T0).reading).toBe("unknown");
  });

  it("is slouching only after dropping 15% below the baseline", () => {
    expect(sample(calibrated, 0.86, T0).reading).toBe("good");
    expect(sample(calibrated, 0.84, T0).reading).toBe("slouching");
  });

  it("uses hysteresis: once slouching, it needs to recover past 7.5% below the baseline", () => {
    const slouching = sample(calibrated, 0.8, T0);
    expect(sample(slouching, 0.9, T0 + 250).reading).toBe("slouching");
    expect(sample(slouching, 0.93, T0 + 250).reading).toBe("good");
  });

  it("is unknown when the person cannot be measured", () => {
    expect(sample(calibrated, null, T0).reading).toBe("unknown");
  });
});

describe("alerts", () => {
  const calibrated = createPostureState(1);

  it("fire only after 5 seconds of continuous slouching", () => {
    const almost = hold(calibrated, 0.7, T0, SLOUCH_HOLD_MS - 250);
    expect(almost.state.alertCount).toBe(0);
    const fired = sample(almost.state, 0.7, T0 + SLOUCH_HOLD_MS);
    expect(fired.alertCount).toBe(1);
    expect(fired.lastAlertAt).toBe(T0 + SLOUCH_HOLD_MS);
    expect(fired.messageIndex).not.toBeNull();
    expect(fired.messageIndex!).toBeLessThan(SLOUCH_MESSAGES.length);
  });

  it("restart the 5 seconds when posture becomes good in between", () => {
    const first = hold(calibrated, 0.7, T0, 4000);
    const now = first.now;
    let state = first.state;
    state = sample(state, 1, now + 250);
    ({ state } = hold(state, 0.7, now + 500, 4000));
    expect(state.alertCount).toBe(0);
  });

  it("restart the 5 seconds when the person leaves the camera", () => {
    const first = hold(calibrated, 0.7, T0, 4000);
    const now = first.now;
    let state = first.state;
    state = sample(state, null, now + 250);
    ({ state } = hold(state, 0.7, now + 500, 4000));
    expect(state.alertCount).toBe(0);
  });

  it("wait at least 60 seconds between alerts, then pick a different message", () => {
    let { state, now } = hold(calibrated, 0.7, T0, SLOUCH_HOLD_MS);
    expect(state.alertCount).toBe(1);
    const firstMessage = state.messageIndex;
    const firstAlertAt = state.lastAlertAt!;

    ({ state, now } = hold(state, 0.7, now + 250, ALERT_COOLDOWN_MS - 1000));
    expect(state.alertCount).toBe(1);

    state = sample(state, 0.7, firstAlertAt + ALERT_COOLDOWN_MS);
    expect(state.alertCount).toBe(2);
    expect(state.messageIndex).not.toBe(firstMessage);
    expect(now).toBeGreaterThan(firstAlertAt);
  });

  it("never fire before calibration", () => {
    const { state } = hold(createPostureState(), 0.1, T0, 3 * ALERT_COOLDOWN_MS);
    expect(state.alertCount).toBe(0);
  });
});

describe("stop", () => {
  it("clears the live reading and keeps the baseline", () => {
    const slouching = hold(createPostureState(1), 0.7, T0, 2000).state;
    const stopped = postureReducer(slouching, { type: "stop" });
    expect(stopped).toMatchObject({ baseline: 1, reading: "unknown", slouchSince: null, lastValue: null });
  });

  it("cancels a calibration in progress", () => {
    const calibrating = postureReducer(createPostureState(), { type: "startCalibration" });
    expect(postureReducer(calibrating, { type: "stop" }).calibrationSamples).toBeNull();
  });
});
