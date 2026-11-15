import { Activity } from './activities';
import { addDays, fromKey, startOfWeek, toKey } from './dates';
import { HealthByDate } from './health/summary';
import { Discipline } from './plan/types';
import { zoneSeconds } from './zones';

// More ways to look at the workouts and health readings already in the app.

// ---- Time in zones, by week ----

/** Plans built on the 80/20 idea keep about this share of the time in zones 1 and 2. */
export const EASY_TARGET = 0.8;

export interface ZoneWeek {
  week: number;
  /** Seconds in each of the five zones. */
  seconds: number[];
  total: number;
  /** The share of the time spent in zones 1 and 2. */
  easyShare: number;
}

/** Time in each zone for every plan week that has any heart rate breakdowns, week 1 first. */
export function weeklyZones(activities: Activity[], planStart: string, throughWeek: number, maxHr: number): ZoneWeek[] {
  const weeks: ZoneWeek[] = [];
  for (let week = 1; week <= throughWeek; week++) {
    const from = toKey(addDays(fromKey(planStart), (week - 1) * 7));
    const to = toKey(addDays(fromKey(planStart), week * 7 - 1));
    const seconds = [0, 0, 0, 0, 0];
    for (const a of activities) {
      if (!a.hr || a.date < from || a.date > to) continue;
      zoneSeconds(a.hr, maxHr).forEach((s, i) => (seconds[i] += s));
    }
    const total = seconds.reduce((a, b) => a + b, 0);
    if (total > 0) weeks.push({ week, seconds, total, easyShare: (seconds[0] + seconds[1]) / total });
  }
  return weeks;
}

// ---- Heart rate drift ----

/** Under this much drift on a long steady session, the aerobic base is doing its job. */
export const DRIFT_GOOD = 5;
export const DRIFT_HIGH = 8;

/**
 * Cardiac drift in percent: how much the heart rate for each unit of speed rose from the first half to the second.
 * Null for sessions too short or without the readings to say.
 */
export function driftOf(a: Activity): number | null {
  const h = a.halves;
  if (!h || (a.sport !== 'run' && a.sport !== 'bike')) return null;
  return (h.hr2 / h.v2 / (h.hr1 / h.v1) - 1) * 100;
}

export interface DriftSession {
  activity: Activity;
  drift: number;
}

/** The latest long sessions that have a drift figure, newest first. */
export function driftSessions(activities: Activity[], count: number): DriftSession[] {
  return activities
    .map((activity) => ({ activity, drift: driftOf(activity) }))
    .filter((d): d is DriftSession => d.drift !== null)
    .slice(0, count);
}

// ---- Calories ----

export type EnergyBySport = Record<Discipline | 'other', number>;

/** Kilocalories for the Monday-to-Sunday week that contains `dateKey`, by sport. */
export function weekEnergy(activities: Activity[], dateKey: string): { total: number; bySport: EnergyBySport } {
  const from = toKey(startOfWeek(fromKey(dateKey)));
  const to = toKey(addDays(fromKey(from), 6));
  const bySport: EnergyBySport = { swim: 0, bike: 0, run: 0, gym: 0, other: 0 };
  for (const a of activities) if (a.kcal && a.date >= from && a.date <= to) bySport[a.sport] += a.kcal;
  return { total: Object.values(bySport).reduce((a, b) => a + b, 0), bySport };
}

// ---- Month summary ----

export interface MonthTotals {
  seconds: number;
  /** Swim, ride and run distance together, in metres. */
  metres: number;
  sessions: number;
}

const emptyMonth = (): MonthTotals => ({ seconds: 0, metres: 0, sessions: 0 });

export interface MonthSummary {
  /** The month the date is in, as YYYY-MM, and the one before. */
  month: string;
  previousMonth: string;
  thisMonth: MonthTotals;
  /** The previous month over the same number of days, so a part-month isn't compared with a whole one. */
  previousSameDays: MonthTotals;
  /** Seconds in the busiest Monday-to-Sunday week that started this month. */
  biggestWeekS: number;
}

/** This month so far, against the same days of last month. */
export function monthSummary(activities: Activity[], todayKey: string): MonthSummary {
  const today = fromKey(todayKey);
  const month = todayKey.slice(0, 7);
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousMonth = toKey(prev).slice(0, 7);
  const dayOfMonth = today.getDate();

  const thisMonth = emptyMonth();
  const previousSameDays = emptyMonth();
  const weeks = new Map<string, number>();
  for (const a of activities) {
    const target = a.date.slice(0, 7) === month && a.date <= todayKey ? thisMonth : a.date.slice(0, 7) === previousMonth && Number(a.date.slice(8, 10)) <= dayOfMonth ? previousSameDays : null;
    if (!target || a.sport === 'other') continue;
    target.seconds += a.movingS;
    target.sessions += 1;
    if (a.sport !== 'gym') target.metres += a.distanceM;
    if (target === thisMonth) {
      const week = toKey(startOfWeek(fromKey(a.date)));
      weeks.set(week, (weeks.get(week) ?? 0) + a.movingS);
    }
  }
  return { month, previousMonth, thisMonth, previousSameDays, biggestWeekS: Math.max(0, ...weeks.values()) };
}

// ---- What Health Connect is giving the app ----

export interface Coverage {
  label: string;
  /** How many workouts or days have this reading. */
  count: number;
  unit: string;
}

/** For each kind of reading, how much of it has come through, so a feature the watch doesn't share shows up as none. */
export function healthCoverage(health: HealthByDate, activities: Activity[]): Coverage[] {
  const days = Object.values(health);
  const some = (pick: (d: HealthByDate[string]) => unknown) => days.filter((d) => pick(d) !== undefined).length;
  const fromWatch = activities.filter((a) => a.source === 'health');
  return [
    { label: 'Workouts', count: fromWatch.length, unit: 'workouts' },
    { label: 'Sleep', count: some((d) => d.sleep), unit: 'nights' },
    { label: 'Resting heart rate', count: some((d) => d.restingHr), unit: 'days' },
    { label: 'HRV', count: some((d) => d.hrv), unit: 'days' },
    { label: 'VO2 max', count: some((d) => d.vo2Max), unit: 'days' },
    { label: 'Calories', count: fromWatch.filter((a) => a.kcal !== undefined).length, unit: 'workouts' },
    { label: 'Weight', count: some((d) => d.weightKg), unit: 'days' },
    { label: 'Body fat', count: some((d) => d.bodyFat), unit: 'days' },
    { label: 'Blood oxygen', count: some((d) => d.spo2), unit: 'nights' },
    { label: 'Breathing', count: some((d) => d.breathing), unit: 'nights' },
  ];
}

// ---- Body and overnight readings ----

export interface BodyTrend {
  latest: { weightKg?: number; bodyFat?: number; leanKg?: number; date: string };
  /** Change since the earliest reading in the window, for each measure that has two readings. */
  change: { weightKg?: number; bodyFat?: number; leanKg?: number };
  days: number;
}

const BODY_KEYS = ['weightKg', 'bodyFat', 'leanKg'] as const;

/** The latest weight, body fat and lean mass, and how each has moved over the last `days` days. Null with no readings. */
export function bodyTrend(health: HealthByDate, todayKey: string, days: number): BodyTrend | null {
  const from = toKey(addDays(fromKey(todayKey), -(days - 1)));
  const dates = Object.keys(health)
    .filter((d) => d >= from && d <= todayKey && BODY_KEYS.some((k) => health[d][k] !== undefined))
    .sort();
  if (dates.length === 0) return null;
  const latest: BodyTrend['latest'] = { date: dates[dates.length - 1] };
  const change: BodyTrend['change'] = {};
  for (const key of BODY_KEYS) {
    const withKey = dates.filter((d) => health[d][key] !== undefined);
    if (withKey.length === 0) continue;
    latest[key] = health[withKey[withKey.length - 1]][key];
    if (withKey.length > 1) change[key] = Math.round((latest[key]! - health[withKey[0]][key]!) * 10) / 10;
  }
  return { latest, change, days };
}

export interface OvernightTrend {
  nights: number;
  spo2?: number;
  spo2Low?: number;
  breathing?: number;
  /** Your usual breathing rate over the 30 days before, when there is enough to say. */
  breathingUsual?: number;
}

/** Average blood oxygen and breathing over the last `days` nights, with the lowest oxygen reading. Null with no readings. */
export function overnightTrend(health: HealthByDate, todayKey: string, days: number, breathingUsual: number | null): OvernightTrend | null {
  const from = toKey(addDays(fromKey(todayKey), -(days - 1)));
  const recent = Object.keys(health)
    .filter((d) => d >= from && d <= todayKey)
    .map((d) => health[d])
    .filter((d) => d.spo2 !== undefined || d.breathing !== undefined);
  if (recent.length === 0) return null;
  const mean = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined);
  const spo2 = mean(recent.flatMap((d) => (d.spo2 !== undefined ? [d.spo2] : [])));
  const lows = recent.flatMap((d) => (d.spo2Low !== undefined ? [d.spo2Low] : []));
  const breathing = mean(recent.flatMap((d) => (d.breathing !== undefined ? [d.breathing] : [])));
  return {
    nights: recent.length,
    ...(spo2 !== undefined ? { spo2: Math.round(spo2 * 10) / 10 } : {}),
    ...(lows.length ? { spo2Low: Math.min(...lows) } : {}),
    ...(breathing !== undefined ? { breathing: Math.round(breathing * 10) / 10 } : {}),
    ...(breathingUsual !== null ? { breathingUsual: Math.round(breathingUsual * 10) / 10 } : {}),
  };
}
