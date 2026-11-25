import {
  expect,
  externalLeaks,
  test,
  unexpectedCspViolations,
  unexpectedErrors,
} from "./fixtures";

// Chromium runs with a fake camera (see playwright.config.ts). It shows a
// moving test pattern, not a person, so the real model finds nobody.

// Loading the real model takes a few seconds alone, but can take about 30 s
// when several browsers share a small CI machine. Playwright's default limit
// for a whole test is 30 s, so these tests get limits that fit their work.
const MODEL_LOAD_TIMEOUT = 60_000;

test("the camera check runs the real model from our own origin and turns off cleanly", async ({
  page,
  watch,
}) => {
  test.setTimeout(120_000);
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
  await expect(status).toHaveText(/Sit up straight, then press/, { timeout: MODEL_LOAD_TIMEOUT });
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
  // On a slow machine this test can run past 60 s, when MediaPipe's logger tries
  // to send and the CSP blocks it. That block is expected; anything else is not.
  expect(unexpectedCspViolations(watch)).toEqual([]);
  expect(unexpectedErrors(watch)).toEqual([]);
});

test("nothing leaves the browser while the camera runs, even after a minute", async ({ page, watch }) => {
  test.setTimeout(180_000); // Runs for more than a minute on purpose, plus the model load.

  await page.goto("/");
  await page.getByRole("button", { name: "Turn on camera" }).click();
  await expect(page.getByTestId("camera-status")).toHaveText(/Sit up straight, then press/, {
    timeout: MODEL_LOAD_TIMEOUT,
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
  expect(unexpectedCspViolations(watch)).toEqual([]);
  expect(unexpectedErrors(watch)).toEqual([]);
});
