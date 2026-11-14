import { formatClock, formatDistance } from './format';

// Turns what Health Connect holds into plain sentences, so you can see what your watch really writes there. These
// functions take plain data, not the native library, so they can be tested without a phone.

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

const SLEEP_STAGE_NAMES: Record<number, string> = {
  0: 'Unknown',
  1: 'Awake',
  2: 'Sleeping',
  3: 'Out of bed',
  4: 'Light',
  5: 'Deep',
  6: 'REM',
};

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

/** How much of one kind of record exists, and which apps wrote it. */
export interface RecordOverview {
  type: string;
  count: number;
  first: string | null;
  last: string | null;
  origins: string[];
}

export function overviewOf(type: string, records: { startTime?: string; time?: string; metadata?: Origin }[]): RecordOverview {
  const times = records.map((r) => r.startTime ?? r.time).filter((t): t is string => Boolean(t)).sort();
  const origins = [...new Set(records.map((r) => r.metadata?.dataOrigin).filter((o): o is string => Boolean(o)))];
  return { type, count: records.length, first: times[0] ?? null, last: times[times.length - 1] ?? null, origins };
}

export function describeOverview(o: RecordOverview): string {
  if (o.count === 0) return `${o.type}: none`;
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
  return `${o.type}: ${plural(o.count, 'record')}, ${day(o.first!)} to ${day(o.last!)}, from ${o.origins.join(', ') || 'unknown app'}`;
}

/** One night's sleep: how long, and how long in each stage. */
export function describeSleep(session: { startTime: string; endTime: string; stages?: { startTime: string; endTime: string; stage: number }[] }): string {
  const total = (ms(session.endTime) - ms(session.startTime)) / 1000;
  const day = new Date(session.endTime).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
  const stages = session.stages ?? [];
  if (stages.length === 0) return `${day}: ${formatClock(total)} asleep, no stages`;
  const byStage = new Map<number, number>();
  for (const s of stages) byStage.set(s.stage, (byStage.get(s.stage) ?? 0) + (ms(s.endTime) - ms(s.startTime)) / 1000);
  const parts = [...byStage.entries()].sort((a, b) => a[0] - b[0]).map(([stage, seconds]) => `${SLEEP_STAGE_NAMES[stage] ?? `stage ${stage}`} ${Math.round(seconds / 60)} min`);
  return `${day}: ${formatClock(total)} in bed, ${parts.join(', ')}`;
}
