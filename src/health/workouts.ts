import { Activity } from '../activities';
import { formatClock, formatDistance } from '../format';
import { Discipline } from '../plan/types';
import { histogramFromStream } from '../zones';

// Turns the workouts Health Connect holds into the app's own, and into plain sentences for the workout check.
// These functions take plain data, not the native library, so they can be tested without a phone.

/**
 * What the workout check asks for, on top of what the sleep reading already has (heart rate, and history older than 30
 * days). Each needs its Android permission declared in app.json as well, or the request fails without a clear error;
 * a test checks the two agree.
 */
export const WORKOUT_TYPES = [
  { recordType: 'ExerciseSession', permission: 'android.permission.health.READ_EXERCISE' },
  { recordType: 'Distance', permission: 'android.permission.health.READ_DISTANCE' },
  { recordType: 'Speed', permission: 'android.permission.health.READ_SPEED' },
  { recordType: 'ElevationGained', permission: 'android.permission.health.READ_ELEVATION_GAINED' },
  { recordType: 'TotalCaloriesBurned', permission: 'android.permission.health.READ_TOTAL_CALORIES_BURNED' },
  { recordType: 'ActiveCaloriesBurned', permission: 'android.permission.health.READ_ACTIVE_CALORIES_BURNED' },
  { recordType: 'Power', permission: 'android.permission.health.READ_POWER' },
] as const;

/** The exercise types the plan cares about, by Health Connect's own numbers. Anything else shows its number. */
const EXERCISE_NAMES: Record<number, string> = {
  0: 'Other workout',
  8: 'Cycling',
  9: 'Cycling (indoor)',
  13: 'Calisthenics',
  25: 'Elliptical',
  36: 'HIIT',
  37: 'Hiking',
  48: 'Pilates',
  53: 'Rowing',
  54: 'Rowing machine',
  56: 'Running',
  57: 'Running (treadmill)',
  70: 'Strength training',
  71: 'Stretching',
  73: 'Swimming (open water)',
  74: 'Swimming (pool)',
  79: 'Walking',
  83: 'Yoga',
};

export const exerciseName = (type: number): string => EXERCISE_NAMES[type] ?? `Exercise type ${type}`;

const ms = (iso: string) => new Date(iso).getTime();
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface Origin {
  dataOrigin?: string;
  device?: { manufacturer?: string; model?: string };
}

/** What Health Connect returned for one workout and the records that fall inside it. */
export interface SessionData {
  session: { startTime: string; endTime: string; exerciseType: number; title?: string; metadata?: Origin };
  distances: { distance: { inMeters: number } }[];
  heartRates: { samples: { time: string; beatsPerMinute: number }[] }[];
  speeds: { samples: { time: string; speed: { inMetersPerSecond: number } }[] }[];
  elevations: { elevation: { inMeters: number } }[];
  calories: { energy: { inKilocalories: number } }[];
}

/** Which plan sport each Health Connect exercise type counts as. Anything not listed is kept as "other". */
const SPORTS: Record<number, Discipline> = {
  56: 'run',
  57: 'run',
  8: 'bike',
  9: 'bike',
  73: 'swim',
  74: 'swim',
  70: 'gym',
  81: 'gym',
  13: 'gym',
  36: 'gym',
};
/** The watch logs walks all day long, so they are left out rather than shown as workouts. */
const LEFT_OUT = new Set([79]);

/** The plan sport for an exercise type, or null for one that is left out. */
export function sportOf(exerciseType: number): Discipline | 'other' | null {
  return LEFT_OUT.has(exerciseType) ? null : (SPORTS[exerciseType] ?? 'other');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A moment as local time without a zone, the way activities store their start. */
export function localIso(msSinceEpoch: number): string {
  const d = new Date(msSinceEpoch);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Below this you are standing still, so the reading doesn't count towards moving speed.
const MOVING_MS = 0.3;
// Fewer heart rate readings than this (a gym app writing one every ten minutes) can't say how long was spent in each zone.
const MIN_SAMPLES_FOR_ZONES = 60;

/** One Health Connect workout as an activity, or null if it is left out (a walk) or malformed. */
export function sessionToActivity(data: SessionData): Activity | null {
  const { session } = data;
  const sport = sportOf(session.exerciseType);
  const from = ms(session.startTime);
  const to = ms(session.endTime);
  if (sport === null || !Number.isFinite(from) || !(to > from)) return null;
  const inside = <T extends { time: string }>(samples: T[]) => samples.filter((s) => ms(s.time) >= from && ms(s.time) <= to);

  const heart = inside(data.heartRates.flatMap((r) => r.samples)).sort((a, b) => ms(a.time) - ms(b.time));
  const moving = inside(data.speeds.flatMap((r) => r.samples))
    .map((s) => s.speed.inMetersPerSecond)
    .filter((v) => v > MOVING_MS);
  const elapsedS = Math.round((to - from) / 1000);
  const distanceM = data.distances.reduce((sum, d) => sum + d.distance.inMeters, 0);
  // Health Connect has no moving time, so it is worked out from the speed while moving; stops at lights don't count.
  const movingSpeed = moving.length ? mean(moving) : 0;
  const movingS = distanceM > 0 && movingSpeed > 0 ? Math.min(elapsedS, Math.round(distanceM / movingSpeed)) : elapsedS;
  const start = localIso(from);
  const name = exerciseName(session.exerciseType);

  return {
    id: from,
    name: session.title?.trim() || name,
    sport,
    type: name,
    date: start.slice(0, 10),
    start,
    distanceM,
    movingS,
    elapsedS,
    elevationM: data.elevations.reduce((sum, e) => sum + e.elevation.inMeters, 0),
    avgHr: heart.length ? Math.round(mean(heart.map((s) => s.beatsPerMinute)) * 10) / 10 : undefined,
    maxHr: heart.length ? Math.max(...heart.map((s) => s.beatsPerMinute)) : undefined,
    avgSpeed: movingS > 0 ? distanceM / movingS : 0,
    ...(sport === 'swim' ? { openWater: session.exerciseType === 73 } : {}),
    hr:
      heart.length >= MIN_SAMPLES_FOR_ZONES
        ? histogramFromStream(
            heart.map((s) => (ms(s.time) - from) / 1000),
            heart.map((s) => s.beatsPerMinute),
          )
        : {},
    source: 'health',
  };
}

// Two records of one workout (Strava and Health Connect, or two apps writing to Health Connect) start this close together.
const SAME_WITHIN_MS = 10 * 60 * 1000;
const startOf = (a: Pick<Activity, 'start'>) => new Date(a.start).getTime();

/** The saved activity that is this same workout: the same id, or the same sport started within ten minutes. */
export function findSame(saved: Activity[], a: Pick<Activity, 'id' | 'sport' | 'start'>): Activity | undefined {
  const at = startOf(a);
  return (
    saved.find((s) => s.id === a.id) ??
    saved.find((s) => (s.sport === a.sport || s.sport === 'other' || a.sport === 'other') && Math.abs(startOf(s) - at) <= SAME_WITHIN_MS)
  );
}

/**
 * Whether a Health Connect workout is worth reading in full: it is new, it is recent enough that it may have changed,
 * or it matches a workout saved from Strava that never got its heart rate breakdown.
 */
export function needsReading(session: { startTime: string; exerciseType: number }, saved: Activity[], refreshAfterMs: number): boolean {
  const sport = sportOf(session.exerciseType);
  if (sport === null) return false;
  const from = ms(session.startTime);
  const same = findSame(saved, { id: from, sport, start: localIso(from) });
  if (!same) return true;
  if (same.source === 'health') return from >= refreshAfterMs;
  return same.hr === undefined;
}

/** How much a record of a workout holds, to choose between two of the same one. */
const richness = (a: Activity) => (a.distanceM > 0 ? 2 : 0) + (a.avgHr !== undefined ? 1 : 0) + (a.hr && Object.keys(a.hr).length ? 1 : 0);

/**
 * Adds workouts read from Health Connect to the saved ones, newest first, without ever dropping a saved one. A workout
 * that was saved from Strava stays as it is, with your corrections; Health Connect only fills in a heart rate breakdown
 * Strava never gave. When two apps wrote the same workout, the one with more in it is kept.
 */
export function mergeWorkouts(saved: Activity[], incoming: Activity[]): Activity[] {
  const out = [...saved];
  for (const a of incoming) {
    const same = findSame(out, a);
    const at = same ? out.indexOf(same) : -1;
    if (!same) out.push(a);
    else if (same.source !== 'health') {
      if (same.hr === undefined) out[at] = { ...same, hr: a.hr ?? {}, avgHr: same.avgHr ?? a.avgHr, maxHr: same.maxHr ?? a.maxHr };
    } else if (same.id === a.id || richness(a) > richness(same)) out[at] = a;
  }
  return out.sort((a, b) => b.start.localeCompare(a.start));
}

export interface SessionSummary {
  name: string;
  title: string | null;
  start: string;
  seconds: number;
  origin: string | null;
  device: string | null;
  distanceM: number | null;
  distanceRecords: number;
  heartSamples: number;
  heartAvg: number | null;
  heartMax: number | null;
  /** The typical time between heart rate readings. */
  heartEveryS: number | null;
  speedSamples: number;
  speedAvg: number | null;
  elevationM: number | null;
  kcal: number | null;
}

/** One workout with what was recorded for it. Readings are only counted when they fall inside the workout. */
export function summariseSession(data: SessionData): SessionSummary {
  const { session } = data;
  const from = ms(session.startTime);
  const to = ms(session.endTime);
  const inside = <T extends { time: string }>(samples: T[]) => samples.filter((s) => ms(s.time) >= from && ms(s.time) <= to);

  const heart = inside(data.heartRates.flatMap((r) => r.samples)).sort((a, b) => ms(a.time) - ms(b.time));
  const gaps = heart.slice(1).map((s, i) => (ms(s.time) - ms(heart[i].time)) / 1000);
  const speed = inside(data.speeds.flatMap((r) => r.samples));
  const device = session.metadata?.device;

  return {
    name: exerciseName(session.exerciseType),
    title: session.title ?? null,
    start: session.startTime,
    seconds: (to - from) / 1000,
    origin: session.metadata?.dataOrigin ?? null,
    device: device ? [device.manufacturer, device.model].filter(Boolean).join(' ') || null : null,
    distanceM: data.distances.length ? data.distances.reduce((sum, d) => sum + d.distance.inMeters, 0) : null,
    distanceRecords: data.distances.length,
    heartSamples: heart.length,
    heartAvg: heart.length ? mean(heart.map((s) => s.beatsPerMinute)) : null,
    heartMax: heart.length ? Math.max(...heart.map((s) => s.beatsPerMinute)) : null,
    heartEveryS: median(gaps),
    speedSamples: speed.length,
    speedAvg: speed.length ? mean(speed.map((s) => s.speed.inMetersPerSecond)) : null,
    elevationM: data.elevations.length ? data.elevations.reduce((sum, e) => sum + e.elevation.inMeters, 0) : null,
    kcal: data.calories.length ? data.calories.reduce((sum, c) => sum + c.energy.inKilocalories, 0) : null,
  };
}

/** A workout as a few lines: what it is, then each kind of reading and whether it came through. */
export function describeSession(s: SessionSummary): string[] {
  const when = new Date(s.start).toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const lines = [`${s.name} · ${when} · ${formatClock(s.seconds)}${s.title ? ` · "${s.title}"` : ''}`];
  lines.push(
    s.distanceM === null
      ? '  distance: none'
      : `  distance: ${formatDistance(s.distanceM, s.name.startsWith('Swimming'))} in ${plural(s.distanceRecords, 'record')}`,
  );
  lines.push(
    s.heartSamples === 0
      ? '  heart rate: none'
      : `  heart rate: ${plural(s.heartSamples, 'reading')}${s.heartEveryS ? `, about every ${Math.round(s.heartEveryS)} s` : ''}, average ${Math.round(s.heartAvg!)}, highest ${s.heartMax}`,
  );
  lines.push(s.speedSamples === 0 ? '  speed: none' : `  speed: ${plural(s.speedSamples, 'reading')}, average ${(s.speedAvg! * 3.6).toFixed(1)} km/h`);
  lines.push(s.elevationM === null ? '  elevation: none' : `  elevation: ${Math.round(s.elevationM)} m climbed`);
  lines.push(s.kcal === null ? '  calories: none' : `  calories: ${Math.round(s.kcal)} kcal`);
  lines.push(`  from: ${s.origin ?? 'unknown app'}${s.device ? ` (${s.device})` : ''}`);
  return lines;
}
