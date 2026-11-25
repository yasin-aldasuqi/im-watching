import type { Metadata } from "next";
import { Fredoka, Nunito } from "next/font/google";
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} ${fredoka.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
