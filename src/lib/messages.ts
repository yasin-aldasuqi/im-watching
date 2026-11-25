/**
 * What the kitten says when a reminder fires. Short, cheeky, a little bossy.
 * Shown in the speech bubble and in the desktop notification.
 */
export const REMINDER_MESSAGES = [
  "I can see you. 👀",
  "Do what we agreed on. Back straight.",
  "Don't mess this up. Sit up.",
  "That slouch? I saw it.",
  "Your spine called. It's not happy.",
  "Shoulders back. I'm not asking twice.",
  "Sit up straight or I knock your coffee off the desk. ☕",
  "Still slouching? I'll just sit on your keyboard then.",
  "Purr-fect posture only, please. 🐾",
  "Chin up, back straight. I believe in you. Mostly.",
  "Remember our deal? Straight back, happy kitten.",
  "Meow means sit up. Everyone knows that.",
  "I didn't climb up here to watch you slouch.",
  "Posture check! Make me proud. 😼",
] as const;

/** Reminder: drink water. */
export const WATER_MESSAGES = [
  "Hydration check! Drink some water. 💧",
  "Sip sip! Your brain will thank you.",
  "Cats don't love water. You should still drink some.",
  "Water break! I'll wait right here. 🐾",
  "Refill that glass. I'm watching. 👀",
  "Thirsty brains make grumpy humans. Drink up!",
] as const;

/** Reminder: rest your eyes (20-20-20: every 20 minutes, look 20 feet away for 20 seconds). */
export const EYES_MESSAGES = [
  "Look at something far away for 20 seconds. 👀",
  "Eyes off the screen! Find something far away.",
  "Blink, blink. Rest your eyes for a moment.",
  "Look out the window. I'll guard the screen. 😼",
  "20 seconds, something far away. Go!",
] as const;

/** Reminder: stand up and stretch. */
export const STRETCH_MESSAGES = [
  "Stand up and stretch! 🙆",
  "Time to unfold yourself. Stretch!",
  "Cats stretch all day. Your turn.",
  "Up you get! Roll those shoulders.",
  "Walk around a bit. I'll keep your seat warm. 🐾",
] as const;

/** What the kitten says when the camera sees you slouching. */
export const SLOUCH_MESSAGES = [
  "Caught you slouching. 👀",
  "I saw that. Sit up.",
  "Your back just did a question mark. Fix it.",
  "Slouch detected. I'm judging you a little.",
  "Head up! You're melting into the chair.",
  "Hey! Shoulders back, chin up. 😼",
  "That's not the posture we agreed on.",
  "I'm watching… and that's a slouch.",
] as const;

/**
 * Picks the index of the next message. It never returns `previous`, so the
 * same message never shows twice in a row.
 *
 * @param previous index of the last message, or null if there was none
 * @param random a number in [0, 1), for example from Math.random()
 * @param count how many messages there are to choose from
 */
export function pickMessageIndex(
  previous: number | null,
  random: number,
  count: number = REMINDER_MESSAGES.length,
): number {
  const r = Math.min(Math.max(random, 0), 0.999999);

  if (previous === null || previous < 0 || previous >= count) {
    return Math.floor(r * count);
  }
  // Choose among the other (count - 1) messages, then skip over `previous`.
  const index = Math.floor(r * (count - 1));
  return index >= previous ? index + 1 : index;
}
