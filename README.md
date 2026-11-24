# I'm Watching 🐈

[![CI](https://github.com/yasin-aldasuqi/im-watching/actions/workflows/ci.yml/badge.svg)](https://github.com/yasin-aldasuqi/im-watching/actions/workflows/ci.yml)

Your posture buddy. Camera is optional and never leaves your device.

**I'm Watching** is a small web app where a little orange Siberian kitten keeps an eye on you
and gently reminds you to fix how you're sitting and straighten your back.

> Status: early development. Periodic posture reminders and the optional camera posture check work.

## Features

- **Periodic reminders.** Pick an interval from 30 seconds to 30 minutes (default 30 minutes) and
  press Start. When time is up, the kitten hops, a speech bubble pops up, and the tab title changes.
- **Cheeky messages.** Each reminder shows a random message from the kitten, such as "I can see
  you. 👀", "Do what we agreed on.", or "Sit up straight or I knock your coffee off the desk. ☕".
  The same message never shows twice in a row. The list is in
  [`src/lib/messages.ts`](src/lib/messages.ts).
- **Restart automatically (optional).**
  - Off (the default): after a reminder, the kitten waits until you press "I'm sitting tall", so you
    don't come back to a pile of reminders after a break.
  - On: the next countdown starts right away, and the bubble hides after 10 seconds. After a long
    time away you get one reminder, not one for every missed cycle.
- **Optional desktop notifications** with the same message. Permission is requested only when you
  click "Enable notifications". A new notification replaces the previous one. The in-page reminder
  works without notifications.
- **Pause, resume, and reset.** Time spent paused does not count.
- **Local only.** The interval and the auto-restart choice are saved in your browser's
  `localStorage`. Nothing is sent to a server.
- **Optional camera posture check.** Turn on the camera, sit up straight, and press "Set my good
  posture". If you slouch for 5 seconds, the kitten calls you out ("Caught you slouching. 👀"), at
  most once a minute. See [Camera posture check](#camera-posture-check).
- The kitten blinks and sways its tail. All animations stop when your system asks for reduced motion.

## How the timer works

The reminder logic is a pure state machine in [`src/lib/reminder.ts`](src/lib/reminder.ts)
(`idle` → `running` → `due`, plus `paused`). It has no timers, no DOM access, and no
`Math.random()`. The current time and a random number are passed in, which makes it easy to unit test.

Time is tracked as a deadline (`endsAt`), not as a counter decreased every second. Browsers
throttle timers in background tabs, so a counter would fall behind. With a deadline, a late tick
still gives the right answer, and the app re-checks as soon as the tab becomes visible again.

[`src/hooks/useReminder.ts`](src/hooks/useReminder.ts) connects that logic to the browser: the
1-second tick, notifications, and `localStorage`.
[`src/components/PostureBuddy.tsx`](src/components/PostureBuddy.tsx) owns the speech bubble and
the tab title, because both the timer and the camera can change them.

## Camera posture check

The camera is **off by default** and only starts when you press "Turn on camera".

### How it works

1. The browser asks for camera permission. The app asks for video only, never audio.
2. 4 times per second, the current video frame goes to
   [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
   (the "lite" model), which runs in the browser as WebAssembly and finds body points.
3. [`src/lib/posture.ts`](src/lib/posture.ts) measures how high your ears are above your shoulder
   line, divided by your shoulder width. Slouching or pushing your head forward makes this number
   drop. Dividing by shoulder width keeps it the same when you move closer to or further from the
   camera.
4. **Calibration:** "Set my good posture" takes the median of 8 measurements (about 2 seconds) as
   your personal baseline. Bodies, chairs, and camera angles differ, so you are compared with
   yourself, not with a fixed rule. The baseline (one number) is saved in `localStorage`.
5. **Slouching** starts at 15% below your baseline. You count as sitting well again only above
   7.5% below it. This gap (hysteresis) stops the status from flickering at the edge.
6. **Alerts** fire after 5 seconds of continuous slouching, at most once every 60 seconds. Leaving
   the camera's view resets the 5 seconds.

### Privacy

- **Video never leaves your device.** Frames go from the camera straight into the model in your
  browser tab. They are not drawn, stored, or uploaded.
- **Everything is served by this app.** The model file
  ([`public/models/`](public/models/), pinned by SHA-256 in
  [`src/lib/poseModel.ts`](src/lib/poseModel.ts)) and the WebAssembly runtime (copied from
  `node_modules` into `public/mediapipe/` by `npm install`) come from the app itself, not from a
  CDN. The MediaPipe JavaScript is downloaded only when you turn on the camera.
- **A Content Security Policy enforces this.** [`next.config.ts`](next.config.ts) sends
  `default-src 'self'`, so the browser refuses requests to any other origin, whatever code makes
  them.
- **Why that matters here:** the MediaPipe library contains a built-in usage logger that posts
  usage statistics to `odml.pa.googleapis.com` about once a minute. There is no public option to
  turn it off. The end-to-end test showed the library trying to send it, and the CSP blocking it.
  The test also confirms that removing the CSP lets the request out, so the CSP is what keeps the
  promise.
- Turning the camera off, an error, or leaving the page stops every camera track, so the camera
  light goes off.

### About the model

From the [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf)
(BlazePose GHUM 3D, Apache-2.0):

- The lite model finds about 87% of body points correctly on average. The full model is about 92%
  but almost twice the size. This app uses lite, because it only needs ears and shoulders, which
  are large and easy to find, and per-user calibration absorbs a steady error. Switching models is
  a one-line change in `src/lib/poseModel.ts` (plus the new SHA-256).
- Accuracy is not the same for everyone. For the lite model, the gap between the best and worst
  skin-tone groups is about 7%, and between genders about 3%.
- It was trained mostly on full-body fitness photos taken with phone back cameras. A person sitting
  at a desk, seen from the upper body by a webcam, is outside that, so accuracy may be lower here.
- It tracks one person. Surveillance and identity recognition are out of scope for the model, and
  this app does neither.

## Getting started

Requirements: Node.js (version in `.nvmrc`) and npm.

```bash
npm install   # also copies the MediaPipe runtime into public/mediapipe/
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
| `npm run test:e2e`   | Run the real-browser tests (Playwright) |

Before the first `npm run test:e2e`, install the browser once with
`npx playwright install chromium`. The e2e tests build the app and serve it on port 3100, so they
do not clash with `npm run dev`.

## Tests

Unit and component tests use [Vitest](https://vitest.dev) and React Testing Library with jsdom.

- `src/lib/reminder.test.ts`: unit tests for every state transition, auto restart, interval
  labels, and time formatting.
- `src/lib/messages.test.ts`: the message picker never repeats the last message and can reach
  every other message.
- `src/components/ReminderPanel.test.tsx`: component tests with fake timers and a mocked
  `Math.random()`. They cover manual and auto-restart cycles, the 10-second bubble, a 30-second
  interval, pause and resume, a throttled background tab catching up, saved settings, and each
  notification permission state (the Notification API is mocked).
- `src/lib/posture.test.ts`: the posture measurement (aspect ratio, distance from the camera,
  hidden points), calibration, hysteresis, the 5-second hold, and the 60-second cooldown.
- `src/lib/poseModel.test.ts`: the committed model file matches its pinned SHA-256, and the
  runtime was copied.
- `src/components/CameraPanel.test.tsx`: the camera flow with a fake camera and a fake model. It
  covers calibration, alerts, every error message, and that the camera is stopped when turned off,
  on an error, when the page goes away, and when it is turned off while still starting.

End-to-end tests use [Playwright](https://playwright.dev) with Chromium and a fake camera
(`e2e/`). Every request to another origin is recorded and aborted, so tests never leak data.

- `e2e/smoke.spec.ts`: the page works under the CSP and makes no external requests.
- `e2e/camera.spec.ts`: the real model loads from the app's own origin and runs, the camera turns
  off cleanly, and over more than a minute of camera use nothing leaves the browser.

## Continuous integration

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every pull request
and on every push to `main`. It does a clean `npm ci` with the Node version from `.nvmrc`, then runs
lint, typecheck, unit tests, a production build, and the Playwright tests against that build. A
failure in any step fails the check, and the Playwright report is uploaded when e2e tests fail.

`main` is protected by a repository ruleset: changes go through pull requests, and the CI check
must pass before merging.

## Known limitations

- **The tab must stay open.** Closing the tab stops the reminders. There is no service worker or
  push server.
- **Background tabs can be up to about a minute late.** Browsers throttle timers in background
  tabs. The reminder fires on the next allowed tick, or right away when you return to the tab.
  With short intervals such as 30 seconds, this means a background tab may remind you about once a
  minute instead of every 30 seconds.
- **Notifications may not work on mobile.** Some mobile browsers only allow notifications from a
  service worker. The in-page reminder still works.
- **No sound.**
- **Real-browser tests cover the camera, not the reminder flow.** The reminder cycle and real
  notifications are tested in jsdom and by hand, not by Playwright.
- **Camera detection accuracy is only tested by hand.** The fake camera in the e2e tests shows a
  test pattern, not a person, so the tests prove the model loads and runs, not that it detects
  slouching well. That depends on your camera, light, and seating, and needs a manual check with
  a real camera.
- **The camera check may slow down in a background tab.** Browsers throttle timers in background
  tabs (down to about once a minute after a while). How this affects the 4-per-second check was
  not measured yet.
- **Model limits:** one person, head and shoulders must be in view, and accuracy varies between
  people (see [About the model](#about-the-model)).
- **The CSP allows inline scripts** (`'unsafe-inline'`). Nonces would be stricter, but they need
  per-request rendering, and the page is static. The app shows no user-generated content, so the
  XSS risk this leaves is small.
- **The camera needs HTTPS** (or localhost), like every browser camera API.

## Third-party components

- [MediaPipe Tasks Vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) and the Pose
  Landmarker model, by Google, under the Apache License 2.0.
