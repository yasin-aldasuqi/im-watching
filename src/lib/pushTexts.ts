import { notificationTitle, type ReminderConfig } from "./reminders";

/**
 * The reminders' titles and messages, saved where the service worker can read them. A push
 * carries only the reminder's id; public/sw.js looks up the text here, so the text never
 * leaves the device. (A service worker cannot read localStorage, but it can read Cache
 * Storage.) public/sw.js uses the same cache name and URL; a test checks they match.
 */
export const REMINDER_TEXTS_CACHE = "karamel-reminder-texts";
export const REMINDER_TEXTS_URL = "/__karamel/reminder-texts.json";

export type ReminderTexts = Record<string, { title: string; messages: string[] }>;

export function reminderTexts(reminders: readonly ReminderConfig[]): ReminderTexts {
  return Object.fromEntries(reminders.map((r) => [r.id, { title: notificationTitle(r), messages: r.messages }]));
}

export async function saveReminderTexts(reminders: readonly ReminderConfig[]): Promise<void> {
  if (typeof caches === "undefined") return;
  const cache = await caches.open(REMINDER_TEXTS_CACHE);
  await cache.put(
    REMINDER_TEXTS_URL,
    new Response(JSON.stringify(reminderTexts(reminders)), { headers: { "Content-Type": "application/json" } }),
  );
}

export async function deleteReminderTexts(): Promise<void> {
  if (typeof caches !== "undefined") await caches.delete(REMINDER_TEXTS_CACHE);
}
