import { addDays, fromKey, toKey } from '../dates';
import { baseline, HealthByDate } from './summary';

// How the morning readiness score is made. Each of these is a judgement call, so they live here where they are easy to change.

/** Sleep scores 0 at this many minutes and 100 at the target. 7.5 hours is a good night for someone training this much. */
const SLEEP_ZERO_MIN = 4 * 60;
const SLEEP_TARGET_MIN = 7.5 * 60;
/** Heart rate while asleep loses 10 points for every bpm above your usual, so +10 bpm scores 0. */
const HR_POINTS_PER_BPM = 10;
/** HRV scores 0 at this share of your usual and 100 at your usual or above. */
const HRV_ZERO_SHARE = 0.7;
/** How much each part counts. A part with nothing to go on is left out and the rest share its weight. */
const WEIGHTS = { sleep: 0.4, heartRate: 0.3, hrv: 0.3 };

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export interface ReadinessPart {
  label: string;
  /** 0 to 100. */
  score: number;
  value: string;
  /** Your usual, when there is one. */
  usual?: string;
}

export interface MorningReadiness {
  /** 0 to 100. */
  score: number;
  tone: 'good' | 'ok' | 'low';
  label: string;
  parts: ReadinessPart[];
  /** Which parts could not be scored, so the score says what it leaves out. */
  missing: string[];
}

const hoursMinutes = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} m`;

/** One number for how ready you look this morning, from last night's sleep, sleeping heart rate and HRV. Null with nothing to go on. */
export function morningReadiness(health: HealthByDate, date: string): MorningReadiness | null {
  const day = health[date];
  if (!day) return null;
  const parts: (ReadinessPart & { weight: number })[] = [];
  const missing: string[] = [];

  if (day.sleep) {
    parts.push({
      label: 'Sleep',
      score: clamp(((day.sleep.asleepMin - SLEEP_ZERO_MIN) / (SLEEP_TARGET_MIN - SLEEP_ZERO_MIN)) * 100),
      value: hoursMinutes(day.sleep.asleepMin),
      weight: WEIGHTS.sleep,
    });
  } else missing.push('sleep');

  const hr = day.sleep?.sleepingHr ?? day.restingHr;
  const hrMetric = day.sleep?.sleepingHr !== undefined ? 'sleepingHr' : 'restingHr';
  const hrUsual = baseline(health, hrMetric, date);
  if (hr !== undefined && hrUsual !== null) {
    parts.push({
      label: 'Heart rate',
      score: clamp(100 - Math.max(0, hr - hrUsual) * HR_POINTS_PER_BPM),
      value: `${Math.round(hr)} bpm`,
      usual: `${Math.round(hrUsual)} bpm`,
      weight: WEIGHTS.heartRate,
    });
  } else missing.push('heart rate');

  const hrvUsual = baseline(health, 'hrv', date);
  if (day.hrv !== undefined && hrvUsual !== null) {
    parts.push({
      label: 'HRV',
      score: clamp(((day.hrv / hrvUsual - HRV_ZERO_SHARE) / (1 - HRV_ZERO_SHARE)) * 100),
      value: `${Math.round(day.hrv)} ms`,
      usual: `${Math.round(hrvUsual)} ms`,
      weight: WEIGHTS.hrv,
    });
  } else missing.push('HRV');

  if (parts.length === 0) return null;
  const weight = parts.reduce((s, p) => s + p.weight, 0);
  const score = Math.round(parts.reduce((s, p) => s + p.score * p.weight, 0) / weight);
  const tone = score >= 70 ? 'good' : score >= 45 ? 'ok' : 'low';
  const label = tone === 'good' ? 'Good to go' : tone === 'ok' ? 'Take it steady' : 'Go easy or rest';
  return { score, tone, label, parts: parts.map(({ weight: _w, ...p }) => p), missing };
}

/** The score for each of the last `days` days up to `to`, null where there was nothing to score. */
export function readinessSeries(health: HealthByDate, to: string, days: number): { date: string; score: number | null }[] {
  return Array.from({ length: days }, (_, i) => {
    const date = toKey(addDays(fromKey(to), i - (days - 1)));
    return { date, score: morningReadiness(health, date)?.score ?? null };
  });
}
