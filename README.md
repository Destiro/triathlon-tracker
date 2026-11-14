# Triathlon Tracker

An Android app (Expo, React Native, TypeScript) that follows a 70.3 training plan and tracks it for you.
There are no start or stop buttons: your watch records the workout, Strava receives it, and the app pulls it in
and ticks the plan off by itself.

```
Galaxy Watch → Samsung Health → Strava → this app
```

The plan is Triathlete's [20-week plan for your first 70.3](https://www.triathlete.com/training/20-week-training-plan-first-70-3-triathlon/)
(Matt Fitzgerald), entered week by week in `src/plan/data.ts`. Swim distances are written in yards on the page
and kept here as the same number in metres.

## What it does

- **Today**: days to the race, then every workout for the day at once, each with its warm-up, main set and
  cool-down, whether it is done, what the watch recorded, and a row to move it. On a rest day it points to the next
  workout. Below that, a week strip and this week's swim, bike and run against the plan.
- **Plan**: a month calendar. Each day has a dot per workout in its sport's colour, solid once done. Each week
  shows its planned hours, and finished weeks fade. Tap a day to see its workouts underneath, or open it to move a
  workout or see what the watch recorded.
- **Race**: the countdown, the course, the road through the plan phases, race week, and a predicted finish. The
  prediction uses your last six weeks: the swim is the average of your three fastest swims over 1 km (pool swims
  are slowed 10% for open water; open water swims are used as they are), the bike is the average speed of your
  three longest rides (15 km and 45 minutes or more), the run is the average pace of your three longest runs (4 km
  or more), and the transitions are fixed at 5 and 3 minutes. The range around it is 4%, 7% or 12% depending on
  how many recent sessions it has to go on. It knows nothing about race-day effort, the course or the weather, and
  hills skew the bike speed because there is no power meter. It reads slow early in the plan. All the numbers are
  named constants at the top of src/prediction.ts.
- **Heart rate zones**: each recorded workout shows its time in five zones. Strava's own zones are for subscribers
  only, so the app reads the heart rate stream and works zones out from your max heart rate (Settings): zone 1 is
  under 60% of max, then 70%, 80% and 90%. Workouts that ask for one effort all the way through (foundation, long,
  recovery and brick sessions) are checked against it: "moderate aerobic" is zones 2 to 3, "low aerobic" 1 to 2,
  "recovery" 1, and 70% of the time in range counts as on target. Intervals are not checked. To change what the
  plan's words mean, edit `INTENSITY_ZONES` in `src/zones.ts`; the zone boundaries are `ZONE_STARTS`. The
  stream is one Strava request per workout, so each sync fetches the newest 15 and the rest follow later.
- **Pool or open water**: a swim with a GPS start is open water, one without is a pool. Tap the tag on a swim to
  correct it. Stats compares the pace of each.
- **Personal bests**: a card on Today when a workout in the last two days beat your previous best, for example
  longest ride or fastest 5 km.
- **Editing the plan**: on a day, move a workout to another day, or put it back. Add your own sessions, such as
  gym, once or every week until the race. Your changes are saved apart from the plan, so the plan itself is
  never altered. The watch ticks a moved workout off on its new day. Strength activities from Strava (weight
  training, workout, crossfit, HIIT) count as gym; they tick off a gym session, count in training load and show
  in the totals.
- **Stats**: weekly volume per sport (planned against done), fitness / fatigue / form from heart rate, aerobic
  efficiency for runs and rides, totals and best efforts.
- **Health Connect check** (Settings): a diagnostic screen that asks for read access to Health Connect and lists what
  your watch writes there: each recent workout with its distance, heart rate, speed and calories, plus sleep and
  other health data. It changes nothing else; the app still gets its workouts from Strava for now.
- **Settings**: connect Strava, the race and its date, when week 1 starts, and your max and resting heart rate.

A workout counts as done at 80% of its planned time (or swim distance), as partly done below that, and as missed
once its day has passed. A brick takes the ride and the run; a swim recorded in two parts is added up.
Anything the watch recorded that the plan did not ask for shows as "Not in the plan".

## Run it

Needs Node 22 or newer (Expo SDK 58).

    npm install
    npx expo start

Scan the QR code with Expo Go. Without Strava connected the app shows the plan and an empty stats page.

## Connecting Strava

Strava's sign-in needs a client secret, which must not ship inside an app. A small Cloudflare Worker in
`worker/` holds it, handles sign-in and token renewal, and nothing else. The app talks to Strava directly for
your activities.

One time:

1. At <https://www.strava.com/settings/api> create an application. Set **Authorization Callback Domain** to the
   Worker's host, for example `triathlon-tracker-api.<your-name>.workers.dev` (no `https://`).
2. Deploy the Worker (needs Node 22):

       cd worker
       npm install
       npx wrangler login
       npx wrangler secret put STRAVA_CLIENT_ID
       npx wrangler secret put STRAVA_CLIENT_SECRET
       npx wrangler deploy

   `deploy` prints the Worker's address. Check `<address>/health` says `ok`.
3. If the address differs from the default in `src/strava.ts`, set `EXPO_PUBLIC_API_URL` to it.
4. In the app: Settings → Connect Strava. Tick "View data about your activities" on Strava's page.

The Worker only sends tokens back to this app's own address (`triathlontracker://` or Expo Go's `exp://`).
Tokens are kept in the phone's secure storage.

## Development

    npm run check       # typecheck + lint + tests (what CI runs)
    npm run typecheck
    npm run lint
    npm test

## Structure

- `src/app/` – screens (Expo Router): `(tabs)/` for Today, Plan, Stats and Settings, `day/[date]` for one day
- `src/plan/` – the plan as data, and `schedule.ts`, which lays it on the calendar and fits race week to the race date
- `src/prediction.ts` – the predicted race finish
- `src/zones.ts` – heart rate zones, and how the plan's effort words map to them
- `src/matching.ts` – pairs planned workouts with what the watch recorded
- `src/stats.ts` – weekly volume, compliance, training load, efficiency and best efforts
- `src/activities.ts`, `src/strava.ts` – turning Strava activities into the app's own, sign-in and syncing
- `src/store.tsx` – settings and synced activities, saved on the phone
- `src/theme.ts` – colours (one per sport), spacing, text styles
- `src/components/` – shared UI: cards and buttons, charts, workout cards
- `worker/` – the Cloudflare Worker for Strava sign-in
