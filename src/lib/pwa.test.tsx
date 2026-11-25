import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallButton } from "@/components/AppShell";
import { showNotification } from "./notifications";
import { resetInstallPromptForTests } from "./pwa";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Install button", () => {
  beforeEach(() => resetInstallPromptForTests());

  function offerInstall() {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    act(() => {
      window.dispatchEvent(event);
    });
    return event;
  }

  it("is hidden until the browser says the app can be installed", () => {
    render(<InstallButton />);
    expect(screen.queryByRole("button", { name: /Install Karamel/ })).not.toBeInTheDocument();
    offerInstall();
    expect(screen.getByRole("button", { name: /Install Karamel/ })).toBeInTheDocument();
  });

  it("opens the browser's install window once, then hides", async () => {
    render(<InstallButton />);
    const event = offerInstall();
    expect(event.defaultPrevented).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Install Karamel/ }));
    });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Install Karamel/ })).not.toBeInTheDocument();
  });

  it("hides after the app was installed another way", () => {
    render(<InstallButton />);
    offerInstall();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.queryByRole("button", { name: /Install Karamel/ })).not.toBeInTheDocument();
  });
});

describe("notifications on Android (page notifications not allowed)", () => {
  type Shown = { title: string; options: NotificationOptions; close: () => void };

  function installAndroidLikeBrowser({ withWorker }: { withWorker: boolean }) {
    // Like Chrome on Android: permission can be granted, but the constructor throws.
    const PageNotification = vi.fn(function () {
      throw new TypeError("Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead.");
    });
    vi.stubGlobal("Notification", Object.assign(PageNotification, { permission: "granted" }));

    const shown: Shown[] = [];
    const registration = {
      showNotification: vi.fn(async (title: string, options: NotificationOptions) => {
        const entry: Shown = { title, options, close: vi.fn(() => shown.splice(shown.indexOf(entry), 1)) };
        shown.push(entry);
      }),
      getNotifications: vi.fn(async ({ tag }: { tag: string }) => shown.filter((n) => n.options.tag === tag)),
    };
    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: { controller: withWorker ? {} : null, ready: Promise.resolve(registration) },
    });
    return { shown, registration };
  }

  it("asks the service worker to show it, and can close it again", async () => {
    const { shown } = installAndroidLikeBrowser({ withWorker: true });
    const first = showNotification("Sit up tall", "🧍 Posture");
    const second = showNotification("Drink water", "💧 Water");
    await vi.waitFor(() => expect(shown).toHaveLength(2));
    expect(shown[0]).toMatchObject({ title: "🧍 Posture", options: { body: "Sit up tall" } });

    first?.close();
    await vi.waitFor(() => expect(shown).toHaveLength(1));
    expect(shown[0].title).toBe("💧 Water"); // Only the matching notification closed.
    second?.close();
    await vi.waitFor(() => expect(shown).toHaveLength(0));
  });

  it("gives up quietly without a service worker; the in-page reminder still shows", () => {
    const { registration } = installAndroidLikeBrowser({ withWorker: false });
    expect(showNotification("Sit up tall")).toBeNull();
    expect(registration.showNotification).not.toHaveBeenCalled();
  });
});
