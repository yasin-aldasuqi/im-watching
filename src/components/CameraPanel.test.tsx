import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALERT_VISIBLE_MS, BASELINE_STORAGE_KEY } from "@/hooks/usePostureCamera";
import { SLOUCH_MESSAGES } from "@/lib/messages";
import { NOTIFICATION_TITLE } from "@/lib/notifications";
import { createPoseDetector } from "@/lib/poseDetector";
import { CALIBRATION_SAMPLES, LANDMARK, SLOUCH_HOLD_MS, type Landmark } from "@/lib/posture";
import PostureBuddy, { SLOUCH_TITLE } from "./PostureBuddy";

vi.mock("@/lib/poseDetector", () => ({ createPoseDetector: vi.fn() }));

const PAGE_TITLE = "Karamel";
const CHECK_MS = 250;

// ---- A fake pose model: returns whatever pose the test sets. ----

let currentPose: Landmark[] | null = null;
const detect = vi.fn(() => currentPose);
const closeDetector = vi.fn();

/** With a 640x480 camera, ears at y=earY and shoulders at y=0.7. Straight = 0.4, slouched = 0.55. */
function pose(earY: number): Landmark[] {
  const points: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  points[LANDMARK.LEFT_EAR] = { x: 0.55, y: earY, visibility: 0.9 };
  points[LANDMARK.RIGHT_EAR] = { x: 0.45, y: earY, visibility: 0.9 };
  points[LANDMARK.LEFT_SHOULDER] = { x: 0.65, y: 0.7, visibility: 0.9 };
  points[LANDMARK.RIGHT_SHOULDER] = { x: 0.35, y: 0.7, visibility: 0.9 };
  return points;
}
const STRAIGHT = pose(0.4);
const SLOUCHED = pose(0.55);

// ---- A fake camera. ----

type FakeTrack = { stop: ReturnType<typeof vi.fn>; fireEnded: () => void };
let tracks: FakeTrack[] = [];

function fakeStream() {
  let onEnded: (() => void) | undefined;
  const track = {
    stop: vi.fn(),
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === "ended") onEnded = listener;
    }),
    fireEnded: () => onEnded?.(),
  };
  tracks.push(track);
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
}

const getUserMedia = vi.fn<(constraints?: MediaStreamConstraints) => Promise<MediaStream>>(
  async () => fakeStream(),
);

function installCamera() {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
}

function removeCamera() {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
}

// ---- Helpers. ----

function renderBuddy() {
  return render(
    <PostureBuddy>
      <svg data-testid="kitten" />
    </PostureBuddy>,
  );
}

async function flush() {
  await act(async () => {});
}

async function turnOn() {
  fireEvent.click(screen.getByRole("button", { name: "Turn on camera" }));
  await flush();
  await flush();
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function cameraStatus() {
  return screen.getByTestId("camera-status");
}

function bubble() {
  return screen.queryByTestId("speech-bubble");
}

async function calibrate() {
  currentPose = STRAIGHT;
  fireEvent.click(screen.getByRole("button", { name: "Set my good posture" }));
  advance(CALIBRATION_SAMPLES * CHECK_MS);
}

function installNotificationMock() {
  const created: { title: string; body?: string }[] = [];
  class MockNotification {
    static permission: NotificationPermission = "granted";
    static requestPermission = vi.fn();
    onclick: (() => void) | null = null;
    close = vi.fn();
    constructor(title: string, options?: NotificationOptions) {
      created.push({ title, body: options?.body });
    }
  }
  vi.stubGlobal("Notification", MockNotification);
  return created;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-24T09:00:00Z"));
  vi.spyOn(Math, "random").mockReturnValue(0);
  window.localStorage.clear();
  document.title = PAGE_TITLE;

  tracks = [];
  currentPose = null;
  detect.mockClear();
  closeDetector.mockClear();
  getUserMedia.mockClear();
  vi.mocked(createPoseDetector).mockReset();
  vi.mocked(createPoseDetector).mockResolvedValue({ detect, close: closeDetector });
  installCamera();

  // jsdom has no real video playback.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(640);
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(480);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("camera posture check", () => {
  it("starts off, and asks for video only (never audio) when turned on", async () => {
    renderBuddy();
    expect(cameraStatus()).toHaveTextContent("The camera is off.");
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(createPoseDetector).not.toHaveBeenCalled();

    await turnOn();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia.mock.calls[0][0]).toMatchObject({ audio: false, video: expect.any(Object) });
    expect(screen.getByLabelText("Your camera preview")).toBeVisible();
    expect(cameraStatus()).toHaveTextContent("Sit up straight, then press");
  });

  it("calibrates, then alerts after 5 seconds of slouching, then hides the bubble", async () => {
    const notifications = installNotificationMock();
    renderBuddy();
    await turnOn();
    await calibrate();
    expect(cameraStatus()).toHaveTextContent("Good posture.");
    expect(screen.getByTestId("posture-score")).toHaveTextContent("Posture: 100% of your good posture");

    currentPose = SLOUCHED;
    advance(CHECK_MS);
    expect(cameraStatus()).toHaveTextContent("You're slouching.");
    expect(bubble()).not.toBeInTheDocument();

    advance(SLOUCH_HOLD_MS);
    expect(bubble()).toHaveTextContent(SLOUCH_MESSAGES[0]);
    expect(cameraStatus()).toHaveTextContent(SLOUCH_MESSAGES[0]);
    expect(document.title).toBe(SLOUCH_TITLE);
    expect(notifications).toEqual([{ title: NOTIFICATION_TITLE, body: SLOUCH_MESSAGES[0] }]);

    advance(ALERT_VISIBLE_MS);
    expect(bubble()).not.toBeInTheDocument();
    expect(document.title).toBe(PAGE_TITLE);
    // Still slouching, but the 60-second cooldown has not passed: no second alert.
    expect(notifications).toHaveLength(1);
  });

  it("does not alert when the slouch is shorter than 5 seconds", async () => {
    renderBuddy();
    await turnOn();
    await calibrate();

    currentPose = SLOUCHED;
    advance(SLOUCH_HOLD_MS - 1000);
    currentPose = STRAIGHT;
    advance(CHECK_MS);
    currentPose = SLOUCHED;
    advance(SLOUCH_HOLD_MS - 1000);
    expect(bubble()).not.toBeInTheDocument();
  });

  it("says when it cannot see the user, and does not alert", async () => {
    renderBuddy();
    await turnOn();
    await calibrate();

    currentPose = null;
    advance(SLOUCH_HOLD_MS * 2);
    expect(cameraStatus()).toHaveTextContent("I can't see you.");
    expect(bubble()).not.toBeInTheDocument();
  });

  it("treats a model error on one frame as 'cannot see you' instead of crashing", async () => {
    renderBuddy();
    await turnOn();
    await calibrate();
    detect.mockImplementationOnce(() => {
      throw new Error("bad frame");
    });
    advance(CHECK_MS);
    expect(cameraStatus()).toHaveTextContent("I can't see you.");
    advance(CHECK_MS);
    expect(cameraStatus()).toHaveTextContent("Good posture.");
  });

  it("stops every camera track and all checks when turned off", async () => {
    renderBuddy();
    await turnOn();
    await calibrate();

    fireEvent.click(screen.getByRole("button", { name: "Turn off camera" }));
    expect(tracks).toHaveLength(1);
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(cameraStatus()).toHaveTextContent("The camera is off.");
    expect(screen.getByLabelText("Your camera preview")).not.toBeVisible();

    const callsAfterStop = detect.mock.calls.length;
    advance(5000);
    expect(detect.mock.calls.length).toBe(callsAfterStop);
  });

  it("closes the camera right away if it was turned off while still starting", async () => {
    let resolveCamera!: (stream: MediaStream) => void;
    getUserMedia.mockImplementationOnce(
      () => new Promise<MediaStream>((resolve) => (resolveCamera = resolve)),
    );
    renderBuddy();
    fireEvent.click(screen.getByRole("button", { name: "Turn on camera" }));
    await flush();
    expect(cameraStatus()).toHaveTextContent("Starting the camera");

    fireEvent.click(screen.getByRole("button", { name: "Turn off camera" }));
    await act(async () => resolveCamera(fakeStream()));
    await flush();

    expect(tracks[0].stop).toHaveBeenCalled();
    expect(cameraStatus()).toHaveTextContent("The camera is off.");
    advance(2000);
    expect(detect).not.toHaveBeenCalled();
  });

  it("stops the camera and frees the model when the page goes away", async () => {
    const { unmount } = renderBuddy();
    await turnOn();
    unmount();
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(closeDetector).toHaveBeenCalled();
  });

  it("saves the calibration and uses it next time", async () => {
    const first = renderBuddy();
    await turnOn();
    await calibrate();
    expect(Number(window.localStorage.getItem(BASELINE_STORAGE_KEY))).toBeCloseTo(0.75);
    first.unmount();

    renderBuddy();
    await turnOn();
    currentPose = STRAIGHT;
    advance(CHECK_MS);
    expect(cameraStatus()).toHaveTextContent("Good posture.");
    expect(screen.getByRole("button", { name: "Reset my good posture" })).toBeInTheDocument();
  });

  it("explains each kind of failure", async () => {
    const cases: [() => void, string][] = [
      [
        () => getUserMedia.mockRejectedValueOnce(new DOMException("no", "NotAllowedError")),
        "Camera access was blocked",
      ],
      [() => getUserMedia.mockRejectedValueOnce(new DOMException("none", "NotFoundError")), "No camera was found"],
      [() => getUserMedia.mockRejectedValueOnce(new DOMException("busy", "NotReadableError")), "The camera is busy"],
      [() => vi.mocked(createPoseDetector).mockRejectedValueOnce(new Error("404")), "Couldn't load the posture model"],
      [removeCamera, "This browser can't use the camera here"],
    ];
    for (const [setUp, text] of cases) {
      installCamera();
      setUp();
      const { unmount } = renderBuddy();
      await turnOn();
      expect(cameraStatus()).toHaveTextContent(text);
      expect(screen.getByRole("button", { name: "Turn on camera" })).toBeInTheDocument();
      unmount();
    }
  });

  it("closes the camera right away when the posture model fails to load", async () => {
    vi.mocked(createPoseDetector).mockRejectedValueOnce(new Error("404"));
    renderBuddy();
    await turnOn();
    // Checked while the page is still open: the camera must not stay on after an error.
    expect(tracks).toHaveLength(1);
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(screen.getByLabelText("Your camera preview")).not.toBeVisible();
  });

  it("reports when the camera is disconnected", async () => {
    renderBuddy();
    await turnOn();
    act(() => tracks[0].fireEnded());
    expect(cameraStatus()).toHaveTextContent("The camera stopped.");
  });

  it("shows the camera alert instead of a timer reminder when both are active", async () => {
    renderBuddy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await turnOn();
    await calibrate();

    // Calibration took 2 s. Sit straight until 22 s, then slouch: the camera alert
    // fires at about 27 s and is still showing when the 30 s timer is due.
    advance(20_000);
    currentPose = SLOUCHED;
    advance(8_000);
    expect(screen.getByRole("button", { name: "I'm sitting tall" })).toBeInTheDocument();
    expect(bubble()).toHaveTextContent(SLOUCH_MESSAGES[0]);
    expect(document.title).toBe(SLOUCH_TITLE);
  });
});
