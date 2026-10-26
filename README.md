# Triathlon Tracker

A training app for triathletes, built with Expo (React Native + TypeScript) for Android. Record swims, rides
and runs live, keep a training log, plan towards a race and see how your fitness is building.

## Features

**Track (live recording)**
- Run and ride with GPS: distance, average and current pace or speed, km splits, climbing and your route drawn
  as you go. GPS warms up while you choose, with an accuracy readout.
- Pool swims: a big tap-per-length button (with undo) that uses your pool length.
- Strength sessions: a timer.
- Brick (bike, transition, run) and full triathlon race mode (swim, T1, bike, T2, run), timing every leg and
  transition with one "next" button.
- Pause, resume, finish and discard. The screen stays on while recording, and a buzz marks each kilometre,
  each length and each new leg.
- Crash-safe: a session in progress is saved as it goes and comes back (paused) if the app closes.
- Finished workouts are saved immediately, then a review form takes effort, heart rate, gear and notes.

**Log**
- Every workout grouped by week with weekly totals, filters per sport and for bricks/races.
- Detail page with route map, splits, legs, training stress, heart-rate zone, gear and notes.
- Add any session by hand, including bricks leg by leg, and edit or delete anything.
- A message when a workout sets a personal best.

**Plan**
- Races (Sprint, Olympic, 70.3, Ironman or custom) with countdowns.
- A finish-time prediction leg by leg from your best recent efforts (Riegel's formula), compared with your
  goal, and the pace or speed to hold on each leg to hit it.
- A periodised training plan built for your race and available hours: base, build, peak and taper phases,
  a lighter week every fourth week, six sessions a week with a rest day, bricks from the build phase and
  optional strength. Each session explains the workout, can be started on the Track tab or logged, and is
  ticked off automatically when you log a matching workout.

**Today**
- Next race, today's planned session, this week's time per sport against your target, sessions and streak,
  current form with plain-words advice, quick starts and recent workouts.

**Stats**
- Weekly volume by sport against your target (6 weeks to 6 months).
- Fitness, fatigue and form over 90 days (the standard training-load model, scored from heart rate when you
  give your max HR, otherwise from your effort rating).
- Personal bests (5 km, 10 km, half marathon, 400 m and 1500 m swims, 40 km ride, longest of each).
- Lifetime totals per sport, gear wear with replacement warnings, and heart-rate zones.

**Settings**
- Name, km or miles, pool length (25 m, 50 m, 25 yd, 33 m), weekly target, max and resting heart rate
  (with an estimate from age).
- Sample data to try the app with, backup export and restore, and delete all.

## Run it

You need Node 22 or newer (this project uses Expo SDK 58).

    npm install
    npx expo start

Scan the QR code with Expo Go (SDK 58) on your phone. Everything works in Expo Go, including GPS.

To try it without logging anything first: Today → Explore with sample data (or Settings → Add sample data).

## Install it on your phone

Build an APK with EAS (free Expo account needed):

    npx eas-cli@latest login
    npm run build:android

The first build asks to create the EAS project; say yes. When it finishes, open the link on your phone and
install the APK. Each preview build gets a higher version number, so new builds install over old ones and
keep your data.

## Good to know

- **GPS only records while the app is on screen.** The screen stays on during a workout, but if you lock the
  phone or switch apps, Android stops sending location to the app. The time keeps counting, and the gap is
  filled with a straight line when you come back. Recording in the background needs a native foreground
  service, which is a possible next step for an installed build.
- **No map tiles.** Routes are drawn as a line (north up) rather than on a street map, so no map API key is
  needed.
- **Open-water swims** in race mode are timed only; enter the distance afterwards if you want it.
- **Heart rate** is entered by hand; there is no watch or chest-strap connection.
- **Your data stays on your phone.** Use Settings → Export backup to keep a copy.

## Development

    npm run check        # typecheck + lint + tests (what CI runs)
    npm test

- `App.tsx`: the five tabs
- `src/screens/`: Today, Track, Log, Plan, Stats and Settings
- `src/components/`: shared building blocks, charts, workout and race pages
- `src/lib/`: all the calculations, with no UI, each covered by tests:
  `format` (units), `geo` (GPS maths), `session` (live recording), `load` (fitness/fatigue/form),
  `races` (prediction), `plan` (plan generator), `stats`, `gear`, `zones`, `migrate` (saved data versions),
  `sample`
- `src/__tests__/`: unit tests for `src/lib` and smoke tests that drive the whole app

GitHub Actions run typecheck, lint, tests and an Android bundle build on every push and pull request.
