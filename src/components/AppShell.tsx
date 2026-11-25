"use client";

import { useEffect } from "react";
import { registerServiceWorker, useInstallPrompt } from "@/lib/pwa";
import { secondaryButton } from "./styles";

/** Registers the service worker once the page has loaded. Renders nothing. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}

/** "Install Karamel", shown only when the browser says the app can be installed. */
export function InstallButton() {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <button type="button" className={`${secondaryButton} ml-auto text-sm`} onClick={install}>
      <span aria-hidden="true">⬇️ </span>
      Install Karamel
    </button>
  );
}
