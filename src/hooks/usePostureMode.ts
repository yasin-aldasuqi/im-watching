import { createSettingStore } from "@/lib/settingStore";

/**
 * What the posture timer does while the camera is on and calibrated:
 * - smart: remind only if the camera does not see good posture.
 * - camera-only: no posture timer reminders; the camera catches slouching.
 * - always: the posture timer reminds on schedule, as without a camera.
 */
export type PostureMode = "smart" | "camera-only" | "always";

export const POSTURE_MODES: readonly PostureMode[] = ["smart", "camera-only", "always"];
export const DEFAULT_POSTURE_MODE: PostureMode = "smart";

function isPostureMode(value: unknown): value is PostureMode {
  return typeof value === "string" && (POSTURE_MODES as readonly string[]).includes(value);
}

const store = createSettingStore<PostureMode>({
  name: "posture-mode",
  defaultValue: DEFAULT_POSTURE_MODE,
  parse: (raw) => (isPostureMode(raw) ? raw : DEFAULT_POSTURE_MODE),
  serialize: (mode) => mode,
});

export const POSTURE_MODE_STORAGE_KEY = store.key;

export function usePostureMode() {
  const [mode, setValue] = store.useSetting();
  const setMode = (next: PostureMode) => {
    if (isPostureMode(next)) setValue(next);
  };
  return { mode, setMode };
}
