import { expect, externalLeaks, test } from "./fixtures";

// Chromium runs with a fake camera (see playwright.config.ts). It shows a
// moving test pattern, not a person, so the real model finds nobody.

test("the camera check runs the real model from our own origin and turns off cleanly", async ({
  page,
  watch,
}) => {
  const sameOriginPaths: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === new URL(page.url() || "http://localhost:3100").origin) sameOriginPaths.push(url.pathname);
  });

  await page.goto("/");
  const status = page.getByTestId("camera-status");
  await expect(status).toHaveText("The camera is off.");

  await page.getByRole("button", { name: "Turn on camera" }).click();
  // "on" is only reached after the real model has loaded and initialized.
  await expect(status).toHaveText(/Sit up straight, then press/, { timeout: 60_000 });
  await expect(page.getByLabel("Your camera preview")).toBeVisible();

  expect(sameOriginPaths).toContain("/models/pose_landmarker_lite.task");
  expect(sameOriginPaths).toContain("/mediapipe/vision_wasm_internal.wasm");

  await page.getByRole("button", { name: "Set my good posture" }).click();
  await expect(status).toHaveText(/I can't see your head and shoulders yet/);

  await page.getByRole("button", { name: "Turn off camera" }).click();
  await expect(status).toHaveText("The camera is off.");
  await expect(page.getByLabel("Your camera preview")).toBeHidden();
  expect(await page.locator("video").evaluate((video: HTMLVideoElement) => video.srcObject)).toBeNull();

  expect(externalLeaks(watch)).toEqual([]);
  expect(watch.errors).toEqual([]);
});

test("nothing leaves the browser while the camera runs, even after a minute", async ({ page, watch }) => {
  test.slow(); // Runs for more than a minute on purpose.

  await page.goto("/");
  await page.getByRole("button", { name: "Turn on camera" }).click();
  await expect(page.getByTestId("camera-status")).toHaveText(/Sit up straight, then press/, {
    timeout: 60_000,
  });

  // MediaPipe's built-in usage logger sends a batch every 60 seconds, and
  // again when the model is closed. Wait past one interval, then leave the
  // page so the model is closed.
  await page.waitForTimeout(65_000);
  await page.goto("about:blank");
  await page.waitForTimeout(3_000);

  // Recorded so the report shows what was attempted and blocked.
  test.info().annotations.push(
    { type: "external attempts", description: JSON.stringify(watch.externalAttempts) },
    { type: "blocked by CSP", description: JSON.stringify(watch.blockedByCsp) },
  );
  console.log("External attempts:", watch.externalAttempts);
  console.log("Blocked by CSP:", watch.blockedByCsp);
  console.log("CSP violations:", watch.cspViolations);

  expect(externalLeaks(watch)).toEqual([]);
});
