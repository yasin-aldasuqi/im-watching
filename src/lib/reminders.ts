/**
 * The list of reminders a user can have: built-in ones (posture, water, eyes,
 * stretch) and custom ones. Pure: no storage, no DOM.
 *
 * Saved reminders come back from localStorage, which anyone can edit or which
 * can be corrupted, so they are treated as untrusted input and cleaned by
 * sanitizeReminders() before use.
 */

import { EYES_MESSAGES, REMINDER_MESSAGES, STRETCH_MESSAGES, WATER_MESSAGES } from "./messages";
import { DEFAULT_INTERVAL_SEC, isIntervalOption } from "./reminder";

export type BuiltInKind = "posture" | "water" | "eyes" | "stretch";
export type ReminderKind = BuiltInKind | "custom";

export type ReminderConfig = {
  /** Built-in reminders use their kind as id; custom ones use "custom-…". */
  id: string;
  kind: ReminderKind;
  name: string;
  emoji: string;
  enabled: boolean;
  intervalSec: number;
  autoRestart: boolean;
  messages: string[];
};

export const LIMITS = {
  nameLength: 40,
  emojiLength: 8,
  messageLength: 120,
  messages: 20,
  customReminders: 10,
} as const;

type BuiltInDefaults = Omit<ReminderConfig, "id" | "kind" | "messages"> & {
  messages: readonly string[];
};

export const BUILT_IN_ORDER: readonly BuiltInKind[] = ["posture", "water", "eyes", "stretch"];

export const BUILT_IN: Record<BuiltInKind, BuiltInDefaults> = {
  posture: {
    name: "Posture",
    emoji: "🧍",
    enabled: true,
    intervalSec: DEFAULT_INTERVAL_SEC,
    autoRestart: false,
    messages: REMINDER_MESSAGES,
  },
  water: {
    name: "Drink water",
    emoji: "💧",
    enabled: false,
    intervalSec: 2700,
    autoRestart: true,
    messages: WATER_MESSAGES,
  },
  eyes: {
    name: "Rest your eyes",
    emoji: "👀",
    enabled: false,
    intervalSec: 1200,
    autoRestart: true,
    messages: EYES_MESSAGES,
  },
  stretch: {
    name: "Stand up and stretch",
    emoji: "🙆",
    enabled: false,
    intervalSec: 3600,
    autoRestart: false,
    messages: STRETCH_MESSAGES,
  },
};

const CUSTOM_ID = /^custom-[a-z0-9-]{1,40}$/;
const DEFAULT_CUSTOM_NAME = "My reminder";
const DEFAULT_CUSTOM_EMOJI = "⭐";

export function isBuiltIn(kind: ReminderKind): kind is BuiltInKind {
  return kind !== "custom";
}

export function builtInReminder(kind: BuiltInKind): ReminderConfig {
  const defaults = BUILT_IN[kind];
  return { id: kind, kind, ...defaults, messages: [...defaults.messages] };
}

export function defaultReminders(): ReminderConfig[] {
  return BUILT_IN_ORDER.map(builtInReminder);
}

function defaultCustomMessages(name: string): string[] {
  return [`Time for: ${name}! ⭐`];
}

/** The messages a reminder falls back to when its list is empty. */
export function defaultMessages(reminder: Pick<ReminderConfig, "kind" | "name">): string[] {
  return isBuiltIn(reminder.kind)
    ? [...BUILT_IN[reminder.kind].messages]
    : defaultCustomMessages(reminder.name);
}

/** A new custom reminder. The caller passes a unique id (for example from crypto.randomUUID). */
export function createCustomReminder(uniquePart: string): ReminderConfig {
  const id = `custom-${uniquePart.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || "1"}`;
  return {
    id,
    kind: "custom",
    name: DEFAULT_CUSTOM_NAME,
    emoji: DEFAULT_CUSTOM_EMOJI,
    enabled: true,
    intervalSec: DEFAULT_INTERVAL_SEC,
    autoRestart: true,
    messages: defaultCustomMessages(DEFAULT_CUSTOM_NAME),
  };
}

/** Trims, drops empty and duplicate lines, and applies the length and count limits. */
export function cleanMessages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const message = item.trim().slice(0, LIMITS.messageLength);
    if (message === "" || seen.has(message)) continue;
    seen.add(message);
    result.push(message);
    if (result.length === LIMITS.messages) break;
  }
  return result;
}

/** The "one message per line" text box, turned into a clean list. */
export function parseMessagesText(text: string): string[] {
  return cleanMessages(text.split("\n"));
}

export function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().slice(0, LIMITS.nameLength) : "";
  return name || DEFAULT_CUSTOM_NAME;
}

export function cleanEmoji(raw: unknown): string {
  const emoji = typeof raw === "string" ? raw.trim().slice(0, LIMITS.emojiLength) : "";
  return emoji || DEFAULT_CUSTOM_EMOJI;
}

type RawObject = { [key: string]: unknown };

function isObject(value: unknown): value is RawObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Settings fields shared by built-in and custom reminders, with fallbacks. */
function cleanSettings(raw: RawObject, fallback: ReminderConfig): ReminderConfig {
  const intervalSec = Number(raw.intervalSec);
  const messages = cleanMessages(raw.messages);
  return {
    ...fallback,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
    intervalSec: isIntervalOption(intervalSec) ? intervalSec : fallback.intervalSec,
    autoRestart: typeof raw.autoRestart === "boolean" ? raw.autoRestart : fallback.autoRestart,
    messages: messages.length > 0 ? messages : fallback.messages,
  };
}

/**
 * Turns anything (for example JSON read from storage) into a valid list:
 * every built-in reminder exactly once and in order, then up to 10 valid
 * custom reminders. Bad fields fall back to defaults; unknown fields are dropped.
 */
export function sanitizeReminders(raw: unknown): ReminderConfig[] {
  const items = Array.isArray(raw) ? raw.filter(isObject) : [];

  const builtIns = BUILT_IN_ORDER.map((kind) => {
    const saved = items.find((item) => item.id === kind);
    return saved ? cleanSettings(saved, builtInReminder(kind)) : builtInReminder(kind);
  });

  const customs: ReminderConfig[] = [];
  const ids = new Set<string>();
  for (const item of items) {
    if (customs.length === LIMITS.customReminders) break;
    if (typeof item.id !== "string" || !CUSTOM_ID.test(item.id) || ids.has(item.id)) continue;
    ids.add(item.id);
    const name = cleanName(item.name);
    const fallback: ReminderConfig = {
      ...createCustomReminder("x"),
      id: item.id,
      name,
      emoji: cleanEmoji(item.emoji),
      messages: defaultCustomMessages(name),
    };
    customs.push(cleanSettings(item, fallback));
  }

  return [...builtIns, ...customs];
}

/**
 * Before custom reminders, the app had one posture reminder with two saved
 * settings. They become the posture reminder's settings.
 */
export function migrateLegacySettings(
  intervalSec: number | null,
  autoRestart: boolean | null,
): ReminderConfig[] {
  const reminders = defaultReminders();
  const posture = reminders[0];
  if (intervalSec !== null && isIntervalOption(intervalSec)) posture.intervalSec = intervalSec;
  if (autoRestart !== null) posture.autoRestart = autoRestart;
  return reminders;
}
