import { describe, expect, it } from "vitest";
import { REMINDER_MESSAGES, WATER_MESSAGES } from "./messages";
import {
  BUILT_IN_ORDER,
  LIMITS,
  cleanEmoji,
  cleanMessages,
  cleanName,
  createCustomReminder,
  defaultMessages,
  defaultReminders,
  migrateLegacySettings,
  parseMessagesText,
  sanitizeReminders,
} from "./reminders";

describe("defaults", () => {
  it("has the four built-in reminders, with only posture turned on", () => {
    const reminders = defaultReminders();
    expect(reminders.map((r) => r.id)).toEqual(["posture", "water", "eyes", "stretch"]);
    expect(reminders.filter((r) => r.enabled).map((r) => r.id)).toEqual(["posture"]);
    expect(reminders[0].messages).toEqual([...REMINDER_MESSAGES]);
  });

  it("returns fresh copies, so changing one does not change the defaults", () => {
    const first = defaultReminders();
    first[0].messages.push("changed");
    first[0].enabled = false;
    const second = defaultReminders();
    expect(second[0].messages).toEqual([...REMINDER_MESSAGES]);
    expect(second[0].enabled).toBe(true);
  });
});

describe("messages", () => {
  it("cleans a message list: trims, drops empty lines and duplicates", () => {
    expect(cleanMessages(["  Hi  ", "", "Hi", "Bye", 42, null])).toEqual(["Hi", "Bye"]);
    expect(cleanMessages("not a list")).toEqual([]);
  });

  it("limits the length and number of messages", () => {
    const long = "x".repeat(500);
    expect(cleanMessages([long])[0]).toHaveLength(LIMITS.messageLength);
    const many = Array.from({ length: 50 }, (_, i) => `Message ${i}`);
    expect(cleanMessages(many)).toHaveLength(LIMITS.messages);
  });

  it("reads one message per line from the text box", () => {
    expect(parseMessagesText("Drink!\n\n  Sip sip  \nDrink!\n")).toEqual(["Drink!", "Sip sip"]);
  });

  it("falls back to each reminder's default messages", () => {
    expect(defaultMessages({ kind: "water", name: "Drink water" })).toEqual([...WATER_MESSAGES]);
    expect(defaultMessages({ kind: "custom", name: "Call mom" })).toEqual(["Time for: Call mom! ⭐"]);
  });
});

describe("custom reminders", () => {
  it("are created with a safe id and sensible defaults", () => {
    const reminder = createCustomReminder("3F2A-<script>-9b");
    expect(reminder.id).toBe("custom-3f2a-script-9b");
    expect(reminder).toMatchObject({ kind: "custom", enabled: true, name: "My reminder", emoji: "⭐" });
    expect(reminder.messages.length).toBeGreaterThan(0);
  });

  it("clean names and emoji", () => {
    expect(cleanName("  Call mom  ")).toBe("Call mom");
    expect(cleanName("")).toBe("My reminder");
    expect(cleanName("n".repeat(100))).toHaveLength(LIMITS.nameLength);
    expect(cleanEmoji(" 📞 ")).toBe("📞");
    expect(cleanEmoji(42)).toBe("⭐");
  });
});

describe("sanitizeReminders (untrusted saved data)", () => {
  it("returns the defaults for anything that is not a list", () => {
    for (const bad of [null, undefined, 42, "text", { reminders: [] }]) {
      expect(sanitizeReminders(bad)).toEqual(defaultReminders());
    }
  });

  it("keeps valid saved settings for built-in reminders", () => {
    const saved = [
      { id: "water", enabled: true, intervalSec: 3600, autoRestart: false, messages: ["Drink!"] },
    ];
    const water = sanitizeReminders(saved).find((r) => r.id === "water")!;
    expect(water).toMatchObject({ enabled: true, intervalSec: 3600, autoRestart: false, messages: ["Drink!"] });
    // Built-in names and emoji are not taken from storage.
    expect(water).toMatchObject({ name: "Drink water", emoji: "💧", kind: "water" });
  });

  it("replaces invalid fields with defaults and drops unknown fields", () => {
    const saved = [
      { id: "posture", enabled: "yes", intervalSec: 7, autoRestart: 1, messages: [], evil: "<script>" },
    ];
    const posture = sanitizeReminders(saved)[0];
    expect(posture).toEqual(defaultReminders()[0]);
    expect(posture).not.toHaveProperty("evil");
  });

  it("always has every built-in reminder once, in order", () => {
    const saved = [{ id: "stretch", enabled: true }, { id: "posture" }, { id: "posture", enabled: false }];
    const result = sanitizeReminders(saved);
    expect(result.map((r) => r.id)).toEqual([...BUILT_IN_ORDER]);
    expect(result.find((r) => r.id === "stretch")!.enabled).toBe(true);
  });

  it("keeps valid custom reminders and drops bad ids and duplicates", () => {
    const saved = [
      { id: "custom-abc", name: "Call mom", emoji: "📞", enabled: true, intervalSec: 3600, messages: ["Call!"] },
      { id: "custom-abc", name: "Duplicate" },
      { id: "../../etc", name: "Bad id" },
      { id: "custom-UPPER", name: "Bad id" },
      { name: "No id" },
    ];
    const customs = sanitizeReminders(saved).filter((r) => r.kind === "custom");
    expect(customs).toEqual([
      {
        id: "custom-abc",
        kind: "custom",
        name: "Call mom",
        emoji: "📞",
        enabled: true,
        intervalSec: 3600,
        autoRestart: true,
        messages: ["Call!"],
      },
    ]);
  });

  it("limits the number of custom reminders", () => {
    const saved = Array.from({ length: 30 }, (_, i) => ({ id: `custom-${i}`, name: `R${i}` }));
    expect(sanitizeReminders(saved).filter((r) => r.kind === "custom")).toHaveLength(LIMITS.customReminders);
  });

  it("gives a custom reminder with no messages a default message using its name", () => {
    const [custom] = sanitizeReminders([{ id: "custom-x", name: "Feed fish", messages: ["", "  "] }]).filter(
      (r) => r.kind === "custom",
    );
    expect(custom.messages).toEqual(["Time for: Feed fish! ⭐"]);
  });

  it("is stable: cleaning an already clean list changes nothing", () => {
    const clean = sanitizeReminders([{ id: "custom-a", name: "A" }, { id: "eyes", enabled: true }]);
    expect(sanitizeReminders(JSON.parse(JSON.stringify(clean)))).toEqual(clean);
  });
});

describe("migrateLegacySettings", () => {
  it("moves the old interval and auto-restart into the posture reminder", () => {
    const [posture, ...rest] = migrateLegacySettings(120, true);
    expect(posture).toMatchObject({ id: "posture", intervalSec: 120, autoRestart: true, enabled: true });
    expect(rest).toEqual(defaultReminders().slice(1));
  });

  it("ignores old values that are not valid", () => {
    expect(migrateLegacySettings(7, null)).toEqual(defaultReminders());
  });
});
