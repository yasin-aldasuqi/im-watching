import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_RESTART_STORAGE_KEY,
  DUE_TITLE,
  INTERVAL_STORAGE_KEY,
  NOTIFICATION_TITLE,
} from "@/hooks/useReminder";
import { REMINDER_MESSAGES } from "@/lib/messages";
import { secondsToMs } from "@/lib/reminder";
import ReminderPanel from "./ReminderPanel";

const PAGE_TITLE = "I'm Watching";
const MINUTE = secondsToMs(60);
// With Math.random() mocked to 0, the first reminder shows message 0 and the
// next one shows message 1 (the same message never repeats).
const FIRST_MESSAGE = REMINDER_MESSAGES[0];
const SECOND_MESSAGE = REMINDER_MESSAGES[1];

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

function bubble() {
  return screen.queryByTestId("speech-bubble");
}

function click(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

function chooseInterval(seconds: number) {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: String(seconds) } });
}

function autoRestartSwitch() {
  return screen.getByRole("switch", { name: "Restart automatically" });
}

/** Minimal stand-in for the browser Notification API. */
function installNotificationMock(permission: NotificationPermission) {
  const created: { title: string; body?: string; close: ReturnType<typeof vi.fn> }[] = [];
  class MockNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = vi.fn(async () => {
      MockNotification.permission = "granted";
      return MockNotification.permission;
    });
    onclick: (() => void) | null = null;
    close = vi.fn();
    constructor(title: string, options?: NotificationOptions) {
      created.push({ title, body: options?.body, close: this.close });
    }
  }
  vi.stubGlobal("Notification", MockNotification);
  return { created, MockNotification };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-24T09:00:00Z"));
  vi.spyOn(Math, "random").mockReturnValue(0);
  window.localStorage.clear();
  document.title = PAGE_TITLE;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("ReminderPanel: manual mode (default)", () => {
  it("counts down, reminds with a message, and restarts after acknowledge", () => {
    renderPanel();
    expect(countdown()).toBe("30:00");
    expect(autoRestartSwitch()).not.toBeChecked();

    click("Start");
    advance(1000);
    expect(countdown()).toBe("29:59");
    expect(bubble()).not.toBeInTheDocument();

    advance(30 * MINUTE - 1000);
    expect(countdown()).toBe("00:00");
    expect(bubble()).toHaveTextContent(FIRST_MESSAGE);
    expect(screen.getByRole("status")).toHaveTextContent(FIRST_MESSAGE);
    expect(screen.getByRole("status")).toHaveTextContent("Fix your posture");
    expect(document.title).toBe(DUE_TITLE);

    // It keeps waiting for the user, however long it takes.
    advance(60 * MINUTE);
    expect(bubble()).toHaveTextContent(FIRST_MESSAGE);

    click("I'm sitting tall");
    expect(countdown()).toBe("30:00");
    expect(document.title).toBe(PAGE_TITLE);
    expect(bubble()).not.toBeInTheDocument();

    advance(1000);
    expect(countdown()).toBe("29:59");
  });

  it("does not count time while paused", () => {
    renderPanel();
    click("Start");
    advance(10 * MINUTE);
    click("Pause");
    expect(countdown()).toBe("20:00");

    advance(60 * MINUTE);
    expect(countdown()).toBe("20:00");
    expect(document.title).toBe(PAGE_TITLE);

    click("Resume");
    advance(20 * MINUTE);
    expect(document.title).toBe(DUE_TITLE);
  });

  it("catches up when a throttled background tab becomes visible again", () => {
    renderPanel();
    click("Start");

    // Jump the clock without running any timers, like a throttled tab.
    act(() => {
      vi.setSystemTime(Date.now() + 31 * MINUTE);
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
    advance(5 * MINUTE);
    click("Reset");
    expect(countdown()).toBe("30:00");
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });
});

describe("ReminderPanel: intervals", () => {
  it("offers 30 seconds up to 30 minutes", () => {
    renderPanel();
    const labels = screen.getAllByRole("option").map((option) => option.textContent);
    expect(labels[0]).toBe("30 seconds");
    expect(labels).toContain("1 minute");
    expect(labels.at(-1)).toBe("30 minutes");
  });

  it("runs a 30-second reminder", () => {
    renderPanel();
    chooseInterval(30);
    expect(countdown()).toBe("00:30");

    click("Start");
    advance(secondsToMs(29));
    expect(document.title).toBe(PAGE_TITLE);
    advance(secondsToMs(1));
    expect(document.title).toBe(DUE_TITLE);
  });

  it("saves the chosen interval and restores it on the next visit", () => {
    const { unmount } = renderPanel();
    chooseInterval(120);
    expect(countdown()).toBe("02:00");
    expect(window.localStorage.getItem(INTERVAL_STORAGE_KEY)).toBe("120");
    unmount();

    renderPanel();
    expect(countdown()).toBe("02:00");
  });

  it("ignores an invalid saved interval and the old minutes-based setting", () => {
    window.localStorage.setItem(INTERVAL_STORAGE_KEY, "7");
    window.localStorage.setItem("im-watching:interval-min", "15");
    renderPanel();
    expect(countdown()).toBe("30:00");
  });

  it("locks the interval while a cycle is running", () => {
    renderPanel();
    click("Start");
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});

describe("ReminderPanel: auto restart", () => {
  it("reminds, shows the bubble for 10 seconds, and keeps counting down by itself", () => {
    const { created } = installNotificationMock("granted");
    renderPanel();
    chooseInterval(30);
    fireEvent.click(autoRestartSwitch());
    expect(autoRestartSwitch()).toBeChecked();

    click("Start");
    advance(secondsToMs(30));

    // First reminder: notification, bubble, title, and the next cycle already running.
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ title: NOTIFICATION_TITLE, body: FIRST_MESSAGE });
    expect(bubble()).toHaveTextContent(FIRST_MESSAGE);
    expect(document.title).toBe(DUE_TITLE);
    expect(countdown()).toBe("00:30");
    expect(screen.queryByRole("button", { name: "I'm sitting tall" })).not.toBeInTheDocument();

    advance(secondsToMs(5));
    expect(countdown()).toBe("00:25");
    expect(bubble()).toBeInTheDocument();

    // After 10 seconds the bubble hides and the title goes back.
    advance(secondsToMs(5));
    expect(bubble()).not.toBeInTheDocument();
    expect(document.title).toBe(PAGE_TITLE);

    // Second reminder: a different message, and the old notification is closed.
    advance(secondsToMs(20));
    expect(created).toHaveLength(2);
    expect(created[1].body).toBe(SECOND_MESSAGE);
    expect(created[0].close).toHaveBeenCalled();
    expect(bubble()).toHaveTextContent(SECOND_MESSAGE);
  });

  it("gives one reminder, not a burst, after a long time away", () => {
    const { created } = installNotificationMock("granted");
    renderPanel();
    chooseInterval(30);
    fireEvent.click(autoRestartSwitch());
    click("Start");

    act(() => {
      vi.setSystemTime(Date.now() + 2 * 60 * MINUTE);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(created).toHaveLength(1);
    expect(countdown()).toBe("00:30");
  });

  it("can be turned on while waiting, and applies from the next cycle", () => {
    renderPanel();
    chooseInterval(30);
    click("Start");
    advance(secondsToMs(30));
    expect(screen.getByRole("button", { name: "I'm sitting tall" })).toBeInTheDocument();

    fireEvent.click(autoRestartSwitch());
    click("I'm sitting tall");
    advance(secondsToMs(30));
    // Now it restarted by itself instead of waiting.
    expect(screen.queryByRole("button", { name: "I'm sitting tall" })).not.toBeInTheDocument();
    expect(countdown()).toBe("00:30");
    expect(bubble()).toBeInTheDocument();
  });

  it("saves the switch and restores it on the next visit", () => {
    const { unmount } = renderPanel();
    fireEvent.click(autoRestartSwitch());
    expect(window.localStorage.getItem(AUTO_RESTART_STORAGE_KEY)).toBe("true");
    unmount();

    renderPanel();
    expect(autoRestartSwitch()).toBeChecked();
  });
});

describe("ReminderPanel: notifications", () => {
  it("sends one notification per reminder in manual mode, and closes it on acknowledge", () => {
    const { created } = installNotificationMock("granted");
    renderPanel();
    expect(screen.getByText("Desktop notifications are on.")).toBeInTheDocument();

    click("Start");
    advance(30 * MINUTE);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ title: NOTIFICATION_TITLE, body: FIRST_MESSAGE });

    // More ticks while due must not send more notifications.
    advance(5 * MINUTE);
    expect(created).toHaveLength(1);

    click("I'm sitting tall");
    expect(created[0].close).toHaveBeenCalled();
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
    advance(30 * MINUTE);
    expect(created).toHaveLength(1);
  });

  it("does not notify when permission is denied, but still reminds in the page", () => {
    const { created } = installNotificationMock("denied");
    renderPanel();
    expect(screen.getByText(/blocked in your browser settings/)).toBeInTheDocument();

    click("Start");
    advance(30 * MINUTE);
    expect(created).toHaveLength(0);
    expect(document.title).toBe(DUE_TITLE);
    expect(bubble()).toHaveTextContent(FIRST_MESSAGE);
  });

  it("hides the notification control when the browser has no Notification API", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: "Enable notifications" })).not.toBeInTheDocument();
  });
});
