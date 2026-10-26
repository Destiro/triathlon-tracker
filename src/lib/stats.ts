import { Sport, Workout } from '../types';
import { addDays, daysBetween, startOfWeek, toKey } from './dates';
import { sportTotals, workoutDistance, workoutDuration } from './workout';

export const VOLUME_SPORTS = ['swim', 'bike', 'run', 'strength'] as const;
export type VolumeSport = (typeof VOLUME_SPORTS)[number];

export interface WeekVolume {
  /** Monday, YYYY-MM-DD. */
  weekStart: string;
  /** Seconds per sport. */
  seconds: Record<VolumeSport, number>;
  /** Metres per sport. */
  metres: Record<VolumeSport, number>;
  totalSec: number;
  sessions: number;
}

const zero = (): Record<VolumeSport, number> => ({ swim: 0, bike: 0, run: 0, strength: 0 });

/** Training volume for the `weeks` weeks up to and including the one containing `today`, oldest first. */
export function weeklyVolume(workouts: Workout[], today: Date, weeks = 12): WeekVolume[] {
  const thisWeek = startOfWeek(today);
  const result: WeekVolume[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: toKey(addDays(thisWeek, -7 * (weeks - 1 - i))),
    seconds: zero(),
    metres: zero(),
    totalSec: 0,
    sessions: 0,
  }));
  const index = new Map(result.map((w, i) => [w.weekStart, i]));
  for (const w of workouts) {
    const i = index.get(toKey(startOfWeek(new Date(w.startedAt))));
    if (i === undefined) continue;
    const week = result[i];
    for (const sport of VOLUME_SPORTS) {
      const t = sportTotals(w, sport);
      week.seconds[sport] += t.durationSec;
      week.metres[sport] += t.distanceM;
    }
    week.totalSec += workoutDuration(w);
    week.sessions += 1;
  }
  return result;
}

/**
 * Days in a row with at least one workout, counting back from today. If you haven't trained yet today, the
 * streak still stands as long as you trained yesterday.
 */
export function currentStreak(workouts: Workout[], today: Date): number {
  const days = new Set(workouts.map((w) => toKey(new Date(w.startedAt))));
  let day = days.has(toKey(today)) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(toKey(day))) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

export interface Best {
  label: string;
  /** Seconds for timed bests, metres for distance bests. */
  value: number;
  kind: 'time' | 'distance' | 'pace';
  sport: Sport;
  workoutId: string;
  date: string;
}

/** Best time over a distance: the quickest single-sport effort at least that long, scaled down by its pace. */
function fastest(workouts: Workout[], sport: Sport, distanceM: number, label: string): Best | null {
  let best: Best | null = null;
  for (const w of workouts) {
    for (const s of w.segments) {
      if (s.sport !== sport || s.distanceM < distanceM || s.durationSec <= 0) continue;
      // Scaled from the session's average pace, so a strong 12 km run also sets a 10 km best.
      const time = (s.durationSec / s.distanceM) * distanceM;
      if (!best || time < best.value) best = { label, value: Math.round(time), kind: 'time', sport, workoutId: w.id, date: w.startedAt };
    }
  }
  return best;
}

function longest(workouts: Workout[], sport: Sport, label: string): Best | null {
  let best: Best | null = null;
  for (const w of workouts) {
    const d = sportTotals(w, sport).distanceM;
    if (d > 0 && (!best || d > best.value)) best = { label, value: d, kind: 'distance', sport, workoutId: w.id, date: w.startedAt };
  }
  return best;
}

/** Personal bests worth celebrating, from every workout logged. */
export function personalBests(workouts: Workout[]): Best[] {
  return [
    fastest(workouts, 'run', 5_000, 'Fastest 5 km run'),
    fastest(workouts, 'run', 10_000, 'Fastest 10 km run'),
    fastest(workouts, 'run', 21_097, 'Fastest half marathon'),
    fastest(workouts, 'swim', 400, 'Fastest 400 m swim'),
    fastest(workouts, 'swim', 1_500, 'Fastest 1500 m swim'),
    fastest(workouts, 'bike', 40_000, 'Fastest 40 km ride'),
    longest(workouts, 'run', 'Longest run'),
    longest(workouts, 'bike', 'Longest ride'),
    longest(workouts, 'swim', 'Longest swim'),
  ].filter((b): b is Best => b !== null);
}

export interface Totals {
  sessions: number;
  durationSec: number;
  distanceM: number;
  bySport: Record<VolumeSport, { sessions: number; durationSec: number; distanceM: number }>;
}

/** Lifetime totals, overall and per sport. A brick counts as a session for each sport in it. */
export function totals(workouts: Workout[]): Totals {
  const bySport = Object.fromEntries(VOLUME_SPORTS.map((s) => [s, { sessions: 0, durationSec: 0, distanceM: 0 }])) as Totals['bySport'];
  for (const w of workouts) {
    for (const sport of VOLUME_SPORTS) {
      const t = sportTotals(w, sport);
      if (t.durationSec <= 0 && t.distanceM <= 0) continue;
      bySport[sport].sessions += 1;
      bySport[sport].durationSec += t.durationSec;
      bySport[sport].distanceM += t.distanceM;
    }
  }
  return {
    sessions: workouts.length,
    durationSec: workouts.reduce((s, w) => s + workoutDuration(w), 0),
    distanceM: workouts.reduce((s, w) => s + workoutDistance(w), 0),
    bySport,
  };
}

/** Workouts in the last `days` days, up to and including today. */
export const recent = (workouts: Workout[], today: Date, days: number): Workout[] =>
  workouts.filter((w) => {
    const age = daysBetween(new Date(w.startedAt), today);
    return age >= 0 && age < days;
  });

/**
 * Personal bests that a workout sets: ones it holds afterwards that it didn't before, either because there
 * was no best yet or because it beats the old one.
 */
export function newBests(before: Workout[], after: Workout[], workoutId: string): Best[] {
  const old = new Map(personalBests(before).map((b) => [b.label, b]));
  return personalBests(after).filter((b) => {
    if (b.workoutId !== workoutId) return false;
    const previous = old.get(b.label);
    if (!previous) return true;
    return b.kind === 'distance' ? b.value > previous.value : b.value < previous.value;
  });
}
