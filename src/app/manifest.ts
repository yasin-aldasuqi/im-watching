import type { MetadataRoute } from "next";

/** Matches --bg in globals.css (light theme). */
const APP_BACKGROUND = "#fbf3e6";

/**
 * The web app manifest: the name, icons, and colors the browser uses when the
 * app is installed. Served at /manifest.webmanifest, and Next.js links it in
 * the page head.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Karamel",
    short_name: "Karamel",
    description: "Your posture buddy. Camera is optional and never leaves your device.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: APP_BACKGROUND,
    theme_color: APP_BACKGROUND,
    categories: ["health", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
