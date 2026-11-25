import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSetting, storageKey, writeSetting } from "./storage";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("settings storage", () => {
  it("writes and reads under the karamel: prefix", () => {
    writeSetting("interval-sec", "120");
    expect(window.localStorage.getItem("karamel:interval-sec")).toBe("120");
    expect(readSetting("interval-sec")).toBe("120");
    expect(storageKey("interval-sec")).toBe("karamel:interval-sec");
  });

  it("moves a value saved under the old app name to the new key", () => {
    window.localStorage.setItem("im-watching:posture-baseline", "0.75");
    expect(readSetting("posture-baseline")).toBe("0.75");
    expect(window.localStorage.getItem("karamel:posture-baseline")).toBe("0.75");
    expect(window.localStorage.getItem("im-watching:posture-baseline")).toBeNull();
  });

  it("prefers the new key when both exist", () => {
    window.localStorage.setItem("im-watching:auto-restart", "false");
    window.localStorage.setItem("karamel:auto-restart", "true");
    expect(readSetting("auto-restart")).toBe("true");
  });

  it("returns null when nothing is saved", () => {
    expect(readSetting("interval-sec")).toBeNull();
  });

  it("does not throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(readSetting("interval-sec")).toBeNull();
    expect(() => writeSetting("interval-sec", "30")).not.toThrow();
  });
});
