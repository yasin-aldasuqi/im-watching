/**
 * Puts a red dot on the tab icon while an alert waits in a background tab.
 * The icon is an inline SVG data URL, which the CSP allows (img-src data:).
 */

const DOT_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<path d="M10 26 L14 4 L28 16 Z" fill="#F28C38"/><path d="M54 26 L50 4 L36 16 Z" fill="#F28C38"/>' +
      '<ellipse cx="32" cy="36" rx="25" ry="22" fill="#F28C38"/>' +
      '<circle cx="50" cy="14" r="12" fill="#D93025" stroke="#fff" stroke-width="3"/></svg>',
  );

export function showTabDot(on: boolean): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) return;
  if (on) {
    link.dataset.originalHref ??= link.href;
    link.href = DOT_ICON;
  } else if (link.dataset.originalHref) {
    link.href = link.dataset.originalHref;
    delete link.dataset.originalHref;
  }
}
