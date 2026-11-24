import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DUE_TITLE, INTERVAL_STORAGE_KEY } from "@/hooks/useReminder";
import { minutesToMs } from "@/lib/reminder";
import ReminderPanel from "./ReminderPanel";

const PAGE_TITLE = "I'm Watching";

function renderPanel() {
  return render(
    <ReminderPanel>
      <svg data-testid="kitten" />
    </ReminderPanel>,
  );
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function countdown() {
  return screen.getByTestId("countdown").textContent;
}

function click(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

/** Minimal stand-in for the browser Notification API. */
function installNotificationMock(permission: NotificationPermission) {
  const created: { title: string; options?: NotificationOptions }[] = [];
  class MockNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = vi.fn(async () => {
      MockNotification.permission = "granted";
      return MockNotification.permission;
    });
    onclick: (() => void) | null = null;
    close = vi.fn();
    constructor(title: string, options?: NotificationOptions) {
      created.push({ title, options });
    }
  }
  vi.stubGlobal("Notification", MockNotification);
  return { created, MockNotification };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-24T09:00:00Z"));
  window.localStorage.clear();
  document.title = PAGE_TITLE;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ReminderPanel", () => {
  it("counts down, reminds when time is up, and restarts after acknowledge", () => {
    renderPanel();
    expect(countdown()).toBe("30:00");
    expect(screen.getByRole("status")).toHaveTextContent("Pick an interval");

    click("Start");
    advance(1000);
    expect(countdown()).toBe("29:59");

    advance(minutesToMs(30) - 1000);
    expect(countdown()).toBe("00:00");
    expect(screen.getByRole("status")).toHaveTextContent("Time to sit up straight!");
    expect(screen.getByText(/Sit up straight! 🐾/)).toBeInTheDocument();
    expect(document.title).toBe(DUE_TITLE);

    click("I'm sitting tall");
    expect(countdown()).toBe("30:00");
    expect(document.title).toBe(PAGE_TITLE);
    expect(screen.queryByText(/Sit up straight! 🐾/)).not.toBeInTheDocument();

    advance(1000);
    expect(countdown()).toBe("29:59");
  });

  it("does not count time while paused", () => {
    renderPanel();
    click("Start");
    advance(minutesToMs(10));
    click("Pause");
    expect(countdown()).toBe("20:00");

    advance(minutesToMs(60));
    expect(countdown()).toBe("20:00");
    expect(document.title).toBe(PAGE_TITLE);

    click("Resume");
    advance(minutesToMs(20));
    expect(document.title).toBe(DUE_TITLE);
  });

  it("catches up when a throttled background tab becomes visible again", () => {
    renderPanel();
    click("Start");

    // Jump the clock without running any timers, like a throttled tab.
    act(() => {
      vi.setSystemTime(Date.now() + minutesToMs(31));
    });
    expect(document.title).toBe(PAGE_TITLE);

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(document.title).toBe(DUE_TITLE);
    expect(countdown()).toBe("00:00");
  });

  it("reset goes back to idle with the full interval", () => {
    renderPanel();
    click("Start");
    advance(minutesToMs(5));
    click("Reset");
    expect(countdown()).toBe("30:00");
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });

  it("saves the chosen interval and restores it on the next visit", () => {
    const { unmount } = renderPanel();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "15" } });
    expect(countdown()).toBe("15:00");
    expect(window.localStorage.getItem(INTERVAL_STORAGE_KEY)).toBe("15");
    unmount();

    renderPanel();
    expect(countdown()).toBe("15:00");
  });

  it("ignores an invalid saved interval", () => {
    window.localStorage.setItem(INTERVAL_STORAGE_KEY, "7");
    renderPanel();
    expect(countdown()).toBe("30:00");
  });

  it("locks the interval while a cycle is running", () => {
    renderPanel();
    click("Start");
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("sends one notification per reminder when permission is granted", () => {
    const { created } = installNotificationMock("granted");
    renderPanel();
    expect(screen.getByText("Desktop notifications are on.")).toBeInTheDocument();

    click("Start");
    advance(minutesToMs(30));
    expect(created).toHaveLength(1);
    expect(created[0].title).toBe("I'm Watching");

    // More ticks while due must not send more notifications.
    advance(minutesToMs(5));
    expect(created).toHaveLength(1);
  });

  it("asks for permission only when the user clicks the button", async () => {
    const { created, MockNotification } = installNotificationMock("default");
    renderPanel();
    expect(MockNotification.requestPermission).not.toHaveBeenCalled();

    await act(async () => {
      click("Enable notifications");
    });
    expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Desktop notifications are on.")).toBeInTheDocument();

    click("Start");
    advance(minutesToMs(30));
    expect(created).toHaveLength(1);
  });

  it("does not notify when permission is denied, but still reminds in the page", () => {
    const { created } = installNotificationMock("denied");
    renderPanel();
    expect(screen.getByText(/blocked in your browser settings/)).toBeInTheDocument();

    click("Start");
    advance(minutesToMs(30));
    expect(created).toHaveLength(0);
    expect(document.title).toBe(DUE_TITLE);
  });

  it("hides the notification control when the browser has no Notification API", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: "Enable notifications" })).not.toBeInTheDocument();
  });
});
