import { useCallback, useSyncExternalStore } from "react";
import { readSetting, storageKey, writeSetting } from "@/lib/storage";

/**
 * What the posture timer does while the camera is on and calibrated:
 * - smart: remind only if the camera does not see good posture.
 * - camera-only: no posture timer reminders; the camera catches slouching.
 * - always: the posture timer reminds on schedule, as without a camera.
 */
export type PostureMode = "smart" | "camera-only" | "always";

export const POSTURE_MODES: readonly PostureMode[] = ["smart", "camera-only", "always"];
export const DEFAULT_POSTURE_MODE: PostureMode = "smart";

const MODE_SETTING = "posture-mode";
export const POSTURE_MODE_STORAGE_KEY = storageKey(MODE_SETTING);

function isPostureMode(value: unknown): value is PostureMode {
  return typeof value === "string" && (POSTURE_MODES as readonly string[]).includes(value);
}

// The saved mode lives in localStorage, outside React, so it is read with
// useSyncExternalStore. The server snapshot is the default, which keeps the
// server HTML and the first client render the same.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab changed the setting.
  const onStorage = (event: StorageEvent) => {
    if (event.key === POSTURE_MODE_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): PostureMode {
  const saved = readSetting(MODE_SETTING);
  return isPostureMode(saved) ? saved : DEFAULT_POSTURE_MODE;
}

function getServerSnapshot(): PostureMode {
  return DEFAULT_POSTURE_MODE;
}

export function usePostureMode() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setMode = useCallback((next: PostureMode) => {
    if (!isPostureMode(next)) return;
    writeSetting(MODE_SETTING, next);
    listeners.forEach((listener) => listener());
  }, []);
  return { mode, setMode };
}
