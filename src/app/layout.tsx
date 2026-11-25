import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/AppShell";
import "./globals.css";

// next/font downloads the fonts at build time and serves them from this app,
// so visitors make no request to Google Fonts (the CSP only allows 'self').
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Karamel",
  description: "Your posture buddy. Camera is optional and never leaves your device.",
  // The app name under the icon on iOS, and a full-screen window when installed.
  appleWebApp: { title: "Karamel", capable: true, statusBarStyle: "default" },
};

// The color of the browser's title bar (or the installed app's window), per theme.
// Matches --bg in globals.css.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf3e6" },
    { media: "(prefers-color-scheme: dark)", color: "#1c140f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} ${fredoka.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
