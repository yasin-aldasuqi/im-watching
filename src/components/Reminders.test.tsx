import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REMINDERS_STORAGE_KEY, SESSION_STORAGE_KEY } from "@/hooks/useReminders";
import { EYES_MESSAGES, REMINDER_MESSAGES } from "@/lib/messages";
import { secondsToMs } from "@/lib/reminder";
import PostureBuddy, { DUE_TITLE } from "./PostureBuddy";

const PAGE_TITLE = "Karamel";
const MIN = secondsToMs(60);

function renderBuddy() {
  return render(
    <PostureBuddy>
      <svg data-testid="kitten" />
    </PostureBuddy>,
  );
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const countdown = () => screen.getByTestId("countdown").textContent;
const nextLabel = () => screen.getByTestId("next-label").textContent;
const bubble = () => screen.queryByTestId("speech-bubble");
const status = () => screen.getByTestId("reminder-status");
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/** The row for one reminder in "My reminders". */
const row = (name: string) => screen.getByRole("group", { name });

function turnOn(name: string, on = true) {
  const toggle = within(row(name)).getByRole("switch", { name: `${name} on` });
  if ((toggle as HTMLInputElement).checked !== on) fireEvent.click(toggle);
}

function openEditor(name: string) {
  fireEvent.click(within(row(name)).getByText("Edit"));
  return within(row(name));
}

function setInterval(name: string, seconds: number) {
  fireEvent.change(within(row(name)).getByRole("combobox"), { target: { value: String(seconds) } });
}

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
  vi.spyOn(crypto, "randomUUID").mockReturnValue("1234abcd-0000-4000-8000-000000000000");
  window.localStorage.clear();
  document.title = PAGE_TITLE;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("defaults", () => {
  it("has posture on and the others off, ready to start", () => {
    renderBuddy();
    expect(within(row("Posture")).getByRole("switch", { name: "Posture on" })).toBeChecked();
    for (const name of ["Drink water", "Rest your eyes", "Stand up and stretch"]) {
      expect(within(row(name)).getByRole("switch", { name: `${name} on` })).not.toBeChecked();
    }
    expect(nextLabel()).toContain("Posture");
    expect(countdown()).toBe("30:00");
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("cannot start when every reminder is off", () => {
    renderBuddy();
    turnOn("Posture", false);
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    expect(countdown()).toBe("--:--");
    expect(status()).toHaveTextContent("Turn on a reminder");
  });
});

describe("one reminder", () => {
  it("counts down, reminds, waits for 'I'm sitting tall', then starts again", () => {
    renderBuddy();
    click("Start");
    advance(1000);
    expect(countdown()).toBe("29:59");

    advance(30 * MIN - 1000);
    expect(within(screen.getByRole("list", { name: "Time for" })).getByText("Posture")).toBeInTheDocument();
    expect(bubble()).toHaveTextContent(REMINDER_MESSAGES[0]);
    expect(status()).toHaveTextContent("Fix your posture");
    expect(document.title).toBe(DUE_TITLE);

    click("I'm sitting tall");
    expect(countdown()).toBe("30:00");
    expect(document.title).toBe(PAGE_TITLE);
    expect(bubble()).not.toBeInTheDocument();
  });

  it("pause and resume apply to the whole session", () => {
    renderBuddy();
    click("Start");
    advance(10 * MIN);
    click("Pause");
    advance(60 * MIN);
    expect(countdown()).toBe("20:00");
    click("Resume");
    advance(20 * MIN);
    expect(document.title).toBe(DUE_TITLE);
  });

  it("catches up when a throttled background tab becomes visible again", () => {
    renderBuddy();
    click("Start");
    act(() => {
      vi.setSystemTime(Date.now() + 31 * MIN);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(document.title).toBe(DUE_TITLE);
  });
});

describe("several reminders", () => {
  it("runs each on its own timer, with its own messages and notification title", () => {
    const { created } = installNotificationMock("granted");
    renderBuddy();
    turnOn("Rest your eyes"); // 20 minutes, restarts by itself
    expect(nextLabel()).toContain("Rest your eyes");
    expect(countdown()).toBe("20:00");
    expect(screen.getByTestId("upcoming-posture")).toHaveTextContent("30:00");

    click("Start");
    advance(20 * MIN);
    // Each reminder gets its own random number, so check the message comes from the eyes list.
    const eyesMessage = bubble()!.textContent!;
    expect(EYES_MESSAGES).toContain(eyesMessage);
    expect(created.at(-1)).toMatchObject({ title: "👀 Rest your eyes · Karamel", body: eyesMessage });
    expect(created).toHaveLength(1);
    // Eyes restarted by itself, so posture (10 minutes left) is next.
    expect(screen.queryByRole("button", { name: "Done: Rest your eyes" })).not.toBeInTheDocument();
    expect(nextLabel()).toContain("Posture");
    expect(countdown()).toBe("10:00");
    expect(screen.getByTestId("upcoming-eyes")).toHaveTextContent("20:00");

    advance(10 * MIN);
    // One notification per firing: eyes once, posture once.
    expect(created.map((n) => n.title)).toEqual(["👀 Rest your eyes · Karamel", "🧍 Posture · Karamel"]);
    expect(screen.getByRole("button", { name: "I'm sitting tall" })).toBeInTheDocument();
  });

  it("shows a 'Done' button for other reminders that wait", () => {
    renderBuddy();
    turnOn("Posture", false);
    turnOn("Stand up and stretch");
    setInterval("Stand up and stretch", 30);
    click("Start");
    advance(30_000);
    click("Done: Stand up and stretch");
    expect(countdown()).toBe("00:30");
  });

  it("starts a reminder right away when it is turned on during a session", () => {
    renderBuddy();
    click("Start");
    advance(5 * MIN);
    turnOn("Drink water");
    expect(screen.getByTestId("upcoming-water")).toHaveTextContent("45:00");
  });
});

describe("editing reminders", () => {
  it("uses the user's own messages, and can restore the defaults", () => {
    renderBuddy();
    const editor = openEditor("Posture");
    fireEvent.change(editor.getByRole("textbox", { name: /Messages/ }), {
      target: { value: "Sit like a queen!\n\nBack straight!" },
    });
    fireEvent.click(editor.getByRole("button", { name: "Save" }));

    click("Start");
    advance(30 * MIN);
    expect(bubble()).toHaveTextContent("Sit like a queen!");

    fireEvent.click(within(row("Posture")).getByRole("button", { name: "Restore default messages" }));
    expect(within(row("Posture")).getByRole("textbox", { name: /Messages/ })).toHaveValue(
      REMINDER_MESSAGES.join("\n"),
    );
  });

  it("adds, runs, and deletes a custom reminder", () => {
    const { created } = installNotificationMock("granted");
    renderBuddy();
    turnOn("Posture", false);
    click("+ Add a custom reminder");

    // The new reminder's editor opens right away.
    const editor = within(row("My reminder"));
    fireEvent.change(editor.getByRole("textbox", { name: "Name" }), { target: { value: "Call mom" } });
    fireEvent.change(editor.getByRole("textbox", { name: "Emoji" }), { target: { value: "📞" } });
    fireEvent.change(editor.getByRole("textbox", { name: /Messages/ }), { target: { value: "Ring ring!" } });
    fireEvent.click(editor.getByRole("button", { name: "Save" }));
    setInterval("Call mom", 30);

    click("Start");
    advance(30_000);
    expect(bubble()).toHaveTextContent("Ring ring!");
    expect(created.at(-1)).toMatchObject({ title: "📞 Call mom · Karamel", body: "Ring ring!" });

    fireEvent.click(within(row("Call mom")).getByRole("button", { name: "Delete reminder" }));
    expect(screen.queryByRole("group", { name: "Call mom" })).not.toBeInTheDocument();
  });
});

describe("saving", () => {
  it("saves the reminders and restores them on the next visit", () => {
    const first = renderBuddy();
    turnOn("Drink water");
    setInterval("Drink water", 3600);
    const saved = JSON.parse(window.localStorage.getItem(REMINDERS_STORAGE_KEY)!);
    expect(saved.find((r: { id: string }) => r.id === "water")).toMatchObject({ enabled: true, intervalSec: 3600 });
    first.unmount();

    renderBuddy();
    expect(within(row("Drink water")).getByRole("switch", { name: "Drink water on" })).toBeChecked();
    expect(row("Drink water")).toHaveTextContent("every 1 hour");
  });

  it("moves settings from before custom reminders into the posture reminder", () => {
    window.localStorage.setItem("im-watching:interval-sec", "120");
    window.localStorage.setItem("karamel:auto-restart", "true");
    renderBuddy();
    expect(countdown()).toBe("02:00");
    expect(openEditor("Posture").getByRole("switch", { name: "Restart automatically" })).toBeChecked();
    expect(window.localStorage.getItem("karamel:interval-sec")).toBeNull();
    expect(window.localStorage.getItem("karamel:auto-restart")).toBeNull();
    expect(window.localStorage.getItem("im-watching:interval-sec")).toBeNull();
    expect(window.localStorage.getItem(REMINDERS_STORAGE_KEY)).not.toBeNull();
  });

  it("keeps saved reminders when React runs startup effects twice (Strict Mode)", () => {
    const saved = [{ id: "water", enabled: true, intervalSec: 3600 }];
    window.localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(saved));
    render(
      <StrictMode>
        <PostureBuddy>
          <svg />
        </PostureBuddy>
      </StrictMode>,
    );
    expect(within(row("Drink water")).getByRole("switch", { name: "Drink water on" })).toBeChecked();
    const stored = JSON.parse(window.localStorage.getItem(REMINDERS_STORAGE_KEY)!);
    expect(stored.find((r: { id: string }) => r.id === "water")).toMatchObject({ enabled: true, intervalSec: 3600 });
  });

  it("starts from the defaults when the saved data is corrupted", () => {
    window.localStorage.setItem(REMINDERS_STORAGE_KEY, "{not json");
    renderBuddy();
    expect(countdown()).toBe("30:00");
    expect(within(row("Posture")).getByRole("switch", { name: "Posture on" })).toBeChecked();
  });
});

describe("notifications", () => {
  it("asks for permission only when the user clicks the button", async () => {
    const { MockNotification } = installNotificationMock("default");
    renderBuddy();
    expect(MockNotification.requestPermission).not.toHaveBeenCalled();
    await act(async () => click("Enable notifications"));
    expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Desktop notifications are on.")).toBeInTheDocument();
  });

  it("still reminds in the page when notifications are blocked", () => {
    const { created } = installNotificationMock("denied");
    renderBuddy();
    click("Start");
    advance(30 * MIN);
    expect(created).toHaveLength(0);
    expect(bubble()).toHaveTextContent(REMINDER_MESSAGES[0]);
  });

  it("closes a reminder's notification when it is marked done", () => {
    const { created } = installNotificationMock("granted");
    renderBuddy();
    click("Start");
    advance(30 * MIN);
    click("I'm sitting tall");
    expect(created[0].close).toHaveBeenCalled();
  });
});

describe("closing and reopening Karamel", () => {
  it("keeps the session running, without alerting again for reminders that fired while closed", () => {
    const { created } = installNotificationMock("granted");
    const first = renderBuddy();
    turnOn("Drink water");
    click("Start");
    advance(10 * MIN);
    first.unmount(); // Closed: the phone stopped Karamel in the background.
    expect(JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY)!).timers.posture.status).toBe("running");

    vi.setSystemTime(Date.now() + 100 * MIN); // Reopened 1 hour 40 minutes later.
    renderBuddy();
    advance(0);

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument(); // Still running.
    // Water (every 45 min) continues on its beat: it fired at 0:45 and 1:30; next at 2:15.
    expect(nextLabel()).toMatch(/Drink water/);
    expect(countdown()).toBe("25:00");
    // Posture (waits for Done) is waiting, but nothing new popped up on reopening.
    expect(screen.getByRole("button", { name: "I'm sitting tall" })).toBeInTheDocument();
    expect(created).toHaveLength(0);
  });
});
