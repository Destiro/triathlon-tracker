import { Settings, Workout } from '../types';
import { addDays, daysBetween, toKey } from './dates';
import { workoutDuration } from './workout';

/**
 * Effort as a fraction of threshold ("intensity factor"). Heart rate is used when both it and max HR are
 * known; otherwise the RPE you gave; otherwise a moderate default.
 */
export function intensityFactor(w: Workout, settings: Pick<Settings, 'maxHr' | 'restingHr'>): number {
  if (w.avgHr && settings.maxHr) {
    const rest = settings.restingHr && settings.restingHr < settings.maxHr ? settings.restingHr : 0;
    const reserve = (w.avgHr - rest) / (settings.maxHr - rest);
    // Threshold sits around 88% of heart-rate reserve.
    return clamp(reserve / 0.88, 0.4, 1.2);
  }
  const rpe = w.rpe ?? 5;
  // RPE 1 is very light (0.5), RPE 10 is an all-out effort above threshold (1.1).
  return clamp(0.5 + ((clamp(rpe, 1, 10) - 1) * 0.6) / 9, 0.4, 1.2);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Training stress score: an hour at threshold scores 100. */
export function trainingStress(w: Workout, settings: Pick<Settings, 'maxHr' | 'restingHr'>): number {
  const hours = workoutDuration(w) / 3600;
  const f = intensityFactor(w, settings);
  return Math.round(hours * f * f * 100);
}

export interface LoadDay {
  date: string;
  /** That day's training stress. */
  stress: number;
  /** Fitness: 42-day average of stress. */
  fitness: number;
  /** Fatigue: 7-day average of stress. */
  fatigue: number;
  /** Form: yesterday's fitness minus fatigue. Positive is fresh, very negative is overreaching. */
  form: number;
}

const FITNESS_DAYS = 42;
const FATIGUE_DAYS = 7;

/**
 * Daily fitness, fatigue and form up to `today`, the standard performance management model. It starts from
 * the first workout (or `days` before today, whichever is later) so the early numbers build up from zero.
 */
export function loadSeries(
  workouts: Workout[],
  settings: Pick<Settings, 'maxHr' | 'restingHr'>,
  today: Date,
  days = 120,
): LoadDay[] {
  const stressByDay = new Map<string, number>();
  for (const w of workouts) {
    const key = toKey(new Date(w.startedAt));
    stressByDay.set(key, (stressByDay.get(key) ?? 0) + trainingStress(w, settings));
  }
  // Warm the averages up from well before the window so they are realistic on its first day.
  const first = workouts.reduce<Date | null>((min, w) => {
    const d = new Date(w.startedAt);
    return !min || d < min ? d : min;
  }, null);
  const windowStart = addDays(today, -(days - 1));
  const start = first && first < windowStart ? first : windowStart;
  const total = daysBetween(start, today) + 1;

  let fitness = 0;
  let fatigue = 0;
  const series: LoadDay[] = [];
  for (let i = 0; i < total; i++) {
    const day = addDays(start, i);
    const key = toKey(day);
    const stress = stressByDay.get(key) ?? 0;
    const form = fitness - fatigue;
    fitness += (stress - fitness) / FITNESS_DAYS;
    fatigue += (stress - fatigue) / FATIGUE_DAYS;
    if (day >= windowStart) series.push({ date: key, stress, fitness: round1(fitness), fatigue: round1(fatigue), form: round1(form) });
  }
  return series;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A plain-words reading of form. */
export function describeForm(form: number): { label: string; advice: string } {
  if (form > 15) return { label: 'Very fresh', advice: 'Rested and ready to race, though fitness may be slipping if this lasts.' };
  if (form > 5) return { label: 'Fresh', advice: 'A good place to be before a race or a hard session.' };
  if (form >= -10) return { label: 'Balanced', advice: 'Training and recovery are in step.' };
  if (form >= -30) return { label: 'Productive', advice: 'You are building fitness. Keep easy days easy.' };
  return { label: 'Overreaching', advice: 'Fatigue is high. Plan some rest before it turns into illness or injury.' };
}
