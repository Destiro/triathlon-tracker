import { Segment, Sport, Workout } from '../types';

let n = 0;

/** A single-sport workout on a given local date (YYYY-MM-DD), at 7am. */
export function workout(date: string, sport: Sport, minutes: number, km = 0, extra: Partial<Workout> = {}): Workout {
  const [y, m, d] = date.split('-').map(Number);
  return {
    id: `w${++n}`,
    startedAt: new Date(y, m - 1, d, 7).toISOString(),
    segments: [{ sport, durationSec: minutes * 60, distanceM: km * 1000 }],
    source: 'manual',
    ...extra,
  };
}

/** A multisport workout from its legs. */
export function multi(date: string, segments: Segment[], extra: Partial<Workout> = {}): Workout {
  const [y, m, d] = date.split('-').map(Number);
  return { id: `w${++n}`, startedAt: new Date(y, m - 1, d, 7).toISOString(), segments, source: 'manual', ...extra };
}
