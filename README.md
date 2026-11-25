# Karamel 🐈

[![CI](https://github.com/yasin-aldasuqi/karamel/actions/workflows/ci.yml/badge.svg)](https://github.com/yasin-aldasuqi/karamel/actions/workflows/ci.yml)

Your posture buddy. Camera is optional and never leaves your device.

**Karamel** is a small web app where a little orange Siberian kitten keeps an eye on you and
gently reminds you to fix how you're sitting and straighten your back.

The app used to be called "I'm Watching". Settings saved under the old name are moved to the new
`karamel:` keys automatically (see [`src/lib/storage.ts`](src/lib/storage.ts)).

> Status: early development. Periodic posture reminders and the optional camera posture check work.
> Karamel can be installed as an app on Windows, Linux, macOS, Android, and iPhone, and opens
> without internet after the first visit.

## Features

- **Your own reminders.** Four built-in reminders, each with its own timer:
  🧍 Posture (30 min, on by default), 💧 Drink water (45 min), 👀 Rest your eyes (20 min, from the
  20-20-20 rule), and 🙆 Stand up and stretch (1 hour). Turn any of them on or off, and add up to 10
  custom reminders with your own name and emoji (for example "📞 Call mom").
- **Everything is editable per reminder:** interval (30 seconds to 2 hours), auto restart, and the
  messages the kitten says (one per line, up to 20). Built-in reminders can restore their default
  messages.
- **One session for all reminders.** Start, Pause, Resume, and Reset apply to every reminder that is
  on. The big countdown shows the reminder that comes next, with a "Coming up" list for the rest.
  Turning a reminder on, or changing its interval, during a session restarts only that reminder.
- **Cheeky messages.** Each firing shows a random message from that reminder's list, never the same
  one twice in a row. The defaults are in [`src/lib/messages.ts`](src/lib/messages.ts).
- **Restart automatically (per reminder).**
  - Off: after a reminder, the kitten waits until you press "Done" ("I'm sitting tall" for
    posture), so you don't come back to a pile of reminders after a break.
  - On: the next countdown starts right away, and the bubble hides after 10 seconds. After a long
    time away you get one reminder, not one for every missed cycle.
- **Choose how you're reminded** ("How should I remind you?"), for every reminder and slouch alert:
  - 💬 Speech bubble (always on).
  - 🔔 Desktop notifications, with the reminder's name in the title. Permission is requested only
    when you click "Enable notifications". Each reminder's new notification replaces its previous
    one.
  - 🔊 Sound: a short meow with a volume slider. It is synthesized with the Web Audio API, so there
    is no audio file to download or license. Browsers only allow sound after you interact with the
    page, so your first click or key press unlocks it.
  - 🗣️ Kitten speaks: the message is read out loud, without its emoji, **only with an offline
    voice**. Some browser voices (for example Chrome's "Google" voices) run on a server and would
    send the message text there. The CSP cannot block that, because the browser sends it, so those
    voices are never used. Without an offline voice the option is turned off and says why.
  - 🖥️ Full-screen nudge: a native `<dialog>` that covers the page until you press "Got it" (or
    Escape).
  - ✨ Blinking tab: while you're in another tab, the title alternates and the tab icon gets a red
    dot. It stops when you come back.

  Sound, speech, and the nudge start off, because they can be disruptive; blinking starts on.
  Each has a test button where it makes sense. Skipped posture reminders trigger none of them.
- **Local only.** Your reminders are saved in your browser's `localStorage`. Nothing is sent to a
  server. Saved data is treated as untrusted input and cleaned before use (length and count limits,
  valid intervals, safe ids), so corrupted data falls back to the defaults instead of crashing.
- **Optional camera posture check.** Turn on the camera, sit up straight, and press "Set my good
  posture". If you slouch for 5 seconds, the kitten calls you out ("Caught you slouching. 👀"), at
  most once a minute. See [Camera posture check](#camera-posture-check).
- **Smart camera modes** for the posture reminder while the camera is on: Smart (skip the reminder
  when you already sit well), Camera only (no posture timer, just slouch alerts), or Always. See
  [Smart camera modes](#smart-camera-modes).
- **Warm caramel design** with light and dark themes that follow your system. Every text and
  background pair meets WCAG contrast (at least 4.5:1). Fonts are self-hosted, so the strict CSP
  stays unchanged.
- The kitten blinks and sways its tail. All animations stop when your system asks for reduced motion.
- **Installable app (PWA)** that also works offline. See [Install as an app](#install-as-an-app).

## Install as an app

Karamel is a Progressive Web App (PWA): the browser installs it like an app, with its own window,
icon, and entry in your app list. No app store and no Mac needed.

| Where | How |
| --- | --- |
| Chrome or Edge (Windows, Linux, macOS, ChromeOS) | Press **Install Karamel** at the top of the page, or the install icon in the address bar |
| Chrome on Android | Menu ⋮ → **Add to home screen** / **Install app** (or the **Install Karamel** button) |
| Safari on iPhone or iPad | Share → **Add to Home Screen** |
| Safari on macOS | File → **Add to Dock** |
| Firefox | Desktop Firefox cannot install web apps; on Android use Menu → **Install** |

Installing needs HTTPS (or `localhost`). To try it locally, use the production build, because the
service worker is turned off in development:

```bash
npm run build && npm start
```

How it works:

- **Manifest** ([`src/app/manifest.ts`](src/app/manifest.ts)): name, colors, and icons. The PNG
  icons, including a padded "maskable" one for Android's round icon shapes and the iOS icon, are
  made from the SVG by [`scripts/generate-icons.sh`](scripts/generate-icons.sh).
- **Service worker** ([`public/sw.js`](public/sw.js)), written by hand, without a library, so
  every line is easy to read. It saves a copy of the app so it opens offline:
  - Files under `/_next/static/` have a content hash in their name and never change, so they are
    served from the saved copy first.
  - Everything else (the page, the pose model, the MediaPipe runtime) is fetched from the network
    first, so updates are always picked up, and the saved copy is used only when offline.
  - On install it also saves the scripts the page points to, because the page loaded them before
    the worker existed.
  - It handles only requests to the app's own origin. Requests to other origins are not touched,
    so the CSP still blocks them; an e2e test checks this and also proves it would see a leak if
    the CSP were off.
- **Notifications on Android**: Android browsers do not allow a page to create a notification
  directly, only a service worker. Karamel falls back to the worker there, so reminders can still
  notify you. Clicking a notification brings the Karamel window to the front.
- **No push notifications, on purpose.** Web push needs a server and sends every message through
  the browser maker's push service (Google, Mozilla, or Apple). That would break "never leaves your
  device", so reminders still need the Karamel window to be open (it can be minimized).

## How the timer works

Each reminder's timer is a pure state machine in [`src/lib/reminder.ts`](src/lib/reminder.ts)
(`idle` → `running` → `due`, plus `paused`). It has no timers, no DOM access, and no
`Math.random()`. The current time and a random number are passed in, which makes it easy to unit test.

Time is tracked as a deadline (`endsAt`), not as a counter decreased every second. Browsers
throttle timers in background tabs, so a counter would fall behind. With a deadline, a late tick
still gives the right answer, and the app re-checks as soon as the tab becomes visible again.

[`src/lib/reminderSession.ts`](src/lib/reminderSession.ts) runs several of those timers at once
(one per reminder) and applies changes safely. [`src/lib/reminders.ts`](src/lib/reminders.ts)
defines the built-in and custom reminders and cleans saved data.
[`src/hooks/useReminders.ts`](src/hooks/useReminders.ts) connects it all to the browser: loading
and saving, the 1-second tick, and notifications. It saves only after loading, so React Strict
Mode's double startup effects cannot overwrite saved reminders with the defaults.
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

### Smart camera modes

"When the camera is on" decides what the 🧍 Posture reminder does. The modes apply only while the
camera is on **and calibrated**, because before that it cannot judge posture. With the camera off,
the posture timer works as usual. Other reminders (water, eyes, stretch, custom) are never skipped.

| Mode | Posture timer |
| --- | --- |
| **Smart** (default) | When it fires, the camera is checked first. If you sit well, the reminder is skipped quietly (a short "Skipped" note and a counter show it) and the countdown starts over. If you slouch, or the camera cannot see you, you get the reminder. |
| **Camera only** | No posture timer reminders. Its countdown is replaced by "the camera is watching". Slouch alerts still work. |
| **Always** | Reminds on schedule, even when you sit well. |

The skip decision happens in the pure session engine (`skipPosture` on the tick action), so it is
unit tested without a camera. The mode is saved in `localStorage` and read with
`useSyncExternalStore`, which also keeps two open tabs in sync.

When the camera turns on and notifications are not decided yet, the camera card offers a "Turn on
notifications" button. It is a button rather than an automatic prompt, because browsers only allow
permission prompts right after a user click, and that click is long gone by the time the camera has
started.

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
- `src/lib/reminders.test.ts`: built-in and custom reminders, message cleaning, and cleaning of
  untrusted saved data (bad types, unknown fields, unsafe ids, limits) and the migration.
- `src/lib/reminderSession.test.ts`: several reminders at once, session controls, and safe
  changes during a session.
- `src/lib/messages.test.ts`: the message picker never repeats the last message and can reach
  every other message.
- `src/components/Reminders.test.tsx`: component tests with fake timers and a mocked
  `Math.random()`. They cover one and several reminders, pause and resume, a throttled background
  tab catching up, editing messages, adding and deleting a custom reminder, saving, migration,
  corrupted data, React Strict Mode, and notifications (the Notification API is mocked).
- `src/lib/alertChannels.test.ts`: cleaning saved alert settings, removing emoji for speech,
  never picking an online voice, title blinking, and the meow shape.
- `src/components/AlertChannels.test.tsx`: each way to remind with fakes for Web Audio, speech,
  and `<dialog>` (which jsdom does not have): sound and volume, offline-only speech, the nudge with
  focus and Escape, blinking only in a hidden tab, and saving the choices.
- `src/app/manifest.test.ts`: the manifest describes an installable app, and every icon exists
  with the size it claims (read from the PNG header).
- `src/lib/pwa.test.tsx`: the Install button appears only when the browser offers installing, opens
  the install window once, and hides after installing; and on Android-like browsers notifications
  go through the service worker, and closing one closes only that one.
- `src/lib/posture.test.ts`: the posture measurement (aspect ratio, distance from the camera,
  hidden points), calibration, hysteresis, the 5-second hold, and the 60-second cooldown.
- `src/lib/poseModel.test.ts`: the committed model file matches its pinned SHA-256, and the
  runtime was copied.
- `src/components/CameraPanel.test.tsx`: the camera flow with a fake camera and a fake model. It
  covers calibration, alerts, every error message, and that the camera is stopped when turned off,
  on an error, when the page goes away, and when it is turned off while still starting. It also
  covers the smart camera modes (skipping, camera only, before calibration, other reminders never
  skipped, saving the mode) and the notification offer. It moves the clock one camera check at a
  time, like a browser that re-renders between timer tasks.

End-to-end tests use [Playwright](https://playwright.dev) with Chromium and a fake camera
(`e2e/`). Every request to another origin is recorded and aborted, so tests never leak data.

- `e2e/smoke.spec.ts`: the page works under the CSP and makes no external requests.
- `e2e/camera.spec.ts`: the real model loads from the app's own origin and runs, the camera turns
  off cleanly, and over more than a minute of camera use nothing leaves the browser.
- `e2e/pwa.spec.ts`: the manifest and icons are served, Chrome's own installability check
  finds no errors, the app opens and runs with the network off after one visit, and a page
  controlled by the service worker still cannot send data to another origin (with a control test
  that switches the CSP off and checks that the leak is then detected).

## Continuous integration

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every pull request
and on every push to `main`. It does a clean `npm ci` with the Node version from `.nvmrc`, then runs
lint, typecheck, unit tests, a production build, and the Playwright tests against that build. A
failure in any step fails the check, and the Playwright report is uploaded when e2e tests fail.

`main` is protected by a repository ruleset: changes go through pull requests, and the CI check
must pass before merging.

## Known limitations

- **The app must stay open.** Closing the tab (or the installed app's window) stops the reminders.
  A minimized window keeps working. There is no push server, on purpose (see
  [Install as an app](#install-as-an-app)). A tray app would need a desktop wrapper such as Tauri.
- **Background tabs can be up to about a minute late.** Browsers throttle timers in background
  tabs. The reminder fires on the next allowed tick, or right away when you return to the tab.
  With short intervals such as 30 seconds, this means a background tab may remind you about once a
  minute instead of every 30 seconds.
- **Mobile is not tested on a real device.** The Android notification fallback is tested with a
  fake service worker, and installing was checked with Chrome's installability check on desktop,
  not on a phone or iPhone. Phones also pause background pages much more than desktops, so
  reminders on a phone are only reliable while Karamel is on screen.
- **The camera works offline only after it was used once online**, because the pose model (about
  6 MB) is saved the first time it is downloaded, not on install.
- **Speech depends on the browser's voices.** If the browser has no offline voice (common in
  Chrome on some systems), the kitten cannot speak.
- **Sound needs one interaction first.** If you never click or press a key on the page after
  loading it, browsers block the meow.
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
