/** Shared Tailwind class lists, built on the color tokens in globals.css. */

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const primaryButton = `rounded-full bg-accent px-6 py-2.5 font-bold text-on-accent shadow-sm transition hover:brightness-110 disabled:opacity-60 ${focusRing}`;

export const secondaryButton = `rounded-full border border-line bg-surface px-6 py-2.5 font-bold text-ink transition hover:bg-tint disabled:opacity-60 ${focusRing}`;

export const card = "rounded-3xl border border-line bg-surface shadow-sm";

export const cardHeading = "font-display text-xl font-semibold";
