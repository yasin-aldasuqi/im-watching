import { test as base, expect, type Page } from "@playwright/test";

/** What the page did on the network and the console during a test. */
export type PageWatch = {
  /** Every request the page tried to make to another origin, sent or not. */
  externalAttempts: string[];
  /** External requests the Content Security Policy blocked before they were sent. */
  blockedByCsp: string[];
  /** Violations reported by the browser's `securitypolicyviolation` event. */
  cspViolations: string[];
  /** console.error messages and uncaught page errors. */
  errors: string[];
};

/**
 * Requests we expect the CSP to block. MediaPipe has a built-in usage logger
 * that posts to this URL about once a minute while the model is loaded, and it
 * cannot be turned off. Blocking it is the CSP doing its job, so it is not a
 * test failure. Anything else blocked or logged as an error still is.
 */
export const KNOWN_BLOCKED_URLS = ["https://odml.pa.googleapis.com/v1/log"];

const isKnownBlock = (text: string) => KNOWN_BLOCKED_URLS.some((url) => text.includes(url));

/** console errors, minus the browser's own messages about blocking a known URL. */
export function unexpectedErrors(watch: PageWatch): string[] {
  return watch.errors.filter(
    (error) => !(isKnownBlock(error) && /Content Security Policy/i.test(error)),
  );
}

/** CSP violations for anything other than the known, expected blocks. */
export function unexpectedCspViolations(watch: PageWatch): string[] {
  return watch.cspViolations.filter((violation) => !isKnownBlock(violation));
}

/**
 * External requests the CSP did NOT block: in a real browser these would leave
 * the device. (In tests they are aborted by a safety net, so nothing actually
 * leaves even when a protection is broken on purpose.)
 */
export function externalLeaks(watch: PageWatch): string[] {
  const blocked = [...watch.blockedByCsp];
  return watch.externalAttempts.filter((url) => {
    const index = blocked.indexOf(url);
    if (index === -1) return true;
    blocked.splice(index, 1);
    return false;
  });
}

async function watchPage(page: Page, appOrigin: string): Promise<PageWatch> {
  const watch: PageWatch = { externalAttempts: [], blockedByCsp: [], cspViolations: [], errors: [] };
  const isExternal = (url: string) =>
    !url.startsWith("data:") && !url.startsWith("blob:") && new URL(url).origin !== appOrigin;

  page.on("request", (request) => {
    if (isExternal(request.url())) watch.externalAttempts.push(request.url());
  });
  // Safety net: tests never send anything to another origin, even if the CSP
  // is broken. The attempt is still recorded above and counted as a leak.
  await page.route(
    (url) => isExternal(url.href),
    (route) => route.abort(),
  );
  page.on("requestfailed", (request) => {
    // Chromium reports a request stopped by the CSP with the error text "csp".
    if (isExternal(request.url()) && request.failure()?.errorText === "csp") {
      watch.blockedByCsp.push(request.url());
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") watch.errors.push(message.text());
  });
  page.on("pageerror", (error) => watch.errors.push(error.message));

  await page.exposeFunction("__reportCspViolation", (text: string) => {
    watch.cspViolations.push(text);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __reportCspViolation: (t: string) => void }).__reportCspViolation(
        `${event.violatedDirective} blocked ${event.blockedURI}`,
      );
    });
  });

  return watch;
}

export const test = base.extend<{ watch: PageWatch }>({
  // The second parameter is Playwright's fixture callback. It is not named
  // `use` here so the React hooks lint rule does not mistake it for a hook.
  watch: async ({ page, baseURL }, provide) => {
    await provide(await watchPage(page, new URL(baseURL!).origin));
  },
});

export { expect };
