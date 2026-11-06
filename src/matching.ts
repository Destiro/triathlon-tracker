import { Activity } from './activities';
import { ScheduledDay } from './plan/schedule';
import { Discipline, PlannedWorkout } from './plan/types';

export type Status = 'done' | 'partial' | 'missed' | 'today' | 'upcoming';

export interface WorkoutResult {
  workout: PlannedWorkout;
  status: Status;
  activities: Activity[];
  /** How much of the planned time (or swim distance) was done; 1 = all of it. */
  fraction: number;
}

export interface DayResult {
  results: WorkoutResult[];
  /** Activities that day that no planned workout asked for. */
  extras: Activity[];
}

/** At or above this share of the planned amount, a workout counts as done. */
export const DONE_AT = 0.8;

// When a swim reached Strava without a distance, its time is compared at this pace instead.
const SWIM_SECONDS_PER_100M = 150;

export function sportsOf(workout: PlannedWorkout): Discipline[] {
  if (workout.kind === 'brick') return ['bike', 'run'];
  if (workout.kind === 'race') return ['swim', 'bike', 'run'];
  return [workout.kind];
}

function fractionDone(workout: PlannedWorkout, activities: Activity[]): number {
  if (activities.length === 0) return 0;
  if (workout.kind === 'race') {
    // A race is done once every discipline has been recorded.
    const sports = new Set(activities.map((a) => a.sport));
    return sportsOf(workout).filter((s) => sports.has(s)).length / 3;
  }
  if (workout.kind === 'swim' && workout.metres) {
    const metres = activities.reduce(
      (sum, a) => sum + (a.distanceM > 0 ? a.distanceM : (a.movingS / SWIM_SECONDS_PER_100M) * 100),
      0,
    );
    return metres / workout.metres;
  }
  if (workout.minutes) {
    const minutes = activities.reduce((sum, a) => sum + a.movingS / 60, 0);
    return minutes / workout.minutes;
  }
  return 1;
}

/**
 * Pairs a day's planned workouts with what the watch recorded that day. Each workout takes every activity of its
 * sport (a brick takes the ride and the run; a race takes all three), so a swim split into two recordings still
 * counts in full. When a later workout the same day shares a sport (a ride moved onto a day that has one), recordings
 * are handed out in the order they happened, each workout taking them until it is done, so two rides count as two.
 * Whatever is left over is extra.
 */
export function matchDay(day: ScheduledDay | undefined, activities: Activity[], todayKey: string): DayResult {
  const unclaimed = [...activities];
  const planned = day?.workouts ?? [];
  const results = planned.map((workout, i): WorkoutResult => {
    const sports = sportsOf(workout);
    let mine = unclaimed.filter((a) => a.sport !== 'other' && sports.includes(a.sport));
    const shared = planned.slice(i + 1).some((later) => sportsOf(later).some((s) => sports.includes(s)));
    if (shared) {
      const taken: Activity[] = [];
      for (const a of mine) {
        if (taken.length > 0 && fractionDone(workout, taken) >= DONE_AT) break;
        taken.push(a);
      }
      mine = taken;
    }
    for (const a of mine) unclaimed.splice(unclaimed.indexOf(a), 1);

    const fraction = fractionDone(workout, mine);
    let status: Status;
    if (fraction >= DONE_AT) status = 'done';
    else if (fraction > 0) status = 'partial';
    else if (!day || day.date < todayKey) status = 'missed';
    else status = day.date === todayKey ? 'today' : 'upcoming';

    return { workout, status, activities: mine, fraction };
  });
  return { results, extras: unclaimed };
}

/** Points for compliance: done counts fully, partly done counts half. */
export const statusScore = (status: Status): number => (status === 'done' ? 1 : status === 'partial' ? 0.5 : 0);
