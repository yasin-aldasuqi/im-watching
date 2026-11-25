import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy.
 *
 * The main goal is privacy: `default-src 'self'` (which covers connect-src)
 * stops the page from talking to any other origin. The browser blocks such
 * requests no matter which code makes them, including third-party libraries.
 * MediaPipe, for example, contains a usage logger that posts to a Google
 * endpoint; this policy blocks it.
 *
 * Trade-off: 'unsafe-inline' is allowed for scripts because the page is
 * prerendered as static HTML, and nonces need per-request rendering. The app
 * shows no user-generated content, so the XSS risk this leaves is small.
 *
 * - 'wasm-unsafe-eval': MediaPipe runs as WebAssembly.
 * - 'unsafe-eval' (development only): React uses eval for debugging.
 * - blob:/data: images and blob: workers: used by the browser and MediaPipe.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }],
      },
      {
        // The service worker: always check for a new version, never use a stale copy.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
