"use client";

import { useEffect, useRef } from "react";
import type { Alert } from "@/lib/alertChannels";
import { primaryButton } from "./styles";

/**
 * The full-screen nudge. It uses the native <dialog> with showModal(), so the
 * browser moves focus into it, closes it on Escape, and makes the rest of the
 * page inert while it is open.
 */
export default function NudgeDialog({ alert, onClose }: { alert: Alert | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (alert && !dialog.open) dialog.showModal();
    if (!alert && dialog.open) dialog.close();
    // Focus the button only after the dialog is open: React's autoFocus runs
    // earlier, while the dialog is still closed, so it would not work reliably.
    if (alert) buttonRef.current?.focus();
  }, [alert]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="nudge-title"
      onCancel={(event) => {
        // Escape: let React state decide, so the dialog and the state stay in sync.
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(90vw,32rem)] rounded-3xl border border-line bg-surface p-8 text-center text-ink shadow-2xl backdrop:bg-black/60"
    >
      {alert && (
        <div className="flex flex-col items-center gap-4">
          <p aria-hidden="true" className="text-7xl">
            🐈
          </p>
          <h2 id="nudge-title" className="font-display text-3xl font-semibold text-accent">
            {alert.title}
          </h2>
          <p className="text-xl font-bold">{alert.message}</p>
          <button ref={buttonRef} type="button" className={`${primaryButton} text-lg`} onClick={onClose}>
            Got it
          </button>
        </div>
      )}
    </dialog>
  );
}
