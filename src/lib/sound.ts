import { MEOW } from "./alertChannels";

/**
 * A short "meow", synthesized with the Web Audio API. There is no audio file:
 * nothing to download, no license to worry about, and nothing for the CSP to
 * allow.
 */

type AudioContextConstructor = new () => AudioContext;

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Constructor: AudioContextConstructor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!Constructor) return null;
  context ??= new Constructor();
  return context;
}

/**
 * Browsers only allow a page to play sound after the user interacted with it
 * (autoplay policy). Call this from a click or key handler.
 */
export function unlockAudio(): void {
  const audio = getContext();
  if (audio?.state === "suspended") void audio.resume();
}

/** Plays the meow. Returns false when sound is not available. */
export function playMeow(volume: number): boolean {
  const audio = getContext();
  if (!audio || volume <= 0) return false;

  const start = audio.currentTime;
  const end = start + MEOW.duration;

  // A quick fade in and out, so the sound does not click.
  const envelope = audio.createGain();
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.4), start + 0.03);
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  envelope.connect(audio.destination);

  // A main tone plus a softer one an octave higher, which sounds more like a voice.
  const voices: [OscillatorType, number, number][] = [
    ["triangle", 1, 1],
    ["sine", 2, 0.3],
  ];
  for (const [type, multiplier, level] of voices) {
    const oscillator = audio.createOscillator();
    oscillator.type = type;
    MEOW.pitch.forEach(({ time, frequency }, i) => {
      const at = start + time;
      if (i === 0) oscillator.frequency.setValueAtTime(frequency * multiplier, at);
      else oscillator.frequency.linearRampToValueAtTime(frequency * multiplier, at);
    });
    const gain = audio.createGain();
    gain.gain.value = level;
    oscillator.connect(gain);
    gain.connect(envelope);
    oscillator.start(start);
    oscillator.stop(end + 0.05);
  }
  return true;
}

/** Tests replace window.AudioContext; this forgets the cached one. */
export function resetAudioForTests(): void {
  context = null;
}
