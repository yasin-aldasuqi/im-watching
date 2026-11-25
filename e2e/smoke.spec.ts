import { expect, test } from "./fixtures";

test("the page works under the Content Security Policy and talks to no other origin", async ({
  page,
  watch,
}) => {
  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");

  await expect(page.getByRole("heading", { name: "I'm Watching" })).toBeVisible();

  // If the CSP blocked the app's own scripts, the page would render but not react.
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByTestId("countdown")).not.toHaveText("30:00", { timeout: 3000 });
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  expect(watch.externalAttempts).toEqual([]);
  expect(watch.cspViolations).toEqual([]);
  expect(watch.errors).toEqual([]);
});
