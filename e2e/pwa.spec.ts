import type { Page } from "@playwright/test";
import { expect, externalLeaks, test, unexpectedErrors } from "./fixtures";

/** Waits until the service worker is active and controls this page. */
async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  });
}

test("the app can be installed: a valid manifest with working icons", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator("link[rel='manifest']").getAttribute("href");
  expect(href).toBeTruthy();

  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: "Karamel", start_url: "/", display: "standalone" });
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok(), icon.src).toBe(true);
    expect(response.headers()["content-type"]).toBe("image/png");
  }
  await expect(page.locator("link[rel='apple-touch-icon']")).toHaveCount(1);
});

test("Chrome itself finds nothing that stops installing the app", async ({ page, context }) => {
  await page.goto("/");
  await waitForServiceWorker(page);
  const devtools = await context.newCDPSession(page);
  const { installabilityErrors } = await devtools.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);
  const { errors } = await devtools.send("Page.getAppManifest");
  expect(errors).toEqual([]);
});

test("the app opens and works with no network after the first visit", async ({ page, context, watch }) => {
  await page.goto("/");
  await waitForServiceWorker(page);
  expect(unexpectedErrors(watch)).toEqual([]);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Karamel", level: 1 })).toBeVisible();

  // The scripts came from the saved copy too: the timer still runs.
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByTestId("countdown")).not.toHaveText("30:00", { timeout: 5_000 });
});

/** Code in the page tries to send data away, from a page the worker controls. */
async function trySendingData(page: Page) {
  await page.goto("/");
  await waitForServiceWorker(page);
  await page.reload(); // Now every request of this page goes past the worker.
  await waitForServiceWorker(page);
  return page.evaluate(() =>
    fetch("https://example.com/collect", { method: "POST", body: "posture" }).then(
      () => "sent",
      () => "failed",
    ),
  );
}

test("the service worker does not open a way around the privacy protection", async ({ page, watch }) => {
  expect(await trySendingData(page)).toBe("failed");
  // The CSP stops the request inside the page, before it reaches the network.
  await expect.poll(() => watch.cspViolations).toEqual(["connect-src blocked https://example.com/collect"]);
  expect(externalLeaks(watch)).toEqual([]);
});

test.describe("control: with the CSP switched off", () => {
  test.use({ bypassCSP: true });

  // Proves the test above can fail: the same request, through the same
  // worker, is seen leaving when nothing blocks it.
  test("the leak is detected", async ({ page, watch }) => {
    await trySendingData(page);
    await expect.poll(() => externalLeaks(watch)).toEqual(["https://example.com/collect"]);
  });
});
