import type { Landmark } from "./posture";
import { MEDIAPIPE_WASM_PATH, POSE_MODEL_PATH } from "./poseModel";

/** The small part of the pose model the app uses. Tests replace it with a fake. */
export type PoseDetector = {
  /** Landmarks of the first person found in the current video frame, or null if nobody was found. */
  detect(video: HTMLVideoElement, timestampMs: number): Landmark[] | null;
  close(): void;
};

/**
 * Loads MediaPipe's pose landmarker from this app's own origin.
 *
 * The library is imported dynamically, so its JavaScript is a separate chunk
 * that is only downloaded when the user turns on the camera.
 */
export async function createPoseDetector(): Promise<PoseDetector> {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);

  const create = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL_PATH, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      outputSegmentationMasks: false,
    });

  let landmarker;
  try {
    landmarker = await create("GPU");
  } catch {
    // No usable GPU (some browsers, VMs, and headless test browsers). The CPU is slower but works.
    landmarker = await create("CPU");
  }

  return {
    detect(video, timestampMs) {
      const result = landmarker.detectForVideo(video, timestampMs);
      return result.landmarks[0] ?? null;
    },
    close() {
      landmarker.close();
    },
  };
}
