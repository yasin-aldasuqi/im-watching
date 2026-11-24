# I'm Watching 🐈

[![CI](https://github.com/yasin-aldasuqi/im-watching/actions/workflows/ci.yml/badge.svg)](https://github.com/yasin-aldasuqi/im-watching/actions/workflows/ci.yml)

Your posture buddy. Camera is optional and never leaves your device.

**I'm Watching** is a small web app where a little orange Siberian kitten keeps an eye on you
and gently reminds you to fix how you're sitting and straighten your back.

> Status: early development. Periodic posture reminders work. The optional camera is not built yet.

## Features

- **Periodic reminders.** Pick an interval (15, 20, 30, 45, or 60 minutes, default 30) and press
  Start. When time is up, the kitten hops and says "Sit up straight!", and the tab title changes.
- **Next cycle on your terms.** The next countdown starts only when you press "I'm sitting tall",
  so you don't come back to a pile of reminders after a break.
- **Optional desktop notifications.** Permission is requested only when you click
  "Enable notifications". The in-page reminder works without it.
- **Pause, resume, and reset.** Time spent paused does not count.
- **Local only.** The chosen interval is saved in your browser's `localStorage`. Nothing is sent
  to a server.
- The kitten blinks and sways its tail. All animations stop when your system asks for reduced motion.

## How the timer works

The reminder logic is a pure state machine in [`src/lib/reminder.ts`](src/lib/reminder.ts)
(`idle` → `running` → `due`, plus `paused`). It has no timers and no DOM access. The current time
is passed in, which makes it easy to unit test.

Time is tracked as a deadline (`endsAt`), not as a counter decreased every second. Browsers
throttle timers in background tabs, so a counter would fall behind. With a deadline, a late tick
still gives the right answer, and the app re-checks as soon as the tab becomes visible again.

[`src/hooks/useReminder.ts`](src/hooks/useReminder.ts) connects that logic to the browser: the
1-second tick, the tab title, notifications, and `localStorage`.

## Getting started

Requirements: Node.js (version in `.nvmrc`) and npm.

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

Other scripts:

| Command              | What it does                         |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start the development server         |
| `npm run build`      | Build the app for production         |
| `npm run start`      | Serve the production build           |
| `npm run lint`       | Check the code with ESLint           |
| `npm run typecheck`  | Check TypeScript types               |
| `npm test`           | Run the tests once (Vitest)          |
| `npm run test:watch` | Run the tests in watch mode          |

## Tests

Tests use [Vitest](https://vitest.dev) and React Testing Library with jsdom.

- `src/lib/reminder.test.ts`: unit tests for every state transition and for time formatting.
- `src/components/ReminderPanel.test.tsx`: component tests with fake timers. They cover a full
  reminder cycle, pause and resume, a throttled background tab catching up, saving the interval,
  and each notification permission state (the Notification API is mocked).

## Continuous integration

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every pull request
and on every push to `main`. It does a clean `npm ci` with the Node version from `.nvmrc`, then runs
lint, typecheck, tests, and a production build. A failure in any step fails the check.

`main` is protected by a repository ruleset: changes go through pull requests, and the CI check
must pass before merging.

## Known limitations

- **The tab must stay open.** Closing the tab stops the reminders. There is no service worker or
  push server.
- **Background tabs can be up to about a minute late.** Browsers throttle timers in background
  tabs. The reminder fires on the next allowed tick, or right away when you return to the tab.
- **Notifications may not work on mobile.** Some mobile browsers only allow notifications from a
  service worker. The in-page reminder still works.
- **No sound.**
- **No end-to-end browser tests yet.** The tests run in jsdom, not a real browser. The reminder
  flow and notifications were not tested in a real browser by automation.
