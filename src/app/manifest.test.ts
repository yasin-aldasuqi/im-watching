import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

/** Width and height from a PNG file's header (the IHDR chunk). */
function pngSize(publicPath: string): string {
  const file = readFileSync(join(process.cwd(), "public", publicPath));
  expect(file.subarray(1, 4).toString()).toBe("PNG");
  return `${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`;
}

describe("web app manifest", () => {
  const app = manifest();

  it("describes an installable app that opens in its own window", () => {
    expect(app.name).toBe("Karamel");
    expect(app.start_url).toBe("/");
    expect(app.display).toBe("standalone");
  });

  // Chromium needs 192 and 512 pixel icons to offer installing the app.
  it("lists icons that exist, with the sizes they claim", () => {
    for (const icon of app.icons ?? []) {
      expect(pngSize(icon.src)).toBe(icon.sizes);
    }
    const sizes = (app.icons ?? []).filter((icon) => icon.purpose === "any").map((icon) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });

  it("has a maskable icon for Android's round and rounded-square shapes", () => {
    expect(app.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
  });
});
