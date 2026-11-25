/**
 * Extra ways to remind the user, on top of the speech bubble and desktop
 * notifications. Pure: no audio, speech, or DOM here.
 */

export type AlertChannels = {
  /** A short synthesized "meow". */
  sound: boolean;
  /** 0 to 1. */
  volume: number;
  /** The kitten reads the message out loud, with an offline voice only. */
  speak: boolean;
  /** A full-screen window until the user presses "Got it". */
  nudge: boolean;
  /** Flash the tab title and icon while the user is in another tab. */
  blink: boolean;
};

/** Disruptive channels start off; blinking only shows in another tab, so it starts on. */
export const DEFAULT_ALERT_CHANNELS: AlertChannels = {
  sound: false,
  volume: 0.6,
  speak: false,
  nudge: false,
  blink: true,
};

/** Saved settings are untrusted: anything invalid falls back to the default. */
export function parseAlertChannels(raw: string | null): AlertChannels {
  let saved: unknown;
  try {
    saved = raw === null ? null : JSON.parse(raw);
  } catch {
    saved = null;
  }
  const value = typeof saved === "object" && saved !== null ? (saved as Record<string, unknown>) : {};
  const flag = (key: "sound" | "speak" | "nudge" | "blink") =>
    typeof value[key] === "boolean" ? (value[key] as boolean) : DEFAULT_ALERT_CHANNELS[key];
  const volume =
    typeof value.volume === "number" && Number.isFinite(value.volume)
      ? Math.min(1, Math.max(0, value.volume))
      : DEFAULT_ALERT_CHANNELS.volume;
  return { sound: flag("sound"), volume, speak: flag("speak"), nudge: flag("nudge"), blink: flag("blink") };
}

/** Something the user should notice: a reminder firing or a slouch alert. */
export type Alert = {
  /** For example "💧 Drink water" or "👀 Caught you slouching". */
  title: string;
  message: string;
};

/**
 * The message without emoji, for speech. Otherwise the voice would read out
 * names like "face with tears of joy".
 */
export function speechText(message: string): string {
  return message
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200D|\uFE0F/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The parts of SpeechSynthesisVoice this app looks at. */
export type VoiceInfo = { lang: string; localService: boolean; default?: boolean };

/**
 * An offline voice, preferring English. Online voices (for example Chrome's
 * "Google" voices) send the text to a server, which would break the privacy
 * promise, so they are never used. Returns null when there is no offline voice.
 */
export function pickLocalVoice<V extends VoiceInfo>(voices: readonly V[]): V | null {
  const local = voices.filter((voice) => voice.localService);
  const english = local.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  return english.find((v) => v.default) ?? english[0] ?? local.find((v) => v.default) ?? local[0] ?? null;
}

export const QUIET_TITLE = "🐾 Karamel";

/** The tab title for a blink frame: the alert title, then a quiet one, and so on. */
export function blinkTitle(alertTitle: string, frame: number): string {
  return frame % 2 === 0 ? alertTitle : QUIET_TITLE;
}

/**
 * The "meow": the pitch rises quickly, then falls, like a small cat.
 * Times in seconds, frequencies in hertz.
 */
export const MEOW = {
  duration: 0.45,
  pitch: [
    { time: 0, frequency: 620 },
    { time: 0.12, frequency: 1050 },
    { time: 0.45, frequency: 540 },
  ],
} as const;
