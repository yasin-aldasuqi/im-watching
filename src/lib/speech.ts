import { useSyncExternalStore } from "react";
import { pickLocalVoice, speechText } from "./alertChannels";

/**
 * The kitten reads messages out loud with the browser's speech synthesis.
 *
 * Privacy: some voices run on a server (for example Chrome's "Google" voices),
 * so the spoken text would leave the device. The CSP cannot block that, because
 * the browser sends it, not the page. So only offline voices (localService) are
 * used, and the voice is always set explicitly, so the browser never falls
 * back to an online default.
 */

function supported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function localVoice(): SpeechSynthesisVoice | null {
  return supported() ? pickLocalVoice(window.speechSynthesis.getVoices()) : null;
}

/** Speaks the message without its emoji. Returns false when no offline voice is available. */
export function speak(message: string): boolean {
  const voice = localVoice();
  const text = speechText(message);
  if (!voice || !text) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.pitch = 1.4; // A little higher, like a kitten.
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

// Voices load asynchronously in some browsers, so listen for "voiceschanged".
function subscribe(onChange: () => void): () => void {
  if (!supported()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", onChange);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", onChange);
}

/** True when an offline voice is available. False on the server. */
export function useHasLocalVoice(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => localVoice() !== null,
    () => false,
  );
}
