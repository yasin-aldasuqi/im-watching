import { describe, expect, it } from "vitest";
import { REMINDER_MESSAGES, pickMessageIndex } from "./messages";

const COUNT = REMINDER_MESSAGES.length;
const randoms = Array.from({ length: 200 }, (_, i) => i / 200).concat([0, 0.999999, 1, -1]);

describe("pickMessageIndex", () => {
  it("returns a valid index when there is no previous message", () => {
    for (const r of randoms) {
      const index = pickMessageIndex(null, r);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(COUNT);
    }
  });

  it("never returns the previous index", () => {
    for (let previous = 0; previous < COUNT; previous++) {
      for (const r of randoms) {
        const index = pickMessageIndex(previous, r);
        expect(index).not.toBe(previous);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(COUNT);
      }
    }
  });

  it("can reach every other message", () => {
    for (let previous = 0; previous < COUNT; previous++) {
      const reached = new Set(randoms.map((r) => pickMessageIndex(previous, r)));
      expect(reached.size).toBe(COUNT - 1);
    }
  });

  it("treats an out-of-range previous index like no previous message", () => {
    expect(pickMessageIndex(COUNT + 3, 0)).toBe(0);
  });
});
