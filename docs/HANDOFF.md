# Handoff: where this project is

Written at the end of the first session so a new one can carry on without the chat history.
Start a new session with: "Read docs/HANDOFF.md, then let's continue."

## What the app is

A personal Android app (Expo SDK 58, React Native, TypeScript, Expo Router) that follows one person's 70.3 training
plan and tracks it automatically. The owner loves stats, and **does not want to press start or stop in the app**.

```
Galaxy Watch 6 Classic -> Samsung Health -> Strava (automatic) -> this app (Strava API)
```

- Phone: Samsung Galaxy S24 (Android only). No bike power meter or sensors; wrist heart rate only.
- Race: **Ironman 70.3 New Zealand, Friday 5 March 2027.**
- Plan: Triathlete's "20-Week Training Plan for Your First 70.3 Triathlon" (Matt Fitzgerald). The owner started
  **Monday 19 October 2026**, so Monday 26 October was week 2. The page is behind a login, so the plan was
  entered from a PDF the owner supplied. The PDF is not in the repo; the plan lives in `src/plan/data.ts`.
- Look: white background, one colour per sport (swim blue, bike amber, run green, brick orange, race red),
  card layouts, bottom tabs. The owner likes this and asked to keep it. Colours are in `src/theme.ts`.

## State of the work

Branch `restart/strava-plan` in this repo, **not yet committed**. `main` still has the earlier version of the app
(GPS recording, manual logging, its own plan generator), kept in git history. The new branch removes all of that.
`npm run check` passes (typecheck, lint, 37 tests) and `npx expo export --platform android` builds. It has **not
been run on a phone**, and **Strava has never been connected**: the Strava app and the Worker are not set up yet.

Built (v1):
- **Today** (`src/app/(tabs)/index.tsx`): days to race, today's workouts, week strip, this week's volume per sport.
- **Plan** (`plan.tsx`): all 20 weeks on real dates; **day detail** (`src/app/day/[date].tsx`).
- **Stats** (`stats.tsx`): weekly planned vs done per sport, fitness / fatigue / form, run and bike efficiency,
  totals, best efforts.
- **Settings** (`settings.tsx`): Strava connect and sync, race name and date, week 1 start, max and resting HR.
- **Matching** (`src/matching.ts`): a workout is done at 80% of its planned time (swims: distance), partly done
  below that, missed once its day passes. A brick takes the ride and the run. Swims split in two are summed.
- **Worker** (`worker/`): Cloudflare Worker that does the Strava sign-in and token refresh so the client secret
  stays off the phone. Routes: `/strava/connect`, `/strava/callback`, `/strava/refresh`, `/health`.

## Decisions worth knowing

- **Race week** is counted back from the real race day (`src/plan/schedule.ts`), not forward from week 1. The race
  is a Friday but the plan assumes a Sunday, so race week replaces Saturday and Sunday of week 19. The owner has
  not explicitly approved this.
- **Swims** are written in yards on the page and stored as the same number in metres.
- **Training load** is Banister TRIMP from average heart rate; fitness is a 42-day average, fatigue 7-day. Without
  heart rate it falls back to 1.2 per minute. Max HR defaults to 190, resting to 55: the owner should set theirs.
- **Sync** runs on app open and pull-to-refresh, with a 3-day overlap. First sync reaches back to a week before
  week 1. Strava scope is `read,activity:read_all`.
- **Colours** (blue, amber, green) pass the colour-blind validator only with warnings: green and amber are close
  for red-green colour-blind viewers, and blue and amber are pale on white. So charts must always carry a label or
  icon next to colour. Keep that if charts change.
- The Worker only redirects tokens to `triathlontracker://` or `exp://` addresses.
- `AGENTS.md` applies: use Expo Router, `npx expo install` for packages, check Expo docs for SDK 58 rather than
  trusting memory, run typecheck and lint before calling anything done.

## Known gaps in the source plan

The plan page seems to disagree with its own description in a few weeks. It was entered as written, nothing
invented. Check against the page if the owner asks:
- Week 1 lists two swims, but the page's summary says 3,900 yards (which needs a third swim, roughly 1,500).
- Week 5 lists four rides and no Sunday swim (the Sunday left cell reads "Foundation Bike: 90 Minutes").
- Week 7 has no Sunday run, although odd weeks are described as having three runs.
- The page's week 17 summary says 5 h 20 riding and 3 h 07 running; the listed sessions add up to 5 h 35 and
  3 h 01. The week 17 swim total (6,700) does match.

## What is left to do

1. Commit the branch (the owner has not been asked yet), then open a PR if wanted.
2. Strava setup, as in the README: create the API app, set the callback domain to the Worker host, then
   `wrangler secret put` the id and secret and `wrangler deploy`. The Worker is `triathlon-tracker-api`; the
   default URL in `src/strava.ts` assumes the `connordebruyn234.workers.dev` account. Needs the owner's login, so
   it has not been done.
3. Run it on the S24 and fix what looks wrong. Charts and screens were never seen rendered.
4. Add screen smoke tests (the old repo had some with Testing Library; the new screens have none).

## Ideas proposed but not decided

The owner was sent a longer feature list and has not said which they want beyond what is built. Still open:
sleep, resting HR and HRV from Android Health Connect; Strava webhooks for instant sync; a 1-10 effort rating and
note after each workout; fuelling log for long sessions; gear (shoe and bike) distance from Strava; moving a
workout to another day; brick analysis (off-the-bike run pace against fresh); a race split predictor; a Sunday
weekly summary. Ask before building any of them.

## Not part of this repo

A separate project, `meal-planner` (next to this folder), is the owner's meal planning app. It was briefly changed
by mistake early in the session and was fully restored. Leave it alone.
