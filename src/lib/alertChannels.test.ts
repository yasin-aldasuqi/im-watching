import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALERT_CHANNELS,
  MEOW,
  QUIET_TITLE,
  blinkTitle,
  parseAlertChannels,
  pickLocalVoice,
  speechText,
} from "./alertChannels";

describe("parseAlertChannels (untrusted saved data)", () => {
  it("uses the defaults when nothing or garbage is saved", () => {
    for (const raw of [null, "", "{nope", "42", "null", '"text"', "[]"]) {
      expect(parseAlertChannels(raw)).toEqual(DEFAULT_ALERT_CHANNELS);
    }
  });

  it("starts with only blinking on", () => {
    expect(DEFAULT_ALERT_CHANNELS).toMatchObject({ sound: false, speak: false, nudge: false, blink: true });
  });

  it("keeps valid values and replaces invalid ones", () => {
    const parsed = parseAlertChannels(
      JSON.stringify({ sound: true, volume: 0.3, speak: "yes", nudge: true, blink: false, extra: 1 }),
    );
    expect(parsed).toEqual({ sound: true, volume: 0.3, speak: false, nudge: true, blink: false });
  });

  it("keeps the volume between 0 and 1", () => {
    expect(parseAlertChannels(JSON.stringify({ volume: 7 })).volume).toBe(1);
    expect(parseAlertChannels(JSON.stringify({ volume: -2 })).volume).toBe(0);
    expect(parseAlertChannels(JSON.stringify({ volume: "loud" })).volume).toBe(DEFAULT_ALERT_CHANNELS.volume);
  });
});

describe("speechText", () => {
  it("removes emoji so the voice does not read their names", () => {
    expect(speechText("I can see you. 👀")).toBe("I can see you.");
    expect(speechText("Sit up straight or I knock your coffee off the desk. ☕")).toBe(
      "Sit up straight or I knock your coffee off the desk.",
    );
    expect(speechText("Hey! Shoulders back, chin up. 😼")).toBe("Hey! Shoulders back, chin up.");
    // Skin tones, joined emoji, and flags.
    expect(speechText("Stretch 🙆🏽‍♀️ now 🇸🇾")).toBe("Stretch now");
  });

  it("keeps normal text, numbers, and punctuation", () => {
    expect(speechText("Look 20 feet away for 20 seconds!")).toBe("Look 20 feet away for 20 seconds!");
  });
});

describe("pickLocalVoice", () => {
  const online = { name: "Google US English", lang: "en-US", localService: false, default: true };
  const localEnglish = { name: "eSpeak English", lang: "en-GB", localService: true };
  const localArabic = { name: "eSpeak Arabic", lang: "ar", localService: true, default: true };

  it("never picks an online voice, even when it is the browser default", () => {
    expect(pickLocalVoice([online])).toBeNull();
    expect(pickLocalVoice([online, localEnglish])).toBe(localEnglish);
  });

  it("prefers an English offline voice, then any offline voice", () => {
    expect(pickLocalVoice([localArabic, localEnglish])).toBe(localEnglish);
    expect(pickLocalVoice([online, localArabic])).toBe(localArabic);
  });

  it("returns null when there are no voices", () => {
    expect(pickLocalVoice([])).toBeNull();
  });
});

describe("blinkTitle", () => {
  it("alternates between the alert title and a quiet title", () => {
    expect([0, 1, 2, 3].map((frame) => blinkTitle("⏰ Sit up straight!", frame))).toEqual([
      "⏰ Sit up straight!",
      QUIET_TITLE,
      "⏰ Sit up straight!",
      QUIET_TITLE,
    ]);
  });
});

describe("MEOW", () => {
  it("rises, then falls, within its duration", () => {
    const [start, peak, end] = MEOW.pitch;
    expect(peak.frequency).toBeGreaterThan(start.frequency);
    expect(end.frequency).toBeLessThan(peak.frequency);
    expect(end.time).toBeLessThanOrEqual(MEOW.duration);
  });
});
