# Triathlon Tracker

An Android app (Expo, React Native, TypeScript) that follows a 70.3 training plan and tracks it for you.
There are no start or stop buttons: your watch records the workout, Samsung Health shares it with Health Connect,
and the app reads it from there and ticks the plan off by itself. Sleep, VO2 max and recovery come the same way.

```
Galaxy Watch → Samsung Health → Health Connect → this app
```

Workouts used to come through Strava. The ones saved from Strava before the switch (from 12 October 2026) stay in
the app as they were; Strava is no longer used for anything.

The plan is Triathlete's [20-week plan for your first 70.3](https://www.triathlete.com/training/20-week-training-plan-first-70-3-triathlon/)
(Matt Fitzgerald), entered week by week in `src/plan/data.ts`. Swim distances are written in yards on the page
and shown in metres here, rounded to the nearest 25 m (1,450 yd → 1,325 m). Short reps keep their numbers, as they would in a metre pool.

## What it does

Five tabs: Today, Plan, Stats, Race and Coach. Settings opens from the cog at the top right of Today. Each page is one
scrolling list of cards; Stats and Race have a row of buttons at the top for their pages, and nothing below that
hides a card behind another button (`docs/decisions/0008-scrolling-pages.md`).

- **Today**: days to the race, then one page. It lists every workout for the day, one line each; the first one
  still to do is open, with its warm-up, main set and cool-down, what the watch recorded and a row to move it, and
  tapping another opens that one instead. On a rest day it points to the next workout. The This week card, last, has
  the week strip and this week's swim, bike and run against the plan. Refresh reads Health Connect again.
- **Plan**: a month calendar with its colour key under it. Each day has a dot per workout in its sport's colour, solid
  once done. Each week shows its planned hours, and finished weeks fade. Tap a day to see its workouts underneath, on
  the same scrolling page, or open it to move a
  workout or see what the watch recorded.
- **Race**: three pages. Race day: the countdown, the predicted finish with how to pace each leg.
  Ready?: the road through the plan phases, distance readiness and form on race day. Checklist. The
  prediction uses your last six weeks: the swim is the average of your three fastest swims over 1 km (pool swims
  are slowed 10% for open water; open water swims are used as they are), the bike is the average speed of your
  three longest rides (15 km and 45 minutes or more), the run is the average pace of your three longest runs (4 km
  or more), and the transitions are fixed at 5 and 3 minutes. The range around it is 4%, 7% or 12% depending on
  how many recent sessions it has to go on. It knows nothing about race-day effort, the course or the weather, and
  hills skew the bike speed because there is no power meter. It reads slow early in the plan. All the numbers are
  named constants at the top of src/prediction.ts.
- **Coach**: a chat with Claude about your plan, training, sleep and recovery, using your own Anthropic API key (kept in
  the phone's secure storage). It looks things up rather than guessing, and when it wants to move a workout or add or
  remove one of your own sessions, save a note on a workout (effort, feel, fuelling) or log or clear an injury or
  illness, it shows a card: nothing changes until you tap Apply. It reads your notes and injury log too. Choose the model in Settings.
  Your messages and what it looks up are sent to Anthropic. See `docs/decisions/0009-coach-calls-claude-directly.md`.
  Its answers are tested against set conversations with `npm run eval` (see `evals/README.md`).
- **Pacing plan**: the predicted pace for each leg, with a heart rate ceiling for the bike (80% of max) and run (85%),
  and the first 5 km of the run held back 10 seconds a km. The numbers are constants at the top of `src/pacing.ts`.
- **Form on race day**: fitness and fatigue carried forward through the rest of the plan, counting each planned workout
  at the load you usually produce for that sport. It changes when you move, skip or add sessions.
- **Race checklist**: a 70.3 list for bags, bike and race morning, with room for your own items. Ticks are saved on the
  phone.
- **Heart rate zones**: each recorded workout shows its time in five zones, worked out from the watch's heart rate
  readings (about one a second) and your max heart rate (Settings): zone 1 is
  under 60% of max, then 70%, 80% and 90%. Workouts that ask for one effort all the way through (foundation, long,
  recovery and brick sessions) are checked against it: "moderate aerobic" is zones 2 to 3, "low aerobic" 1 to 2,
  "recovery" 1, and 70% of the time in range counts as on target. Intervals are not checked. To change what the
  plan's words mean, edit `INTENSITY_ZONES` in `src/zones.ts`; the zone boundaries are `ZONE_STARTS`.
- **Weather** (Plan): set your town in Settings and the Plan calendar shows an icon and the high on each of the next
  16 days. Tap a day with a ride, run or brick and it says "Good outside" or "Think indoor" with the reason: rain more
  than 40% likely, wind over 30 km/h, or thunderstorms. Set an ocean swim beach as well and a day with a swim gets sea
  temperature, waves and a wetsuit call ("Think pool" when waves top 1 m, wind tops 30 km/h or there is lightning; rain
  doesn't count in the water). The limits are in Settings. The forecast comes from [Open-Meteo](https://open-meteo.com),
  which is free and needs no account or key; the app sends it only the latitude and longitude of the places you set, and
  keeps the answer for 3 hours. The sea forecast reaches about 8 days, the weather 16. Lakes have no sea data. Tides aren't
  available.
- **Pool or open water**: Samsung Health records pool and open-water swims as different exercise types. Tap the tag
  on a swim to correct it. Stats compares the pace of each.
- **Personal bests**: a card on Today when a workout in the last two days beat your previous best, for example
  longest ride or fastest 5 km.
- **Editing the plan**: on a day, move a workout to another day, or put it back. Add your own sessions, such as
  gym, once or every week until the race. Your changes are saved apart from the plan, so the plan itself is
  never altered. The watch ticks a moved workout off on its new day. Strength training, weightlifting,
  calisthenics and HIIT count as gym, from the watch or a gym app such as Hevy; they tick off a gym session, count
  in training load and show in the totals.
- **Stats** (three pages, with a button for each card on them): Progress has this month so far against the same days of last month, weekly volume
  (planned against done, one chart with Swim / Bike / Run buttons), time in each heart rate zone by week (and the
  share that was easy; 80/20 plans aim for 80%), fitness and form from heart rate, efficiency for runs and rides, heart
  rate drift on long sessions and calories by sport. Records has best efforts, totals and pool against open water. Health has last
  night's sleep, today's readiness and its two-week trend, sleep history, recovery (overnight heart rate and HRV), VO2 max, and
  weight, body fat, blood oxygen and breathing when the watch shares them.
- **Readiness** (Stats → Health): one score out of 100 from last night's sleep (40%), sleeping heart rate against your
  30-day usual (30%) and HRV against its usual (30%). Sleep scores 0 at 4 hours and 100 at 7.5. A part with nothing to
  compare with is left out and the card says so. 70 and over is good to go, 45 to 69 take it steady, below that go
  easy. The weights and limits are named constants at the top of `src/health/readiness.ts`.
- **Heart rate drift**: for rides and runs over 40 minutes, the average heart rate and speed in the first and second
  half, after a 10 minute warm-up. Drift is how much more heart rate the same speed took in the second half. Under
  5% is good. Only workouts read from Health Connect have it.
- **Notes on workouts**: open a workout you have done and tap "Add how it went": effort from 1 to 10, how you felt, what
  you ate and drank (carbs, fluid, sodium, caffeine, and what it was) and a few words. The note shows on the workout, with
  the session load (effort x minutes), and is saved on the phone separately from what the watch recorded, so reading
  Health Connect never touches it. It is part of the backup.
- **Injury and illness**: Stats → Health → Injury / illness. Log what it is, how bad, and when it started; mark it cleared
  or reopen it. While one is on, Today shows a reminder. These are in the backup too.
- **Settings**: connect Health Connect, back up or restore your history, the race and its date, when week 1
  starts, and your max and resting heart rate.

A workout counts as done at 80% of its planned time (or swim distance), as partly done below that, and as missed
once its day has passed. A brick takes the ride and the run; a swim recorded in two parts is added up.
Anything the watch recorded that the plan did not ask for shows as "Not in the plan".

## Run it

Needs Node 22 or newer (Expo SDK 58).

    npm install
    npx expo start

Health Connect needs a development or preview build, not Expo Go: `npm run build:android` makes an APK with EAS.
From the phone: GitHub app > Actions > Android build > Run workflow; the run's summary links to the build and its
APK. That workflow needs an `EXPO_TOKEN` repository secret (an access token from expo.dev).
Without Health Connect connected the app shows the plan and an empty stats page.

## Workouts from Health Connect

Settings → Connect Health Connect asks to read exercise, distance, speed, elevation, heart rate, sleep, VO2 max,
resting heart rate and HRV, and data older than 30 days. Without that last one Health Connect only hands over the
30 days before access was first granted; Settings says so.

- Each read takes the workouts since the last full read (the first goes back to a week before week 1), less any
  already saved. Each new workout costs four requests, so if Health Connect asks the app to slow down, reading
  stops and the rest follow on the next pull-down.
- Walks are left out; the watch logs them all day. Exercise types the plan doesn't use are kept as "other".
- Moving time is not in Health Connect, so it is the distance over the average speed while moving.
- Samsung Health writes no elevation, so climbing is 0 on new workouts.
- Calories are read for each workout. When the reader learns something new (the `READ_VERSION` in
  `src/health/workouts.ts`), workouts saved by the older reader are read again the next time the app syncs.
- Weight, body fat, lean mass, blood oxygen and breathing rate are asked for too. The watch may not share them; Settings
  lists what has come through ("none yet" for what hasn't) and the Stats cards only appear when there is data.

## Keeping your history

Everything the app has is stored only on the phone. That includes the workouts saved from Strava, which the app no longer
fetches. Settings → Back up now writes everything to one file and opens the share sheet; save it to Google
Drive. Restore from a backup adds back whatever the phone is missing and removes nothing.

Nothing in the app deletes workouts: "Stop reading" only stops new ones coming in.

## Development

    npm run check       # typecheck + lint + tests (what CI runs)
    npm run typecheck
    npm run lint
    npm test

## Structure

- `src/app/` – screens (Expo Router): `(tabs)/` for Today, Plan, Stats, Race and Settings (Settings is not a tab), `day/[date]` for one day
- `src/plan/` – the plan as data, and `schedule.ts`, which lays it on the calendar and fits race week to the race date
- `src/prediction.ts` – the predicted race finish
- `src/zones.ts` – heart rate zones, and how the plan's effort words map to them
- `src/matching.ts` – pairs planned workouts with what the watch recorded
- `src/stats.ts` – weekly volume, compliance, training load, efficiency and best efforts
- `src/activities.ts` – the app's own workout record
- `src/health/` – Health Connect: reading (`connect.ts`), workouts (`workouts.ts`), sleep and recovery (`summary.ts`)
- `src/backup.ts`, `src/backupFile.ts` – the backup file, and saving and picking it on the phone
- `src/store.tsx` – settings, workouts and health, saved on the phone
- `src/theme.ts` – colours (one per sport), spacing, text styles
- `src/components/` – shared UI: cards and buttons, charts, workout cards
