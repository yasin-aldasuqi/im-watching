import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUSH_SYNC_DELAY_MS } from "@/hooks/usePushReminders";
import { PUSH_DEVICE_STORAGE_KEY } from "@/lib/pushClient";
import { REMINDER_TEXTS_CACHE } from "@/lib/pushTexts";
import { installFakePush, removeFakePush } from "@/test-utils/fakePush";
import PostureBuddy from "./PostureBuddy";

const PUSH_TITLE = "Remind me when Karamel is closed";

async function renderBuddy() {
  const view = render(
    <PostureBuddy>
      <svg />
    </PostureBuddy>,
  );
  await settle();
  return view;
}

/** Lets fetches and other promises finish, and runs timers up to `ms` ahead. */
async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const pushRow = () => within(screen.getByRole("group", { name: PUSH_TITLE }));
const lastPut = (fake: ReturnType<typeof installFakePush>) => fake.calls.filter((c) => c.method === "PUT").at(-1);

async function turnOn() {
  fireEvent.click(pushRow().getByRole("button", { name: "Turn on" }));
  await settle(); // Turning on finishes; React then runs the effect that schedules the sync...
  await settle(PUSH_SYNC_DELAY_MS); // ...which is sent after the short delay.
}

let savedTexts: Map<string, string>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-27T09:00:00Z"));
  vi.spyOn(Math, "random").mockReturnValue(0);
  window.localStorage.clear();
  savedTexts = new Map();
  vi.stubGlobal("caches", {
    open: async (name: string) => ({
      put: async (_url: string, response: Response) => savedTexts.set(name, await response.text()),
    }),
    delete: async (name: string) => savedTexts.delete(name),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  removeFakePush();
});

describe("when the option shows", () => {
  it("is hidden, and never asks for /api, when this website has no push server", async () => {
    vi.stubEnv("KARAMEL_PUSH_SERVER", "off");
    const fake = installFakePush({ server: false });
    await renderBuddy();
    expect(screen.queryByText(PUSH_TITLE)).not.toBeInTheDocument();
    expect(fake.calls).toEqual([]);
  });

  it("shows, and says so, when the server is configured but down", async () => {
    const fake = installFakePush();
    fake.serverDown = true;
    await renderBuddy();
    fireEvent.click(pushRow().getByRole("button", { name: "Turn on" }));
    await settle();
    expect(pushRow().getByRole("alert")).toHaveTextContent("Couldn't reach Karamel's server");
    expect(pushRow().getByRole("button", { name: "Turn on" })).toBeInTheDocument();
  });

  it("explains the Home Screen step on iPhone and iPad in Safari", async () => {
    installFakePush({ pushManager: false });
    Object.defineProperty(navigator, "standalone", { configurable: true, value: false });
    await renderBuddy();
    expect(pushRow().getByText(/add Karamel to your Home Screen first/)).toBeInTheDocument();
    expect(pushRow().queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("turning it on and using it", () => {
  it("registers this device and keeps the server's list in step with the timers", async () => {
    const fake = installFakePush();
    await renderBuddy();
    await turnOn();

    expect(pushRow().getByRole("status")).toHaveTextContent("On: reminders arrive even when Karamel is closed.");
    expect(lastPut(fake)?.body).toEqual({ schedules: [] }); // Nothing running yet.

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await settle(PUSH_SYNC_DELAY_MS);
    expect(lastPut(fake)?.body).toEqual({
      schedules: [{ reminderKey: "posture", firesInSeconds: 1800, intervalSeconds: null }],
    });

    const puts = fake.calls.filter((c) => c.method === "PUT").length;
    await settle(60_000); // A minute of ticking: the schedule did not change, so no calls.
    expect(fake.calls.filter((c) => c.method === "PUT")).toHaveLength(puts);

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await settle(PUSH_SYNC_DELAY_MS);
    expect(lastPut(fake)?.body).toEqual({ schedules: [] });
  });

  it("saves the reminder texts on the device for the service worker", async () => {
    installFakePush();
    await renderBuddy();
    await turnOn();
    const texts = JSON.parse(savedTexts.get(REMINDER_TEXTS_CACHE)!);
    expect(texts.water.title).toBe("💧 Drink water · Karamel");
    expect(texts.water.messages.length).toBeGreaterThan(0);
  });

  it("turns off: the server forgets the device and the texts are deleted", async () => {
    const fake = installFakePush();
    await renderBuddy();
    await turnOn();
    const device = JSON.parse(window.localStorage.getItem(PUSH_DEVICE_STORAGE_KEY)!);

    fireEvent.click(pushRow().getByRole("button", { name: "Turn off" }));
    await settle();

    expect(fake.calls.at(-1)).toMatchObject({ method: "DELETE", path: `/api/devices/${device.deviceId}` });
    expect(pushRow().getByRole("button", { name: "Turn on" })).toBeInTheDocument();
    expect(savedTexts.has(REMINDER_TEXTS_CACHE)).toBe(false);
  });

  it("explains blocked notifications and stays off", async () => {
    const fake = installFakePush({ grant: false });
    await renderBuddy();
    fireEvent.click(pushRow().getByRole("button", { name: "Turn on" }));
    await settle();
    expect(pushRow().getByRole("alert")).toHaveTextContent("Notifications are blocked");
    expect(pushRow().getByRole("button", { name: "Turn on" })).toBeInTheDocument();
    expect(fake.calls.some((c) => c.method === "POST")).toBe(false);
  });
});

describe("closing, reopening, and a bad connection", () => {
  it("is still on after reopening, and resends the restored session", async () => {
    const fake = installFakePush();
    const first = await renderBuddy();
    await turnOn();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await settle(10 * 60_000);
    first.unmount();

    await renderBuddy();
    await settle(PUSH_SYNC_DELAY_MS);

    expect(pushRow().getByRole("status")).toHaveTextContent("On:");
    expect(lastPut(fake)?.body).toEqual({
      schedules: [{ reminderKey: "posture", firesInSeconds: 20 * 60, intervalSeconds: null }],
    });
  });

  it("says so when the server is unreachable, and catches up when back online", async () => {
    const fake = installFakePush();
    await renderBuddy();
    await turnOn();
    fake.serverDown = true;

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await settle(PUSH_SYNC_DELAY_MS);
    expect(pushRow().getByRole("alert")).toHaveTextContent("Couldn't reach Karamel's server");

    fake.serverDown = false;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await settle(PUSH_SYNC_DELAY_MS);
    expect(pushRow().queryByRole("alert")).not.toBeInTheDocument();
    expect(lastPut(fake)?.body).toMatchObject({ schedules: [{ reminderKey: "posture" }] });
  });
});
