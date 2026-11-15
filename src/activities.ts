import { Discipline } from './plan/types';

/**
 * A workout recorded on the watch. New ones are read from Health Connect; the ones from before the switch came through
 * Strava and are kept exactly as they were saved. Only what the app uses is kept.
 */
export interface Activity {
  /** Strava's id for the older ones; the start time in milliseconds for Health Connect ones. */
  id: number;
  name: string;
  sport: Discipline | 'other';
  /** What kind of workout the source called it, such as "Running" or Strava's "VirtualRide". */
  type: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Local start time, ISO without a time zone. */
  start: string;
  distanceM: number;
  movingS: number;
  elapsedS: number;
  elevationM: number;
  avgHr?: number;
  maxHr?: number;
  /** Metres per second. */
  avgSpeed: number;
  avgCadence?: number;
  /** Swims only: swum outdoors. You can correct it by hand. */
  openWater?: boolean;
  /** Seconds spent at each heart rate, by beats per minute. Empty when there was nothing to work it out from. */
  hr?: Record<number, number>;
  /** Where it came from. Missing on everything saved before the switch, which all came from Strava. */
  source?: 'health';
  /** Energy burned, in kilocalories, when the watch wrote it. */
  kcal?: number;
  /**
   * Long rides and runs only: average heart rate and speed in the first and second half, after the warm-up. Heart rate
   * rising for the same speed is cardiac drift.
   */
  halves?: { hr1: number; hr2: number; v1: number; v2: number };
  /** Which version of the reader made this record. Older ones are read again when the reader learns something new. */
  read?: number;
}

/**
 * Adds new activities to the saved ones, replacing any with the same id, newest first. A fresh copy without a heart
 * rate breakdown keeps the one already saved.
 */
export function mergeActivities(saved: Activity[], incoming: Activity[]): Activity[] {
  const byId = new Map(saved.map((a) => [a.id, a]));
  for (const a of incoming) {
    const hr = byId.get(a.id)?.hr;
    byId.set(a.id, hr && !a.hr ? { ...a, hr } : a);
  }
  return [...byId.values()].sort((a, b) => b.start.localeCompare(a.start));
}

/** Activities grouped by local date. */
export function byDate(activities: Activity[]): Map<string, Activity[]> {
  const map = new Map<string, Activity[]>();
  for (const a of activities) {
    const list = map.get(a.date);
    if (list) list.push(a);
    else map.set(a.date, [a]);
  }
  for (const list of map.values()) list.sort((a, b) => a.start.localeCompare(b.start));
  return map;
}
