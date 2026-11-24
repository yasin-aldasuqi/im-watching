# I'm Watching 🐈

[![CI](https://github.com/yasin-aldasuqi/im-watching/actions/workflows/ci.yml/badge.svg)](https://github.com/yasin-aldasuqi/im-watching/actions/workflows/ci.yml)

Your posture buddy. Camera is optional and never leaves your device.

**I'm Watching** is a small web app where a little orange Siberian kitten keeps an eye on you
and gently reminds you to fix how you're sitting and straighten your back.

> Status: early development. The home page shows the kitten mascot (it blinks and sways its tail).
> Posture reminders and the optional camera are not built yet.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) with TypeScript
- Tailwind CSS
- ESLint

## Getting started

Requirements: Node.js (version in `.nvmrc`) and npm.

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

Other scripts:

| Command         | What it does                       |
| --------------- | ---------------------------------- |
| `npm run dev`   | Start the development server       |
| `npm run build` | Build the app for production       |
| `npm run start` | Serve the production build         |
| `npm run lint`  | Check the code with ESLint         |
| `npm run typecheck` | Check TypeScript types         |

## Continuous integration

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every pull request
and on every push to `main`. It does a clean `npm ci` with the Node version from `.nvmrc`, then runs
lint, typecheck, and a production build. A failure in any step fails the check.

There are no automated tests yet, so CI does not check behavior.
