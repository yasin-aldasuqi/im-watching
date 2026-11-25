/**
 * Where the pose model and the MediaPipe runtime are served from.
 * Everything is served by this app itself, so turning on the camera makes no
 * requests to other origins.
 */

/** Folder with vision_wasm_internal.{js,wasm}, copied by scripts/copy-mediapipe-wasm.mjs. */
export const MEDIAPIPE_WASM_PATH = "/mediapipe";

/**
 * MediaPipe Pose Landmarker (lite, float16), version 1. Apache-2.0.
 * Source: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
 */
export const POSE_MODEL_PATH = "/models/pose_landmarker_lite.task";

/** SHA-256 of the committed model file. A test checks it, so a swapped file fails CI. */
export const POSE_MODEL_SHA256 =
  "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a";
