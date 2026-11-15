import { Activity } from './activities';
import { addDays, fromKey, toKey } from './dates';
import { Schedule } from './plan/schedule';
import { Discipline, PlannedWorkout, Sport } from './plan/types';
import { FATIGUE_DAYS, FITNESS_DAYS, HeartRates, LOAD_PER_MINUTE_WITHOUT_HR, loadSeries, plannedMinutes, trainingLoad } from './stats';

// Where your form is heading if you do the rest of the plan as it stands.

/** Training load per minute for each sport, from the last six weeks: how hard your sessions usually are. */
const RATE_DAYS = 42;

function loadRates(activities: Activity[], todayKey: string, hr: HeartRates): Record<Discipline, number> {
  const from = toKey(addDays(fromKey(todayKey), -RATE_DAYS));
  const rates = {} as Record<Discipline, number>;
  for (const sport of ['swim', 'bike', 'run', 'gym'] as const) {
    const recent = activities.filter((a) => a.sport === sport && a.date >= from && a.date <= todayKey && a.movingS > 0);
    const minutes = recent.reduce((s, a) => s + a.movingS / 60, 0);
    rates[sport] = minutes > 0 ? recent.reduce((s, a) => s + trainingLoad(a, hr), 0) / minutes : LOAD_PER_MINUTE_WITHOUT_HR;
  }
  return rates;
}

/** The load a planned workout adds, at the rate you usually train each sport. */
export function plannedLoad(w: PlannedWorkout, rates: Record<Discipline, number>): number {
  if (w.legs) return w.legs.reduce((sum, leg) => sum + plannedMinutes({ kind: leg.sport, title: '', steps: [], minutes: leg.minutes, metres: leg.metres }) * rates[leg.sport], 0);
  const sport: Discipline = w.kind === 'brick' || w.kind === 'race' ? 'run' : (w.kind as Sport | 'gym');
  return plannedMinutes(w) * rates[sport];
}

export interface FormPoint {
  date: string;
  form: number;
  /** True for days still to come. */
  projected: boolean;
}

export interface FormProjection {
  /** Form going into race day. */
  raceForm: number;
  fitness: number;
  fatigue: number;
  points: FormPoint[];
}

/**
 * Runs fitness and fatigue forward from today to race day, counting each remaining planned workout at the load you
 * usually produce for that sport. Null once race day has come, or when there is nothing to start from.
 */
export function projectForm(
  activities: Activity[],
  schedule: Schedule,
  startKey: string,
  todayKey: string,
  raceKey: string,
  hr: HeartRates,
): FormProjection | null {
  if (todayKey >= raceKey || activities.length === 0) return null;
  const past = loadSeries(activities, startKey, todayKey, hr);
  if (past.length === 0) return null;
  const rates = loadRates(activities, todayKey, hr);
  const last = past[past.length - 1];
  const points: FormPoint[] = past.map((p) => ({ date: p.date, form: p.form, projected: false }));

  let { fitness, fatigue } = last;
  // Today's own training is already in the series, so the first day to add is tomorrow.
  for (let d = addDays(fromKey(todayKey), 1); toKey(d) <= raceKey; d = addDays(d, 1)) {
    const key = toKey(d);
    points.push({ date: key, form: fitness - fatigue, projected: true });
    const load = (schedule.get(key)?.workouts ?? []).filter((w) => w.kind !== 'race').reduce((sum, w) => sum + plannedLoad(w, rates), 0);
    fitness += (load - fitness) / FITNESS_DAYS;
    fatigue += (load - fatigue) / FATIGUE_DAYS;
  }
  const race = points[points.length - 1];
  return { raceForm: race.form, fitness, fatigue, points };
}
