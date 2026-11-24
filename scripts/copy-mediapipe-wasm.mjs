// Copies the MediaPipe WebAssembly runtime from node_modules into public/,
// so the app serves it from its own origin instead of a third-party CDN.
// Runs automatically after `npm install` (see "postinstall" in package.json).
//
// Only one loader/binary pair is needed. The files are large (~15 MB), so they
// are generated here instead of being committed to git.

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const target = join(root, "public", "mediapipe");
const files = ["vision_wasm_internal.js", "vision_wasm_internal.wasm"];

mkdirSync(target, { recursive: true });
for (const file of files) {
  copyFileSync(join(source, file), join(target, file));
}
console.log(`Copied MediaPipe runtime to ${target}`);
