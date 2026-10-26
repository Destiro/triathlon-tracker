import { Gear, GearKind, Workout } from '../types';
import { workoutDistance } from './workout';

/** Typical replacement points, in metres. */
export const DEFAULT_LIMITS: Partial<Record<GearKind, number>> = {
  shoes: 700_000,
  bike: 10_000_000,
};

export const GEAR_LABELS: Record<GearKind, string> = {
  shoes: 'Running shoes',
  bike: 'Bike',
  wetsuit: 'Wetsuit',
  other: 'Other',
};

/** Distance on a piece of gear: what it had when added, plus every workout it was used for. */
export const gearDistance = (gear: Gear, workouts: Workout[]): number =>
  gear.startDistanceM + workouts.filter((w) => w.gearId === gear.id).reduce((s, w) => s + workoutDistance(w), 0);

export type Wear = 'ok' | 'soon' | 'replace';

/** How worn it is against its limit: replace at the limit, a warning from 90%. No limit means always ok. */
export function wear(gear: Gear, workouts: Workout[]): { distanceM: number; fraction: number | null; status: Wear } {
  const distanceM = gearDistance(gear, workouts);
  if (!gear.limitM) return { distanceM, fraction: null, status: 'ok' };
  const fraction = distanceM / gear.limitM;
  return { distanceM, fraction, status: fraction >= 1 ? 'replace' : fraction >= 0.9 ? 'soon' : 'ok' };
}

/** Which kinds of gear make sense for a sport, so the log only offers relevant items. */
export const gearKindsFor = (sport: string): GearKind[] =>
  sport === 'run' ? ['shoes', 'other'] : sport === 'bike' ? ['bike', 'other'] : sport === 'swim' ? ['wetsuit', 'other'] : ['other'];
