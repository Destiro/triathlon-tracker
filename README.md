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

- **Today**: days to the race, today's workouts with their warm-up, main set and cool-down, whether each is
  done, a week strip, and this week's swim, bike and run against the plan.
- **Plan**: a month calendar. Each day has a dot per workout in its sport's colour, solid once done. Each week
  shows its planned hours, and finished weeks fade. Tap a day to see its workouts underneath, or open it to move a
  workout or see what the watch recorded.
- **Editing the plan**: on a day, move a workout to another day, or put it back. Add your own sessions, such as
  gym, once or every week until the race. Your changes are saved apart from the plan, so the plan itself is
  never altered. The watch ticks a moved workout off on its new day. Strength activities from Strava (weight
  training, workout, crossfit, HIIT) count as gym; they tick off a gym session, count in training load and show
  in the totals.
- **Stats**: weekly volume per sport (planned against done), fitness / fatigue / form from heart rate, aerobic
  efficiency for runs and rides, totals and best efforts.
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
- `src/matching.ts` – pairs planned workouts with what the watch recorded
- `src/stats.ts` – weekly volume, compliance, training load, efficiency and best efforts
- `src/activities.ts`, `src/strava.ts` – turning Strava activities into the app's own, sign-in and syncing
- `src/store.tsx` – settings and synced activities, saved on the phone
- `src/theme.ts` – colours (one per sport), spacing, text styles
- `src/components/` – shared UI: cards and buttons, charts, workout cards
- `worker/` – the Cloudflare Worker for Strava sign-in
