export interface HrZone {
  zone: number;
  name: string;
  /** Beats per minute, inclusive of min and exclusive of max (the top zone runs to max HR). */
  min: number;
  max: number;
}

const NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2 max'];
const BOUNDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1];

/**
 * Five heart-rate zones. With a resting heart rate they use heart-rate reserve (Karvonen), which suits
 * fitter athletes; otherwise plain percentages of max HR.
 */
export function hrZones(maxHr: number, restingHr?: number): HrZone[] {
  const reserve = restingHr && restingHr < maxHr ? maxHr - restingHr : null;
  const at = (f: number) => Math.round(reserve ? restingHr! + reserve * f : maxHr * f);
  return NAMES.map((name, i) => ({ zone: i + 1, name, min: at(BOUNDS[i]), max: at(BOUNDS[i + 1]) }));
}

/** The zone a heart rate falls in, or null below zone 1. Anything at or above max HR is zone 5. */
export function zoneFor(hr: number, zones: HrZone[]): HrZone | null {
  if (zones.length === 0 || hr < zones[0].min) return null;
  return zones.find((z) => hr >= z.min && hr < z.max) ?? zones[zones.length - 1];
}

/** A common starting estimate when max HR hasn't been measured (Tanaka: 208 - 0.7 x age). */
export const estimateMaxHr = (age: number): number => Math.round(208 - 0.7 * age);
