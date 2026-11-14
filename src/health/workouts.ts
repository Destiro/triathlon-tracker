import { formatClock, formatDistance } from '../format';

// Turns the workouts Health Connect holds into plain sentences, so you can see what your watch really writes there.
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
