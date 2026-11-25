// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MEDIAPIPE_WASM_PATH, POSE_MODEL_PATH, POSE_MODEL_SHA256 } from "./poseModel";

const publicDir = join(process.cwd(), "public");

describe("pose model assets", () => {
  it("the committed model file matches the pinned SHA-256", () => {
    const bytes = readFileSync(join(publicDir, POSE_MODEL_PATH));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(POSE_MODEL_SHA256);
  });

  it("the MediaPipe runtime was copied into public/ by the postinstall script", () => {
    for (const file of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) {
      expect(existsSync(join(publicDir, MEDIAPIPE_WASM_PATH, file))).toBe(true);
    }
  });
});
