import { useCallback, useSyncExternalStore } from "react";
import { readSetting, storageKey, writeSetting } from "./storage";

/**
 * A saved setting that React components can read and change.
 *
 * The value lives in localStorage, outside React, so it is read with
 * useSyncExternalStore: the server snapshot is the default (so server HTML and
 * the first client render match), and the `storage` event keeps several open
 * tabs in sync. Saved values are untrusted, so `parse` must validate them.
 */
export function createSettingStore<T>(options: {
  name: string;
  defaultValue: T;
  /** Turns the raw saved string into a valid value, or the default. */
  parse: (raw: string | null) => T;
  serialize: (value: T) => string;
}) {
  const { name, defaultValue, parse, serialize } = options;
  const key = storageKey(name);
  const listeners = new Set<() => void>();
  // useSyncExternalStore needs the same object back while nothing changed.
  let cachedRaw: string | null | undefined;
  let cachedValue: T = defaultValue;

  function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) onChange();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  }

  function getSnapshot(): T {
    const raw = readSetting(name);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedValue = parse(raw);
    }
    return cachedValue;
  }

  function getServerSnapshot(): T {
    return defaultValue;
  }

  function set(value: T): void {
    writeSetting(name, serialize(value));
    listeners.forEach((listener) => listener());
  }

  function useSetting() {
    const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const setValue = useCallback((next: T) => set(next), []);
    return [value, setValue] as const;
  }

  return { key, useSetting, set, getSnapshot };
}
