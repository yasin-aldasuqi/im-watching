import Kitten from "@/components/Kitten";
import PostureBuddy from "@/components/PostureBuddy";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-4 py-6 sm:py-10">
      <header className="flex w-full max-w-5xl items-center gap-3">
        <Kitten decorative className="h-12 w-12" />
        <div className="text-left">
          <h1 className="font-display text-3xl font-semibold leading-none tracking-tight text-accent">
            Karamel
          </h1>
          <p className="text-sm text-soft">Your posture buddy. Sit up tall, I&apos;ve got my eye on you.</p>
        </div>
      </header>

      <main className="flex w-full flex-1 justify-center">
        <PostureBuddy>
          <Kitten className="h-auto w-44 sm:w-52" />
        </PostureBuddy>
      </main>

      <footer className="text-center text-sm text-soft">
        <span aria-hidden="true">🔒 </span>
        Camera is optional and never leaves your device.
      </footer>
    </div>
  );
}
