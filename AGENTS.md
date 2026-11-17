This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## This project

A personal Android app that follows one person's 70.3 training plan. Workouts, sleep and heart rate come from Health
Connect (Galaxy Watch → Samsung Health → Health Connect). Everything is stored on the phone; there is no server.
Why it is built this way: `docs/decisions/`. Where the project stood at the start: `docs/HANDOFF.md`.

### Commands

`just` runs the same npm scripts below (`just --list`). Run `just check` before calling a task done.

| Task | Command |
| --- | --- |
| Install | `npm ci` |
| Dev server | `npm start` |
| Typecheck, lint, test together | `npm run check` |
| One test file | `npx jest src/__tests__/plan.screen.test.tsx` |
| Build the Android JS bundle (what CI does) | `npx expo export --platform android` |
| Installable APK on EAS | `npm run build:android` (needs the work committed first) |

Health Connect is native code, so it does not run in Expo Go. Use a development or preview build.

### Style

- TypeScript, strict. Logic lives in plain modules under `src/` (`stats.ts`, `matching.ts`, `prediction.ts`, `plan/`,
  `health/summary.ts`) and is unit tested; screens in `src/app/` and `src/components/` only draw it.
- Every new screen or component needs a test that renders it (see `src/__tests__/screens.test.tsx`: the store is
  faked, icons and safe-area are mocked). Pure logic gets a `*.test.ts`.
- Colours, spacing and type come from `src/theme.ts`; never hard-code them in a screen. Never use colour alone to carry
  meaning: add a label or icon (the colours are not safe for red-green colour blindness).
- Errors a person might see are small `Error` subclasses (`WeatherError`, `BackupError`) whose message is written for
  them. Reading from the phone or network must fail quietly, never crash a screen.
- Nothing saved is ever dropped by a sync. New data is merged in; see `mergeActivities` and `mergeHealth`.
- Comments say why, not what. Copy for the app is plain and short, in sentence case.

### Git

- One GitHub issue at a time, on a branch named for it: `feature/<topic>` (or `fix/<topic>`).
- Merge into `main` with a merge commit (`git merge --no-ff`) titled `Merge feature/<topic>: <what changed>`, then push.
- CI runs on every push. Do not merge a branch with a red run.
- Commit messages: a short summary line, a paragraph on what and why, and the `Co-Authored-By` trailer.
