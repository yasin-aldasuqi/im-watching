import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALERT_CHANNELS_STORAGE_KEY } from "@/hooks/useAlertChannels";
import { QUIET_TITLE } from "@/lib/alertChannels";
import { REMINDER_MESSAGES } from "@/lib/messages";
import { installAudioMock } from "@/test-utils/browserMocks";
import PostureBuddy, { BLINK_MS, DUE_TITLE } from "./PostureBuddy";

const PAGE_TITLE = "Karamel";

function renderBuddy() {
  return render(
    <PostureBuddy>
      <svg />
    </PostureBuddy>,
  );
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const channelsCard = () => within(screen.getByRole("region", { name: "How should I remind you?" }));
const channelSwitch = (name: RegExp) => channelsCard().getByRole("switch", { name });

/** Posture every 30 seconds, started; returns after it fired. */
function firePostureReminder() {
  fireEvent.change(within(screen.getByRole("group", { name: "Posture" })).getByRole("combobox"), {
    target: { value: "30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  advance(30_000);
}

// ---- Speech fake ----
type FakeVoice = { name: string; lang: string; localService: boolean; default?: boolean };
let voices: FakeVoice[] = [];
const spoken: { text: string; voice: FakeVoice | null }[] = [];

function installSpeechMock(available: FakeVoice[]) {
  voices = available;
  spoken.length = 0;
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => voices,
    speak: vi.fn((utterance: { text: string; voice: FakeVoice | null }) => spoken.push(utterance)),
    cancel: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      voice: FakeVoice | null = null;
      lang = "";
      pitch = 1;
      constructor(public text: string) {}
    },
  );
}

const ONLINE_VOICE = { name: "Google US English", lang: "en-US", localService: false, default: true };
const LOCAL_VOICE = { name: "eSpeak English", lang: "en-GB", localService: true };

// ---- <dialog> fake: jsdom has no showModal(). ----
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

let hidden = false;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-24T09:00:00Z"));
  vi.spyOn(Math, "random").mockReturnValue(0);
  window.localStorage.clear();
  document.title = PAGE_TITLE;
  hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.head.querySelectorAll("link[rel='icon']").forEach((link) => link.remove());
});

describe("defaults", () => {
  it("starts with only blinking on, and the bubble always on", () => {
    installSpeechMock([LOCAL_VOICE]);
    renderBuddy();
    expect(channelSwitch(/Sound/)).not.toBeChecked();
    expect(channelSwitch(/Kitten speaks/)).not.toBeChecked();
    expect(channelSwitch(/Full-screen nudge/)).not.toBeChecked();
    expect(channelSwitch(/Blinking tab/)).toBeChecked();
    expect(channelsCard().getByText(/speech bubble is always on/)).toBeInTheDocument();
  });
});

describe("sound", () => {
  it("plays a meow when a reminder fires, at the chosen volume", () => {
    const audio = installAudioMock();
    renderBuddy();
    fireEvent.click(channelSwitch(/Sound/));
    fireEvent.change(channelsCard().getByRole("slider", { name: "Volume" }), { target: { value: "0.5" } });

    firePostureReminder();
    expect(audio.meows()).toBe(1);
    expect(audio.peakLevels.at(-1)).toBeCloseTo(0.5 * 0.4);
  });

  it("stays silent when sound is off", () => {
    const audio = installAudioMock();
    renderBuddy();
    firePostureReminder();
    expect(audio.meows()).toBe(0);
  });

  it("plays right away with the Test button", () => {
    const audio = installAudioMock();
    renderBuddy();
    fireEvent.click(channelsCard().getByRole("button", { name: "Test sound" }));
    expect(audio.meows()).toBe(1);
  });
});

describe("kitten speaks", () => {
  it("is not available with only online voices, and never speaks with them", () => {
    installSpeechMock([ONLINE_VOICE]);
    window.localStorage.setItem(ALERT_CHANNELS_STORAGE_KEY, JSON.stringify({ speak: true }));
    renderBuddy();
    expect(channelSwitch(/Kitten speaks/)).toBeDisabled();
    expect(channelsCard().getByText(/would send your messages to a server/)).toBeInTheDocument();
    firePostureReminder();
    expect(spoken).toHaveLength(0);
  });

  it("reads the message without emoji, with an offline voice", () => {
    installSpeechMock([ONLINE_VOICE, LOCAL_VOICE]);
    renderBuddy();
    fireEvent.click(channelSwitch(/Kitten speaks/));
    firePostureReminder();
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe(REMINDER_MESSAGES[0].replace(" 👀", ""));
    expect(spoken[0].voice).toBe(LOCAL_VOICE);
  });
});

describe("full-screen nudge", () => {
  it("opens with the reminder, and closes with Got it or Escape", () => {
    renderBuddy();
    fireEvent.click(channelSwitch(/Full-screen nudge/));
    firePostureReminder();

    const dialog = screen.getByRole("dialog", { name: "🧍 Posture" });
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByText(REMINDER_MESSAGES[0])).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Got it" })).toHaveFocus();

    fireEvent.click(within(dialog).getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "I'm sitting tall" }));
    advance(30_000);
    const again = screen.getByRole("dialog", { name: "🧍 Posture" });
    fireEvent(again, new Event("cancel", { cancelable: true })); // What Escape does.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not open when the nudge is off", () => {
    renderBuddy();
    firePostureReminder();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("blinking tab", () => {
  function addIcon() {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = "http://localhost/icon.svg";
    document.head.append(link);
    return link;
  }

  it("blinks the title and dots the icon while the tab is hidden, then restores both", () => {
    const icon = addIcon();
    renderBuddy();
    hidden = true;
    firePostureReminder();

    const titles = new Set<string>();
    for (let i = 0; i < 4; i++) {
      titles.add(document.title);
      advance(BLINK_MS);
    }
    expect(titles).toEqual(new Set([DUE_TITLE, QUIET_TITLE]));
    expect(icon.href).toMatch(/^data:image\/svg\+xml/);

    hidden = false;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(document.title).toBe(DUE_TITLE);
    expect(icon.href).toBe("http://localhost/icon.svg");

    fireEvent.click(screen.getByRole("button", { name: "I'm sitting tall" }));
    expect(document.title).toBe(PAGE_TITLE);
  });

  it("does not blink while the user is looking at the tab", () => {
    renderBuddy();
    firePostureReminder();
    for (let i = 0; i < 3; i++) {
      advance(BLINK_MS);
      expect(document.title).toBe(DUE_TITLE);
    }
  });

  it("does not blink when blinking is off", () => {
    renderBuddy();
    fireEvent.click(channelSwitch(/Blinking tab/));
    hidden = true;
    firePostureReminder();
    advance(BLINK_MS);
    expect(document.title).toBe(DUE_TITLE);
  });
});

describe("saving", () => {
  it("saves the choices and restores them on the next visit", () => {
    installSpeechMock([LOCAL_VOICE]);
    const first = renderBuddy();
    fireEvent.click(channelSwitch(/Sound/));
    fireEvent.click(channelSwitch(/Full-screen nudge/));
    expect(JSON.parse(window.localStorage.getItem(ALERT_CHANNELS_STORAGE_KEY)!)).toMatchObject({
      sound: true,
      nudge: true,
    });
    first.unmount();
    renderBuddy();
    expect(channelSwitch(/Sound/)).toBeChecked();
    expect(channelSwitch(/Full-screen nudge/)).toBeChecked();
  });
});
