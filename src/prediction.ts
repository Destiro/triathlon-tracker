import { Activity } from './activities';
import { addDays, fromKey, toKey } from './dates';
import { Sport } from './plan/types';

// How the prediction is made. Each of these is a judgement call, so they live here where they are easy to change.

/** Only training from this many days back counts: older sessions say less about where you are now. */
export const WINDOW_DAYS = 42;
/** Each leg is predicted from this many of the best recent sessions. */
const BEST_COUNT = 3;
/** The shortest swim, ride and run that says something about racing: short sessions are drills and easy spins. */
export const MIN_SWIM_M = 1000;
export const MIN_RIDE_M = 15000;
export const MIN_RIDE_S = 45 * 60;
export const MIN_RUN_M = 4000;
/** Pool swims are slower to translate to open water: no wall to push off, sighting, and chop. */
export const OPEN_WATER_SLOWDOWN = 1.1;
/** Time in transition, which depends on the course and on you. Typical for a 70.3. */
export const T1_SECONDS = 5 * 60;
export const T2_SECONDS = 3 * 60;

/** Race distances in metres. */
export interface RaceDistances {
  swim: number;
  bike: number;
  run: number;
}

export interface LegPrediction {
  sport: Sport;
  /** Metres per second the race is predicted at, or null when there is no recent training to go on. */
  speed: number | null;
  seconds: number | null;
  /** How many recent sessions were long enough to count. */
  sessions: number;
  /** What the figure comes from, or what is missing. */
  basedOn: string;
}

/** How much to trust the total: more recent sessions on every leg means a tighter range. */
export type Confidence = 'rough' | 'fair' | 'good';

/** How far either side of the predicted total the range reaches. */
const RANGE: Record<Confidence, number> = { rough: 0.12, fair: 0.07, good: 0.04 };

export interface RacePrediction {
  swim: LegPrediction;
  bike: LegPrediction;
  run: LegPrediction;
  t1: number;
  t2: number;
  /** Null until all three legs have something to go on. */
  total: number | null;
  low: number | null;
  high: number | null;
  confidence: Confidence | null;
}

const speedOf = (a: Activity) => a.distanceM / a.movingS;
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function leg(sport: Sport, metres: number, speed: number | null, sessions: number, basedOn: string): LegPrediction {
  return { sport, speed, seconds: speed ? metres / speed : null, sessions, basedOn };
}

/**
 * Predicts the race from the last six weeks of training.
 *
 * - Swim: the average of your three fastest swims over 1 km. Open water swims are used as they are; if there are none,
 *   pool swims are slowed by 10%.
 * - Bike: the average speed of your three longest rides (at least 15 km and 45 minutes). Hills move this a lot, since
 *   there is no power meter to say how hard you worked.
 * - Run: the average pace of your three longest runs (at least 4 km), taken as the pace you can hold off the bike.
 * - Transitions are fixed at typical times.
 *
 * It does not know your race-day effort, the course, or how your fitness will change. It reads slow early in the plan
 * and tightens as the sessions get longer.
 */
export function predictRace(activities: Activity[], todayKey: string, race: RaceDistances): RacePrediction {
  const from = toKey(addDays(fromKey(todayKey), -WINDOW_DAYS));
  const recent = activities.filter((a) => a.date >= from && a.date <= todayKey && a.distanceM > 0 && a.movingS > 0);
  const best = (list: Activity[], by: (a: Activity) => number) => [...list].sort((a, b) => by(b) - by(a)).slice(0, BEST_COUNT);

  // Swim
  const swims = recent.filter((a) => a.sport === 'swim' && a.distanceM >= MIN_SWIM_M);
  const openSwims = swims.filter((a) => a.openWater);
  let swim: LegPrediction;
  if (swims.length === 0) {
    swim = leg('swim', race.swim, null, 0, `Needs a swim of ${MIN_SWIM_M / 1000} km or more in the last 6 weeks.`);
  } else if (openSwims.length > 0) {
    const top = best(openSwims, speedOf);
    swim = leg('swim', race.swim, mean(top.map(speedOf)), openSwims.length, `Average pace of your ${plural(top.length, 'fastest open water swim')} over 1 km.`);
  } else {
    const top = best(swims, speedOf);
    swim = leg(
      'swim',
      race.swim,
      mean(top.map(speedOf)) / OPEN_WATER_SLOWDOWN,
      swims.length,
      `Average pace of your ${plural(top.length, 'fastest pool swim')} over 1 km, slowed by 10% for open water.`,
    );
  }

  // Bike
  const rides = recent.filter((a) => a.sport === 'bike' && a.distanceM >= MIN_RIDE_M && a.movingS >= MIN_RIDE_S);
  const topRides = best(rides, (a) => a.distanceM);
  const bike =
    rides.length === 0
      ? leg('bike', race.bike, null, 0, 'Needs a ride of 15 km and 45 minutes or more in the last 6 weeks.')
      : leg('bike', race.bike, mean(topRides.map(speedOf)), rides.length, `Average speed of your ${plural(topRides.length, 'longest ride')}. Hills change this a lot.`);

  // Run
  const runs = recent.filter((a) => a.sport === 'run' && a.distanceM >= MIN_RUN_M);
  const topRuns = best(runs, (a) => a.distanceM);
  const run =
    runs.length === 0
      ? leg('run', race.run, null, 0, `Needs a run of ${MIN_RUN_M / 1000} km or more in the last 6 weeks.`)
      : leg('run', race.run, mean(topRuns.map(speedOf)), runs.length, `Average pace of your ${plural(topRuns.length, 'longest run')}.`);

  const legs = [swim, bike, run];
  if (legs.some((l) => l.seconds === null)) {
    return { swim, bike, run, t1: T1_SECONDS, t2: T2_SECONDS, total: null, low: null, high: null, confidence: null };
  }

  const total = swim.seconds! + bike.seconds! + run.seconds! + T1_SECONDS + T2_SECONDS;
  const fewest = Math.min(...legs.map((l) => l.sessions));
  const confidence: Confidence = fewest >= 4 ? 'good' : fewest >= 2 ? 'fair' : 'rough';
  return { swim, bike, run, t1: T1_SECONDS, t2: T2_SECONDS, total, low: total * (1 - RANGE[confidence]), high: total * (1 + RANGE[confidence]), confidence };
}
