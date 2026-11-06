import { Discipline } from './plan/types';

/** A workout recorded on the watch, as it came through Strava. Only what the app uses is kept. */
export interface Activity {
  id: number;
  name: string;
  sport: Discipline | 'other';
  /** Strava's own type, such as "Run" or "VirtualRide". */
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
}

const SPORTS: Record<string, Discipline> = {
  Swim: 'swim',
  Ride: 'bike',
  VirtualRide: 'bike',
  GravelRide: 'bike',
  MountainBikeRide: 'bike',
  Run: 'run',
  TrailRun: 'run',
  VirtualRun: 'run',
  WeightTraining: 'gym',
  Workout: 'gym',
  Crossfit: 'gym',
  HighIntensityIntervalTraining: 'gym',
};

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Turns one entry from Strava's activity list into an Activity, or null if it isn't usable. */
export function toActivity(raw: Record<string, unknown>): Activity | null {
  const id = num(raw.id);
  const start = typeof raw.start_date_local === 'string' ? raw.start_date_local : '';
  if (id === undefined || !/^\d{4}-\d{2}-\d{2}T/.test(start)) return null;

  const type = typeof raw.sport_type === 'string' ? raw.sport_type : typeof raw.type === 'string' ? raw.type : 'Workout';
  const movingS = num(raw.moving_time) ?? 0;
  const distanceM = num(raw.distance) ?? 0;
  const hasHr = raw.has_heartrate !== false;

  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : type,
    sport: SPORTS[type] ?? 'other',
    type,
    // Strava writes local time with a Z on the end; the date part is the local date.
    date: start.slice(0, 10),
    start: start.replace(/Z$/, ''),
    distanceM,
    movingS,
    elapsedS: num(raw.elapsed_time) ?? movingS,
    elevationM: num(raw.total_elevation_gain) ?? 0,
    avgHr: hasHr ? num(raw.average_heartrate) : undefined,
    maxHr: hasHr ? num(raw.max_heartrate) : undefined,
    avgSpeed: num(raw.average_speed) ?? (movingS > 0 ? distanceM / movingS : 0),
    avgCadence: num(raw.average_cadence),
  };
}

/** Adds new activities to the saved ones, replacing any with the same id, newest first. */
export function mergeActivities(saved: Activity[], incoming: Activity[]): Activity[] {
  const byId = new Map(saved.map((a) => [a.id, a]));
  for (const a of incoming) byId.set(a.id, a);
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
