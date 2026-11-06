import { Activity } from './activities';
import { PlannedWorkout } from './plan/types';

/** Where each heart rate zone starts, as a share of max heart rate. Zone 1 is everything below the second number. */
export const ZONE_STARTS = [0, 0.6, 0.7, 0.8, 0.9];
export const ZONE_NAMES = ['Easy', 'Aerobic', 'Tempo', 'Threshold', 'Max'];

// A gap in the recording (a pause) shouldn't count as time at the last heart rate.
const MAX_GAP_S = 30;

/** Which zone a heart rate falls in, 0 to 4 (zone 1 to 5). */
export function zoneIndex(bpm: number, maxHr: number): number {
  for (let z = ZONE_STARTS.length - 1; z > 0; z--) if (bpm >= ZONE_STARTS[z] * maxHr) return z;
  return 0;
}

/** Seconds in each of the five zones, for a heart rate breakdown and a max heart rate. */
export function zoneSeconds(hr: Record<number, number>, maxHr: number): number[] {
  const seconds = ZONE_STARTS.map(() => 0);
  for (const [bpm, s] of Object.entries(hr)) seconds[zoneIndex(Number(bpm), maxHr)] += s;
  return seconds;
}

/** Turns a heart rate stream (one reading per sample, with its time in seconds) into seconds spent at each rate. */
export function histogramFromStream(time: number[], heartRate: number[]): Record<number, number> {
  const hist: Record<number, number> = {};
  const n = Math.min(time.length, heartRate.length);
  for (let i = 0; i < n; i++) {
    const bpm = Math.round(heartRate[i]);
    if (!(bpm > 0)) continue;
    const gap = i < n - 1 ? Math.min(Math.max(time[i + 1] - time[i], 0), MAX_GAP_S) : 1;
    hist[bpm] = (hist[bpm] ?? 0) + gap;
  }
  return hist;
}

/**
 * Reads Strava's answer to a streams request for time and heart rate. Strava documents a list of streams but sends an
 * object keyed by name when asked to, so both are accepted. Returns null when either stream is missing.
 */
export function histogramFromResponse(body: unknown): Record<number, number> | null {
  const dataOf = (key: string): number[] | null => {
    const found = Array.isArray(body)
      ? body.find((s) => s && typeof s === 'object' && (s as { type?: unknown }).type === key)
      : body && typeof body === 'object'
        ? (body as Record<string, unknown>)[key]
        : undefined;
    const data = found && typeof found === 'object' ? (found as { data?: unknown }).data : undefined;
    return Array.isArray(data) && data.every((v) => typeof v === 'number') ? (data as number[]) : null;
  };
  const time = dataOf('time');
  const heartRate = dataOf('heartrate');
  return time && heartRate ? histogramFromStream(time, heartRate) : null;
}

/** Whether this activity has a heart rate reading but no breakdown yet, so it is worth fetching one. */
export const wantsZones = (a: Activity): boolean => a.avgHr !== undefined && a.hr === undefined && a.sport !== 'other' && a.movingS >= 300;

// What the plan's words for effort mean in zones. Change these to change what counts as on target.
const INTENSITY_ZONES: Record<string, [number, number]> = {
  recovery: [1, 1],
  'low aerobic': [1, 2],
  'moderate aerobic': [2, 3],
  threshold: [4, 4],
  vo2max: [5, 5],
};

export interface ZoneTarget {
  /** Zone numbers, 1 to 5. */
  from: number;
  to: number;
  /** The plan's word for it, such as "moderate aerobic". */
  intensity: string;
}

/**
 * The zones a workout asked for, when every step names the same effort (a foundation ride or run). Workouts that mix
 * efforts, like intervals, that leave a step's effort unsaid, like sprints, or that ask for an all-out effort have
 * none to check against. The strides added to some runs are twenty seconds each, too short to move the result.
 */
export function targetZones(workout: PlannedWorkout): ZoneTarget | null {
  const steps = workout.steps.filter((step) => !step.startsWith('Strides:'));
  if (steps.length === 0) return null;
  const found = new Set<string>();
  for (const step of steps) {
    // "@ moderate aerobic intensity", or "easy = moderate aerobic intensity, hard = threshold intensity" in a mixed set.
    const named = [...step.matchAll(/[@=] ([A-Za-z0-9 ]+?) intensity/g)].map((m) => m[1].toLowerCase());
    if (named.length === 0) return null;
    for (const n of named) found.add(n);
  }
  if (found.size !== 1) return null;
  const [intensity] = [...found];
  const zones = INTENSITY_ZONES[intensity];
  return zones ? { from: zones[0], to: zones[1], intensity } : null;
}

// At least this share of the time in the zones asked for counts as on target; wrist heart rate drifts and lags.
const ON_TARGET_AT = 0.7;

const rangeText = (from: number, to: number) => (from === to ? `zone ${from}` : `zones ${from}–${to}`);

export interface ZoneVerdict {
  share: number;
  onTarget: boolean;
  text: string;
}

/** How the time in each zone compares with what the workout asked for, in a sentence. */
export function zoneVerdict(seconds: number[], target: ZoneTarget): ZoneVerdict {
  const share = shareInZones(seconds, target.from, target.to);
  const percent = Math.round(share * 100);
  const where = `${rangeText(target.from, target.to)} (${target.intensity})`;
  if (share >= ON_TARGET_AT) return { share, onTarget: true, text: `On target: ${percent}% of the time in ${where}.` };
  const above = target.to < 5 ? shareInZones(seconds, target.to + 1, 5) : 0;
  const below = target.from > 1 ? shareInZones(seconds, 1, target.from - 1) : 0;
  const rest = above >= below ? 'Most of the rest was above that.' : 'Most of the rest was below that.';
  return { share, onTarget: false, text: `${percent}% of the time in ${where}. ${rest}` };
}

/** The share of the time spent in zones `from` to `to` (1 to 5), 0 to 1. */
export function shareInZones(seconds: number[], from: number, to: number): number {
  const total = seconds.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return seconds.slice(from - 1, to).reduce((a, b) => a + b, 0) / total;
}
