/**
 * Small helpers for settings saved in localStorage.
 *
 * Keys start with "karamel:". The app used to be called "I'm Watching" and
 * used "im-watching:". The first time a setting is read, an old value is moved
 * to the new key, so users keep their settings after the rename.
 *
 * Storage can be blocked (private mode, site settings). Then reads return null
 * and writes do nothing, and the app uses its defaults.
 */

const PREFIX = "karamel:";
const LEGACY_PREFIX = "im-watching:";

export function storageKey(name: string): string {
  return PREFIX + name;
}

export function readSetting(name: string): string | null {
  try {
    const storage = window.localStorage;
    const value = storage.getItem(PREFIX + name);
    if (value !== null) return value;

    const legacy = storage.getItem(LEGACY_PREFIX + name);
    if (legacy === null) return null;
    storage.setItem(PREFIX + name, legacy);
    storage.removeItem(LEGACY_PREFIX + name);
    return legacy;
  } catch {
    return null;
  }
}

export function writeSetting(name: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + name, value);
  } catch {
    // Not saving is fine. The app falls back to its defaults next time.
  }
}

export function removeSetting(name: string): void {
  try {
    window.localStorage.removeItem(PREFIX + name);
  } catch {
    // Nothing to do.
  }
}
