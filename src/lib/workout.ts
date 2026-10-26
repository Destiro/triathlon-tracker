import { Sport, Workout } from '../types';

/** Total time across every leg, including transitions. */
export const workoutDuration = (w: Workout): number => w.segments.reduce((sum, s) => sum + s.durationSec, 0);

/** Total distance across every leg. */
export const workoutDistance = (w: Workout): number => w.segments.reduce((sum, s) => sum + s.distanceM, 0);

/** True for a brick or race: more than one sport, not counting transitions. */
export const isMultisport = (w: Workout): boolean => new Set(w.segments.filter((s) => s.sport !== 'transition').map((s) => s.sport)).size > 1;

/** The sport a workout is filed under: its only sport, or 'multisport'. */
export function primarySport(w: Workout): Sport | 'multisport' {
  if (isMultisport(w)) return 'multisport';
  return w.segments.find((s) => s.sport !== 'transition')?.sport ?? w.segments[0]?.sport ?? 'run';
}

/** Time and distance spent on one sport within a workout (a brick counts toward both bike and run). */
export function sportTotals(w: Workout, sport: Sport): { durationSec: number; distanceM: number } {
  return w.segments
    .filter((s) => s.sport === sport)
    .reduce((t, s) => ({ durationSec: t.durationSec + s.durationSec, distanceM: t.distanceM + s.distanceM }), {
      durationSec: 0,
      distanceM: 0,
    });
}

/** A readable name: the title if given, otherwise e.g. "Run", "Bike + Run", "Swim + Bike + Run". */
export function workoutTitle(w: Workout): string {
  if (w.title?.trim()) return w.title.trim();
  const sports = w.segments.map((s) => s.sport).filter((s) => s !== 'transition');
  const names = sports.filter((s, i) => sports.indexOf(s) === i).map((s) => s[0].toUpperCase() + s.slice(1));
  return names.join(' + ') || 'Workout';
}

/** Newest first. */
export const byNewest = (a: Workout, b: Workout): number => b.startedAt.localeCompare(a.startedAt);

export const newId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
