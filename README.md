# Karamel 🐈

[![CI](https://github.com/yasin-aldasuqi/karamel/actions/workflows/ci.yml/badge.svg)](https://github.com/yasin-aldasuqi/karamel/actions/workflows/ci.yml)

Your posture buddy. Camera is optional and never leaves your device.

**Try it: <https://karamel-mauve.vercel.app>** (installable as an app, see
[Install as an app](#install-as-an-app)).

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
- **Local by default.** Your reminders and your running session are saved in your browser's
  `localStorage`. Nothing is sent to a server unless you turn on "Remind me when Karamel is closed"
  (below). Saved data is treated as untrusted input and cleaned before use (length and count
  limits, valid intervals, safe ids), so corrupted data falls back to the defaults instead of
  crashing.
- **The session survives closing Karamel.** Phones close apps in the background all the time, so
  running timers are saved and restored. A countdown continues where it was; a repeating reminder
  whose time passed while Karamel was closed continues on the same beat (09:00, 09:30, 10:00, ...)
  without alerting again on reopening; a one-time reminder that passed waits for "Done".
- **📱 Remind me when Karamel is closed (optional).** Phones freeze a web page soon after you leave
  it, so on iPhone and iPad the page cannot remind you by itself. With this on, Karamel's server
  ([`server/`](server/)) sends a Web Push at the right times. See
  [Reminders while Karamel is closed](#reminders-while-karamel-is-closed).
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
- **Reminders while closed** come from Web Push and are optional; see
  [Reminders while Karamel is closed](#reminders-while-karamel-is-closed). On iPhone and iPad, Web
  Push only works in the app added to the Home Screen; the app explains this.

## Reminders while Karamel is closed

An option in "How should I remind you?": **📱 Remind me when Karamel is closed.** It shows only on
a website built with a push server (`KARAMEL_API_URL`, see [Hosting](#hosting)).

How it works:

1. Turning it on asks for notification permission, subscribes this browser with its push service
   (Apple's, Google's, Mozilla's, or Microsoft's) using the server's public VAPID key, and registers
   that subscription with Karamel's server. The server returns a device id and a secret key, kept
   in `localStorage`.
2. Whenever the schedule changes (Start, Pause, Done, a firing, a new interval), the page sends the
   whole list: for each running reminder, its id, "fires in N seconds", and its interval. Not every
   second: the list has a signature made of the absolute deadlines, and only a change sends it.
3. At the right time, the server sends an encrypted push holding only `{"reminderKey": "water"}`.
   The service worker looks up that reminder's title and messages, which the page saved on the
   device (Cache Storage), and shows the notification.
4. Turning it off deletes the device and its schedules from the server and drops the
   subscription.

**What leaves the device, honestly:** with this on, Karamel's server learns an anonymous push
address and the reminder ids and times (for example "water, in 45 minutes, every 45 minutes"), and
the push service (Apple, Google, ...) learns when it delivers a message to you. **Reminder names
and messages, settings, and anything from the camera stay on the device.** With it off (the
default), nothing is sent anywhere.

Decisions:

- **The website forwards `/api/*` to the server** (a Next.js rewrite), so the page only ever talks
  to its own origin: the CSP stays `connect-src 'self'` and the server needs no CORS.
- **No server, no option, no request.** The build turns `KARAMEL_API_URL` into an on/off flag for
  the page, so a site without a server never asks for `/api` (and never logs a 404).
- **One notification, not two.** When Karamel is open, its own reminder and the push for the same
  firing use the same notification tag, so the second replaces the first. Times sent to the
  server are rounded up, so the page's own reminder comes first.
- **Posture stays on the device while the camera decides** (Smart and Camera-only modes): only the
  page knows what the camera sees, so posture is not handed to the server meanwhile.
- **Self-repair:** if the server forgot the device (`401`), the page registers the subscription
  again and retries once. If the browser replaced the subscription, it is registered again on the
  next load. A failed sync is retried when the device is back online or Karamel is back on screen.
- **Safari's rule:** every push shows a notification, even when the text is missing (then a neutral
  "Time for a little break."), because Safari takes the push permission away from sites whose
  pushes show nothing.

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
- `e2e/push.fullstack.spec.ts` (optional, skipped unless configured): the whole chain, browser →
  the website's `/api` rewrite → the .NET API → PostgreSQL. Turning on creates the device, Start
  creates a `posture` schedule firing in 30 minutes by the server's clock, Pause removes it, and
  turning off deletes the device. Headless Chromium has no push service, so a small script stands
  in for the browser's subscription (with a real P-256 key). To run it: start PostgreSQL, run the
  API with `Push__SenderEnabled=false` (so nothing is sent to a real push service), build and
  start the website with `KARAMEL_API_URL=http://localhost:5080` on port 3100, then run
  `KARAMEL_FULLSTACK_DB=postgresql://karamel@localhost:55432/karamel npx playwright test
  e2e/push.fullstack.spec.ts`. It was checked to fail with the API stopped and with the Bearer key
  left out of the requests.

Tests for reminders while closed (Vitest):

- `src/lib/reminderSession.test.ts` (restoring): a countdown continues, a repeating reminder
  catches up on its beat, a one-time reminder waits for Done, a paused session stays paused,
  current settings win, and nine kinds of broken saved data start fresh.
- `src/lib/pushSchedules.test.ts`: which timers become schedules (running only), rounding up, and
  a signature that does not change while time passes.
- `src/lib/pushClient.test.ts`: support detection (including the iPhone Home Screen case), turning
  on (permission first, the server's key, registration), replacing a subscription made with old
  keys, syncing with the Bearer secret, registering again after a `401`, turning off, and checking
  on load. A fake browser and a fake server (`src/test-utils/fakePush.ts`) stand in.
- `src/lib/serviceWorker.test.ts`: runs the real `public/sw.js` in a fake worker. A push shows the
  reminder's own text with the page's tag, a missing text still shows a neutral notification,
  cleanup keeps the saved texts, and `/api` is never cached.
- `src/components/PushReminders.test.tsx` and one test in `CameraPanel.test.tsx`: the option
  through the real page component, from hidden to on, syncing on Start and Pause but not every
  second, closing and reopening, a server that is down, blocked notifications, and posture staying
  on the device while the camera decides.

Each guarantee was checked by breaking it on purpose (23 breaks in this step), for example: timers
not saved, catching up off the beat, alerting again on reopening, no re-registration after a `401`,
keeping a subscription with old keys, page and worker disagreeing on the cache name or the tag, no
sync when the schedule changes, and posture sent while the camera decides. Two of the first test
runs found real bugs: reopening alerted again for reminders that fired while Karamel was closed,
and a site without a server logged a 404 on every visit.

## Server

The ASP.NET Core + PostgreSQL server in [`server/`](server/) sends the reminders while Karamel is
closed. See [`server/README.md`](server/README.md) for what it stores (as little as possible), its
API, and how to run it. It is not hosted yet, so the live site does not show the option.

## Continuous integration

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every pull request
and on every push to `main`. It does a clean `npm ci` with the Node version from `.nvmrc`, then runs
lint, typecheck, unit tests, a production build, and the Playwright tests against that build. A
failure in any step fails the check, and the Playwright report is uploaded when e2e tests fail.

A second job, **Backend**, builds the server with warnings as errors, checks formatting with
`dotnet format`, and runs its tests against a real PostgreSQL 18 service container.

`main` is protected by a repository ruleset: changes go through pull requests, and the CI check
must pass before merging.

## Hosting

The live site is hosted on [Vercel](https://vercel.com), connected to this GitHub repository:

- Every push to `main` deploys to <https://karamel-mauve.vercel.app>.
- Every pull request gets its own preview link, for example to try a change on a phone before
  merging.
- No secrets are needed. One optional environment variable: `KARAMEL_API_URL`, the push server's
  origin (for example `https://api.example.com`; `https` only, plain `http` only for `localhost`).
  It is read at build time; without it, the website has no `/api` and hides the push option. An
  invalid value fails the build. It is not set yet.
- The CSP and the other headers come from `next.config.ts`, so they are the same as locally.
- No Vercel Analytics or other tracking is added.

The e2e tests were also run once against the live site (by pointing Playwright's `baseURL` at it),
and all passed, including the camera privacy test.

## Known limitations

- **Without the push option, the app must stay open.** Closing the tab (or the installed app's
  window) stops the reminders; a minimized window keeps working. With
  [reminders while closed](#reminders-while-karamel-is-closed) on, the server sends them instead,
  but the live site has no server yet.
- **Reminders while closed are not tested on a real phone yet.** The browser side is tested with
  fakes, the full chain to the database with a stand-in subscription, and the server's messages
  against the RFCs, but no real push service has delivered one. That is the next step.
- **Only reminders, not slouch alerts, work while closed.** The camera only runs while Karamel is
  open anyway.
- **When Karamel is open, a push can still sound twice on some systems.** The same tag makes the
  push replace the page's notification instead of adding a second one, but whether the
  replacement makes a sound again depends on the system.
- **Background tabs can be up to about a minute late.** Browsers throttle timers in background
  tabs. The reminder fires on the next allowed tick, or right away when you return to the tab.
  With short intervals such as 30 seconds, this means a background tab may remind you about once a
  minute instead of every 30 seconds.
- **Mobile is not tested on a real device.** The Android notification fallback is tested with a
  fake service worker, and installing was checked with Chrome's installability check on desktop,
  not on a phone or iPhone. Phones also pause background pages much more than desktops, so
  without the push option, reminders on a phone are only reliable while Karamel is on screen.
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
- **The host sees normal page requests.** Like any website, Vercel receives your IP address and
  which files your browser loads (the page, scripts, the model). Your reminders, settings, and
  camera images never leave your device. After the first visit, the installed app loads from its
  saved copy when offline.
- **The CSP allows inline scripts** (`'unsafe-inline'`). Nonces would be stricter, but they need
  per-request rendering, and the page is static. The app shows no user-generated content, so the
  XSS risk this leaves is small.
- **The camera needs HTTPS** (or localhost), like every browser camera API.

## Third-party components

- [MediaPipe Tasks Vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) and the Pose
  Landmarker model, by Google, under the Apache License 2.0.
