import { addDays, fromKey, toKey } from '../dates';

/** Health Connect's sleep stage numbers (SleepStageType). */
export const STAGE = { UNKNOWN: 0, AWAKE: 1, SLEEPING: 2, OUT_OF_BED: 3, LIGHT: 4, DEEP: 5, REM: 6 } as const;

export interface RawSleep {
  startTime: string;
  endTime: string;
  stages?: { startTime: string; endTime: string; stage: number }[];
}

export interface Night {
  /** When you fell asleep and woke up, as ISO times. */
  start: string;
  end: string;
  /** Minutes actually asleep: in bed minus awake. */
  asleepMin: number;
  awakeMin: number;
  /** Zero when the watch didn't record stages. */
  deepMin: number;
  remMin: number;
  lightMin: number;
  /** Average heart rate while asleep, when there is heart rate for the night. */
  sleepingHr?: number;
}

/** What the watch knows about one day, keyed by the date you woke up on. */
export interface HealthDay {
  date: string;
  sleep?: Night;
  vo2Max?: number;
  restingHr?: number;
  /** Overnight heart rate variability (RMSSD), in milliseconds. */
  hrv?: number;
}

export type HealthByDate = Record<string, HealthDay>;

const minutesBetween = (a: string, b: string) => Math.max(0, (Date.parse(b) - Date.parse(a)) / 60000);

// Two pieces of sleep this close together are one night with a trip to the bathroom.
const SAME_NIGHT_GAP_MIN = 120;
// Shorter than this on its own is a nap, not a night.
const MIN_NIGHT_MIN = 180;

/**
 * Turns sleep sessions into one night per wake-up date. A night split by getting up is joined back together;
 * naps are left out, so a lie-down in the afternoon doesn't count as last night's sleep.
 */
export function summarizeSleep(sessions: RawSleep[]): Record<string, Night> {
  const sorted = [...sessions].filter((s) => Date.parse(s.endTime) > Date.parse(s.startTime)).sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Join sessions that follow on from each other.
  const groups: RawSleep[][] = [];
  for (const s of sorted) {
    const last = groups[groups.length - 1];
    if (last && minutesBetween(last[last.length - 1].endTime, s.startTime) <= SAME_NIGHT_GAP_MIN) last.push(s);
    else groups.push([s]);
  }

  const nights: Record<string, Night> = {};
  for (const group of groups) {
    const start = group[0].startTime;
    const end = group[group.length - 1].endTime;
    let deep = 0;
    let rem = 0;
    let light = 0;
    let awake = 0;
    let asleep = 0;
    for (const s of group) {
      const sum = { deep: 0, rem: 0, light: 0, awake: 0 };
      for (const st of s.stages ?? []) {
        const m = minutesBetween(st.startTime, st.endTime);
        if (st.stage === STAGE.DEEP) sum.deep += m;
        else if (st.stage === STAGE.REM) sum.rem += m;
        // Plain "sleeping" comes from watches that can't tell the stages apart; it is counted as light.
        else if (st.stage === STAGE.LIGHT || st.stage === STAGE.SLEEPING) sum.light += m;
        else if (st.stage === STAGE.AWAKE || st.stage === STAGE.OUT_OF_BED) sum.awake += m;
      }
      const staged = sum.deep + sum.rem + sum.light;
      // No usable stages: the whole session counts as sleep.
      if (staged === 0) {
        asleep += minutesBetween(s.startTime, s.endTime) - sum.awake;
        awake += sum.awake;
        continue;
      }
      deep += sum.deep;
      rem += sum.rem;
      light += sum.light;
      awake += sum.awake;
      asleep += staged;
    }
    if (asleep < MIN_NIGHT_MIN) continue;

    const date = toKey(new Date(end));
    // Keep the longest if two nights somehow end on the same date.
    if (nights[date] && nights[date].asleepMin >= asleep) continue;
    nights[date] = {
      start,
      end,
      asleepMin: Math.round(asleep),
      awakeMin: Math.round(awake),
      deepMin: Math.round(deep),
      remMin: Math.round(rem),
      lightMin: Math.round(light),
    };
  }
  return nights;
}

export interface Reading {
  time: string;
  value: number;
}

/**
 * One value per day from readings taken through the day. VO2 max keeps the latest, resting heart rate the lowest
 * and heart rate variability the average, which is how each one is normally reported.
 */
export function perDay(readings: Reading[], pick: 'latest' | 'lowest' | 'average'): Record<string, number> {
  const byDay = new Map<string, Reading[]>();
  for (const r of readings) {
    if (!Number.isFinite(r.value) || r.value <= 0) continue;
    const key = toKey(new Date(r.time));
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }
  const out: Record<string, number> = {};
  for (const [key, list] of byDay) {
    const values = list.map((r) => r.value);
    out[key] =
      pick === 'lowest'
        ? Math.min(...values)
        : pick === 'average'
          ? values.reduce((a, b) => a + b, 0) / values.length
          : [...list].sort((a, b) => a.time.localeCompare(b.time))[list.length - 1].value;
  }
  return out;
}

/** Puts freshly read days over saved ones. A day read again replaces only what the new read has, so nothing is lost. */
export function mergeHealth(saved: HealthByDate, incoming: HealthByDate): HealthByDate {
  const out = { ...saved };
  for (const [date, day] of Object.entries(incoming)) {
    const defined = Object.fromEntries(Object.entries(day).filter(([, v]) => v !== undefined));
    out[date] = { ...out[date], ...defined, date };
  }
  return out;
}

/** Builds days from the separate kinds of reading. */
export function combine(parts: {
  nights?: Record<string, Night>;
  vo2Max?: Record<string, number>;
  restingHr?: Record<string, number>;
  hrv?: Record<string, number>;
}): HealthByDate {
  const out: HealthByDate = {};
  const day = (date: string) => (out[date] ??= { date });
  for (const [date, night] of Object.entries(parts.nights ?? {})) day(date).sleep = night;
  for (const [date, v] of Object.entries(parts.vo2Max ?? {})) day(date).vo2Max = Math.round(v * 10) / 10;
  for (const [date, v] of Object.entries(parts.restingHr ?? {})) day(date).restingHr = Math.round(v);
  for (const [date, v] of Object.entries(parts.hrv ?? {})) day(date).hrv = Math.round(v);
  return out;
}

/** Every day from `from` to `to`, in order, with whatever is known about it. */
export function healthSeries(health: HealthByDate, from: string, to: string): HealthDay[] {
  const out: HealthDay[] = [];
  for (let d = fromKey(from); toKey(d) <= to; d = addDays(d, 1)) out.push(health[toKey(d)] ?? { date: toKey(d) });
  return out;
}

/** The most recent value of something, and the day it is from. */
export function latest<K extends 'vo2Max' | 'restingHr' | 'hrv'>(health: HealthByDate, key: K, upTo: string): { date: string; value: number } | null {
  const dates = Object.keys(health)
    .filter((d) => d <= upTo && health[d][key] !== undefined)
    .sort();
  const date = dates[dates.length - 1];
  return date ? { date, value: health[date][key] as number } : null;
}

const BASELINE_DAYS = 30;
// A baseline from fewer days than this is mostly noise.
const MIN_BASELINE_DAYS = 7;

type Metric = 'asleepMin' | 'sleepingHr' | 'restingHr' | 'hrv';

const valueOf = (day: HealthDay | undefined, metric: Metric): number | undefined =>
  metric === 'asleepMin' || metric === 'sleepingHr' ? day?.sleep?.[metric] : day?.[metric];

/** Your normal for something: the average over the 30 days before `date`, not counting that day. */
export function baseline(health: HealthByDate, metric: Metric, date: string): number | null {
  const values: number[] = [];
  for (let i = 1; i <= BASELINE_DAYS; i++) {
    const v = valueOf(health[toKey(addDays(fromKey(date), -i))], metric);
    if (v !== undefined) values.push(v);
  }
  return values.length >= MIN_BASELINE_DAYS ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export interface Recovery {
  tone: 'good' | 'ok' | 'low';
  text: string;
}

/**
 * A plain read of how recovered you look this morning, from heart rate and HRV against your own 30-day normal and
 * how long you slept. Null until there is enough history to compare with.
 */
export function recovery(health: HealthByDate, date: string): Recovery | null {
  const today = health[date];
  if (!today) return null;
  const flags: string[] = [];
  let checks = 0;

  const hr = today.sleep?.sleepingHr ?? today.restingHr;
  const hrMetric: Metric = today.sleep?.sleepingHr !== undefined ? 'sleepingHr' : 'restingHr';
  const hrBase = baseline(health, hrMetric, date);
  if (hr !== undefined && hrBase !== null) {
    checks++;
    if (hr - hrBase >= 5) flags.push(`heart rate ${Math.round(hr - hrBase)} bpm above normal`);
  }
  const hrvBase = baseline(health, 'hrv', date);
  if (today.hrv !== undefined && hrvBase !== null) {
    checks++;
    if (today.hrv < hrvBase * 0.85) flags.push(`HRV ${Math.round((1 - today.hrv / hrvBase) * 100)}% below normal`);
  }
  if (today.sleep) {
    checks++;
    if (today.sleep.asleepMin < 6 * 60) flags.push('under 6 hours of sleep');
  }
  if (checks === 0 || (hrBase === null && hrvBase === null)) return null;

  if (flags.length >= 2) return { tone: 'low', text: `Under-recovered: ${flags.join(', ')}. Keep today easy if you can.` };
  if (flags.length === 1) return { tone: 'ok', text: `Mostly recovered, but ${flags[0]}.` };
  return { tone: 'good', text: 'Well recovered: heart rate and sleep look normal for you.' };
}
