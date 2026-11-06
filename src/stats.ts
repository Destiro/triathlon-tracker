import { Activity } from './activities';
import { addDays, fromKey, toKey } from './dates';
import { DayResult, matchDay, statusScore, WorkoutResult } from './matching';
import { daysOfWeek, Schedule } from './plan/schedule';
import { Discipline, Sport } from './plan/types';

export const SPORTS: Sport[] = ['swim', 'bike', 'run'];

/** Swims are measured in metres, rides and runs in minutes, the same way the plan writes them. */
export const unitOf = (sport: Sport): 'metres' | 'minutes' => (sport === 'swim' ? 'metres' : 'minutes');

export interface Volume {
  planned: number;
  actual: number;
}

export type WeekVolume = Record<Sport, Volume>;

const emptyVolume = (): WeekVolume => ({
  swim: { planned: 0, actual: 0 },
  bike: { planned: 0, actual: 0 },
  run: { planned: 0, actual: 0 },
});

/**
 * Planned against actual volume for one plan week. Tune-up races are planned by distance, so only their swim
 * counts towards the planned numbers; what you actually do that day still counts in full.
 */
export function weekVolume(schedule: Schedule, activitiesByDate: Map<string, Activity[]>, week: number): WeekVolume {
  const volume = emptyVolume();
  for (const day of daysOfWeek(schedule, week)) {
    for (const w of day.workouts) {
      if (w.kind === 'gym') continue;
      const legs = w.legs ?? [{ sport: w.kind as Sport, minutes: w.minutes, metres: w.metres }];
      for (const leg of legs) {
        const amount = unitOf(leg.sport) === 'metres' ? leg.metres : leg.minutes;
        volume[leg.sport].planned += amount ?? 0;
      }
    }
    for (const a of activitiesByDate.get(day.date) ?? []) {
      if (a.sport === 'other' || a.sport === 'gym') continue;
      volume[a.sport].actual += unitOf(a.sport) === 'metres' ? a.distanceM : a.movingS / 60;
    }
  }
  return volume;
}

// Swims are planned by distance. At an easy pool pace of about 2:30 per 100 m, this is how long they take.
const SWIM_MINUTES_PER_100M = 2.5;

/** Hours of training planned for one plan week, as minutes. Swims are turned into time at an easy pool pace. */
export function weekMinutes(schedule: Schedule, week: number): number {
  let minutes = 0;
  for (const day of daysOfWeek(schedule, week)) {
    for (const w of day.workouts) minutes += w.kind === 'swim' ? ((w.metres ?? 0) / 100) * SWIM_MINUTES_PER_100M : (w.minutes ?? 0);
  }
  return minutes;
}

/** Gym and strength minutes for one plan week: the sessions planned (your own) against what the watch recorded. */
export function weekGym(schedule: Schedule, activitiesByDate: Map<string, Activity[]>, week: number): Volume {
  const volume = { planned: 0, actual: 0 };
  for (const day of daysOfWeek(schedule, week)) {
    for (const w of day.workouts) if (w.kind === 'gym') volume.planned += w.minutes ?? 0;
    for (const a of activitiesByDate.get(day.date) ?? []) if (a.sport === 'gym') volume.actual += a.movingS / 60;
  }
  return volume;
}

export interface Compliance {
  /** Planned workouts whose day has passed (or that are already done). */
  due: number;
  /** Done counts 1, partly done 0.5. */
  score: number;
}

export function weekCompliance(
  schedule: Schedule,
  activitiesByDate: Map<string, Activity[]>,
  week: number,
  todayKey: string,
): Compliance {
  let due = 0;
  let score = 0;
  for (const day of daysOfWeek(schedule, week)) {
    for (const r of matchDay(day, activitiesByDate.get(day.date) ?? [], todayKey).results) {
      if (r.status === 'upcoming' || r.status === 'today') continue;
      due += 1;
      score += statusScore(r.status);
    }
  }
  return { due, score };
}

export function dayResult(schedule: Schedule, activitiesByDate: Map<string, Activity[]>, dateKey: string, todayKey: string): DayResult {
  return matchDay(schedule.get(dateKey), activitiesByDate.get(dateKey) ?? [], todayKey);
}

export interface UpNext {
  date: string;
  /** Which of that day's workouts, in plan order. */
  index: number;
  result: WorkoutResult;
}

/**
 * The workout to show first on Today: the first one today that the watch hasn't recorded yet, otherwise the
 * first one on the next day that has any. Null once the plan is over.
 */
export function upNext(schedule: Schedule, activitiesByDate: Map<string, Activity[]>, todayKey: string): UpNext | null {
  const today = dayResult(schedule, activitiesByDate, todayKey, todayKey);
  const open = today.results.findIndex((r) => r.status === 'today');
  if (open >= 0) return { date: todayKey, index: open, result: today.results[open] };

  const last = [...schedule.keys()].reduce((a, b) => (a > b ? a : b), todayKey);
  for (let d = addDays(fromKey(todayKey), 1); toKey(d) <= last; d = addDays(d, 1)) {
    const key = toKey(d);
    const r = dayResult(schedule, activitiesByDate, key, todayKey);
    if (r.results.length > 0) return { date: key, index: 0, result: r.results[0] };
  }
  return null;
}

// ---- Training load ----

export interface HeartRates {
  maxHr: number;
  restHr: number;
}

// Load for a workout with no heart rate, per minute: about what a steady aerobic session scores.
const LOAD_PER_MINUTE_WITHOUT_HR = 1.2;

/**
 * Training load (Banister TRIMP): minutes, weighted by how hard the heart was working. An hour at an easy
 * aerobic effort scores roughly 60 to 80; a hard hour well over 100.
 */
export function trainingLoad(a: Activity, hr: HeartRates): number {
  const minutes = a.movingS / 60;
  if (!a.avgHr || hr.maxHr <= hr.restHr) return minutes * LOAD_PER_MINUTE_WITHOUT_HR;
  const reserve = Math.min(Math.max((a.avgHr - hr.restHr) / (hr.maxHr - hr.restHr), 0), 1);
  return minutes * reserve * 0.64 * Math.exp(1.92 * reserve);
}

export interface LoadPoint {
  date: string;
  load: number;
  /** Long-term load: a 42-day average. Rises slowly as you get fitter. */
  fitness: number;
  /** Short-term load: a 7-day average. */
  fatigue: number;
  /** Fitness minus fatigue. Negative while training hard, positive when fresh. */
  form: number;
}

const FITNESS_DAYS = 42;
const FATIGUE_DAYS = 7;

/** Daily load and the fitness / fatigue / form curves from `startKey` to `endKey`, both included. */
export function loadSeries(activities: Activity[], startKey: string, endKey: string, hr: HeartRates): LoadPoint[] {
  const daily = new Map<string, number>();
  for (const a of activities) daily.set(a.date, (daily.get(a.date) ?? 0) + trainingLoad(a, hr));

  const points: LoadPoint[] = [];
  let fitness = 0;
  let fatigue = 0;
  for (let d = fromKey(startKey), end = fromKey(endKey); d <= end; d = addDays(d, 1)) {
    const date = toKey(d);
    const load = daily.get(date) ?? 0;
    // Form is measured going into the day, before today's training.
    const form = fitness - fatigue;
    fitness += (load - fitness) / FITNESS_DAYS;
    fatigue += (load - fatigue) / FATIGUE_DAYS;
    points.push({ date, load, fitness, fatigue, form });
  }
  return points;
}

// ---- Trends and records ----

export interface EfficiencyPoint {
  date: string;
  /** Metres covered per heartbeat. Going up means the same effort is getting you further. */
  value: number;
}

// Short or interval sessions say little about aerobic fitness.
const EFFICIENCY_MIN_SECONDS = 20 * 60;

export function efficiency(activities: Activity[], sport: 'bike' | 'run'): EfficiencyPoint[] {
  return activities
    .filter((a) => a.sport === sport && a.avgHr && a.avgSpeed > 0 && a.movingS >= EFFICIENCY_MIN_SECONDS)
    .map((a) => ({ date: a.date, value: (a.avgSpeed * 60) / a.avgHr! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface SportTotals {
  count: number;
  distanceM: number;
  movingS: number;
  elevationM: number;
}

export function totals(activities: Activity[], sinceKey: string): Record<Discipline, SportTotals> {
  const out = Object.fromEntries(
    [...SPORTS, 'gym' as const].map((s) => [s, { count: 0, distanceM: 0, movingS: 0, elevationM: 0 }]),
  ) as Record<Discipline, SportTotals>;
  for (const a of activities) {
    if (a.sport === 'other' || a.date < sinceKey) continue;
    const t = out[a.sport];
    t.count += 1;
    t.distanceM += a.distanceM;
    t.movingS += a.movingS;
    t.elevationM += a.elevationM;
  }
  return out;
}

/** What a best effort is measured by. */
export type Measure = 'distance' | 'speed' | 'climb';

export interface BestEffort {
  label: string;
  sport: Sport;
  measure: Measure;
  activity: Activity;
}

/** The kinds of best effort that are tracked. Fastest needs a decent distance so a sprint doesn't count. */
const CATEGORIES: { label: string; sport: Sport; measure: Measure; minM: number }[] = [
  { label: 'Longest swim', sport: 'swim', measure: 'distance', minM: 0 },
  { label: 'Fastest swim pace (1 km+)', sport: 'swim', measure: 'speed', minM: 1000 },
  { label: 'Longest ride', sport: 'bike', measure: 'distance', minM: 0 },
  { label: 'Fastest ride (20 km+)', sport: 'bike', measure: 'speed', minM: 20000 },
  { label: 'Most climbing', sport: 'bike', measure: 'climb', minM: 0 },
  { label: 'Longest run', sport: 'run', measure: 'distance', minM: 0 },
  { label: 'Fastest run pace (5 km+)', sport: 'run', measure: 'speed', minM: 5000 },
];

const SCORES: Record<Measure, (a: Activity) => number> = {
  distance: (a) => a.distanceM,
  speed: (a) => a.distanceM / a.movingS,
  climb: (a) => a.elevationM,
};

const best = (list: Activity[], score: (a: Activity) => number) =>
  list.reduce<Activity | undefined>((top, a) => (top === undefined || score(a) > score(top) ? a : top), undefined);

const candidates = (activities: Activity[], sinceKey: string, c: (typeof CATEGORIES)[number]) =>
  activities.filter((a) => a.date >= sinceKey && a.sport === c.sport && a.distanceM >= c.minM && a.movingS > 0);

/** Longest and fastest efforts since `sinceKey`. */
export function records(activities: Activity[], sinceKey: string): BestEffort[] {
  const out: BestEffort[] = [];
  for (const c of CATEGORIES) {
    const top = best(candidates(activities, sinceKey, c), SCORES[c.measure]);
    if (top) out.push({ label: c.label, sport: c.sport, measure: c.measure, activity: top });
  }
  return out;
}

export interface NewBest extends BestEffort {
  /** The best effort of this kind before this one. */
  previous: Activity;
}

/**
 * Best efforts set in the last `withinDays` days (today counts) that beat an earlier one. The first effort of a kind
 * isn't a new best, it's where the record starts.
 */
export function newBests(activities: Activity[], sinceKey: string, todayKey: string, withinDays = 2): NewBest[] {
  const from = toKey(addDays(fromKey(todayKey), -withinDays));
  const out: NewBest[] = [];
  for (const c of CATEGORIES) {
    const score = SCORES[c.measure];
    const pool = candidates(activities, sinceKey, c).filter((a) => a.date <= todayKey);
    const top = best(pool, score);
    if (!top || top.date < from) continue;
    const previous = best(
      pool.filter((a) => a.id !== top.id && a.start < top.start),
      score,
    );
    if (previous && score(top) > score(previous)) out.push({ label: c.label, sport: c.sport, measure: c.measure, activity: top, previous });
  }
  return out;
}

export interface WaterSwims {
  count: number;
  metres: number;
  seconds: number;
}

/** Swims since `sinceKey`, added up separately for the pool and open water. */
export function swimsByWater(activities: Activity[], sinceKey: string): { pool: WaterSwims; open: WaterSwims } {
  const out = { pool: { count: 0, metres: 0, seconds: 0 }, open: { count: 0, metres: 0, seconds: 0 } };
  for (const a of activities) {
    if (a.sport !== 'swim' || a.date < sinceKey || a.distanceM <= 0 || a.movingS <= 0) continue;
    const t = a.openWater ? out.open : out.pool;
    t.count += 1;
    t.metres += a.distanceM;
    t.seconds += a.movingS;
  }
  return out;
}

/** The highest heart rate the watch has seen, a floor for the max heart rate setting. */
export const highestHeartRate = (activities: Activity[]): number =>
  activities.reduce((top, a) => Math.max(top, a.maxHr ?? 0), 0);
