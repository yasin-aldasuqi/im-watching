import Kitten from "@/components/Kitten";
import ReminderPanel from "@/components/ReminderPanel";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">I&apos;m Watching</h1>
        <p className="max-w-md text-lg text-stone-600 dark:text-stone-300">
          Your posture buddy. Sit up tall, I&apos;ve got my eye on you.
        </p>
      </div>
      <ReminderPanel>
        <Kitten className="h-auto w-48 sm:w-56" />
      </ReminderPanel>
      <p className="text-sm text-stone-500 dark:text-stone-400">
        Camera is optional and never leaves your device.
      </p>
    </main>
  );
}
