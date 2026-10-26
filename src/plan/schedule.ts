import { addDays, fromKey, toKey } from '../dates';
import { PLAN } from './data';
import { Phase, PlannedWorkout } from './types';

export interface ScheduledDay {
  date: string;
  week: number;
  phase: Phase;
  recovery: boolean;
  /** Empty on a rest day. */
  workouts: PlannedWorkout[];
}

export type Schedule = Map<string, ScheduledDay>;

const RACE_WEEK = PLAN.length;

/**
 * Lays the plan out on the calendar. Weeks 1 to 19 run Monday to Sunday from `startKey` (a Monday). Race week is
 * counted back from the actual race day instead, so the race lands on the right day even when it isn't a Sunday;
 * anything from week 19 that overlaps race week gives way to it.
 */
export function buildSchedule(startKey: string, raceKey: string, raceName: string): Schedule {
  const start = fromKey(startKey);
  const raceDay = fromKey(raceKey);
  const raceWeekStart = addDays(raceDay, -6);
  const schedule: Schedule = new Map();

  for (const week of PLAN) {
    if (week.week === RACE_WEEK) continue;
    week.days.forEach((workouts, i) => {
      const date = addDays(start, (week.week - 1) * 7 + i);
      if (date >= raceWeekStart) return;
      const key = toKey(date);
      schedule.set(key, { date: key, week: week.week, phase: week.phase, recovery: week.recovery, workouts });
    });
  }

  const raceWeek = PLAN[RACE_WEEK - 1];
  raceWeek.days.forEach((workouts, i) => {
    const key = toKey(addDays(raceWeekStart, i));
    const named = workouts.map((w) => (w.kind === 'race' && raceName ? { ...w, title: raceName } : w));
    schedule.set(key, { date: key, week: RACE_WEEK, phase: 'race', recovery: false, workouts: named });
  });

  return schedule;
}

/** The plan week a date falls in, or null before the plan starts or after the race. */
export function weekOf(schedule: Schedule, dateKey: string): number | null {
  return schedule.get(dateKey)?.week ?? null;
}

/** Every scheduled day in one plan week, in date order. */
export function daysOfWeek(schedule: Schedule, week: number): ScheduledDay[] {
  return [...schedule.values()].filter((d) => d.week === week).sort((a, b) => a.date.localeCompare(b.date));
}

export const PHASE_LABELS: Record<Phase, string> = {
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  taper: 'Taper',
  race: 'Race week',
};

export const TOTAL_WEEKS = RACE_WEEK;
