import { execFileSync } from "node:child_process";
import { expect, externalLeaks, test, unexpectedErrors } from "./fixtures";

/**
 * The whole chain: browser → the website's /api rewrite → the .NET API → PostgreSQL.
 *
 * Optional: runs only with KARAMEL_FULLSTACK_DB (a PostgreSQL URL the API uses), against a
 * website built with KARAMEL_API_URL pointing at that API. See README → Tests. Skipped
 * otherwise, including in CI.
 *
 * Headless Chromium has no push service, so a small script stands in for the browser's
 * subscription (with a real P-256 key from the browser's own crypto). Run the API with
 * Push__SenderEnabled=false, so nothing is sent to a real push service.
 */
const database = process.env.KARAMEL_FULLSTACK_DB;
test.skip(!database, "Set KARAMEL_FULLSTACK_DB to run the full-stack test.");

const sql = (query: string) => execFileSync("psql", [database!, "-tAc", query], { encoding: "utf8" }).trim();

test("turning on, starting, pausing, and turning off reach the server's database", async ({ page, context, watch }) => {
  await context.grantPermissions(["notifications"]);
  await page.addInitScript(() => {
    const base64Url = (bytes: Uint8Array) =>
      btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    let current: unknown = null;
    PushManager.prototype.subscribe = async function (options?: PushSubscriptionOptionsInit) {
      const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
      const auth = crypto.getRandomValues(new Uint8Array(16));
      const endpoint = `https://web.push.apple.com/fullstack-${crypto.randomUUID()}`;
      const key = options?.applicationServerKey as Uint8Array;
      current = {
        endpoint,
        options: { applicationServerKey: key.slice().buffer, userVisibleOnly: true },
        toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: base64Url(publicKey), auth: base64Url(auth) } }),
        unsubscribe: async () => {
          current = null;
          return true;
        },
      };
      return current as PushSubscription;
    };
    PushManager.prototype.getSubscription = async () => current as PushSubscription | null;
  });

  await page.goto("/");
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active !== null);
  const push = page.getByRole("group", { name: "Remind me when Karamel is closed" });

  await push.getByRole("button", { name: "Turn on" }).click();
  await expect(push.getByRole("status")).toHaveText(/^On:/);
  await expect.poll(() => sql("SELECT count(*) FROM devices WHERE push_endpoint LIKE '%/fullstack-%'")).toBe("1");

  await page.getByRole("button", { name: "Start" }).click();
  await expect
    .poll(() => sql("SELECT reminder_key || ' ' || coalesce(interval_seconds::text, 'once') FROM reminder_schedules"))
    .toBe("posture once");
  const firesIn = Number(sql("SELECT extract(epoch FROM next_fire_at - now()) FROM reminder_schedules"));
  expect(firesIn).toBeGreaterThan(29 * 60);
  expect(firesIn).toBeLessThanOrEqual(30 * 60);

  await page.getByRole("button", { name: "Pause" }).click();
  await expect.poll(() => sql("SELECT count(*) FROM reminder_schedules")).toBe("0");

  await push.getByRole("button", { name: "Turn off" }).click();
  await expect(push.getByRole("button", { name: "Turn on" })).toBeVisible();
  await expect.poll(() => sql("SELECT count(*) FROM devices")).toBe("0");

  await expect(push.getByRole("alert")).toHaveCount(0);
  expect(externalLeaks(watch)).toEqual([]);
  expect(unexpectedErrors(watch)).toEqual([]);
});
