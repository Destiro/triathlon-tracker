import { Race, RaceDistanceId, Workout } from '../types';
import { daysBetween, fromKey } from './dates';

export interface Legs {
  swimM: number;
  bikeM: number;
  runM: number;
}

export const RACE_DISTANCES: Record<Exclude<RaceDistanceId, 'custom'>, { label: string; legs: Legs; t1Sec: number; t2Sec: number }> = {
  sprint: { label: 'Sprint', legs: { swimM: 750, bikeM: 20_000, runM: 5_000 }, t1Sec: 120, t2Sec: 90 },
  olympic: { label: 'Olympic', legs: { swimM: 1_500, bikeM: 40_000, runM: 10_000 }, t1Sec: 180, t2Sec: 120 },
  half: { label: '70.3 (Half)', legs: { swimM: 1_900, bikeM: 90_000, runM: 21_097 }, t1Sec: 300, t2Sec: 240 },
  full: { label: 'Ironman (Full)', legs: { swimM: 3_800, bikeM: 180_000, runM: 42_195 }, t1Sec: 480, t2Sec: 300 },
};

export const raceLabel = (race: Pick<Race, 'distance'>): string =>
  race.distance === 'custom' ? 'Custom' : RACE_DISTANCES[race.distance].label;

/** The legs of a race, from its preset or its custom distances. */
export function raceLegs(race: Pick<Race, 'distance' | 'custom'>): Legs {
  if (race.distance === 'custom') return race.custom ?? { swimM: 0, bikeM: 0, runM: 0 };
  return RACE_DISTANCES[race.distance].legs;
}

/** Days until race day: 0 on the day, negative once it has passed. */
export const daysUntil = (race: Pick<Race, 'date'>, today: Date): number => daysBetween(today, fromKey(race.date));

/** The next race that hasn't happened yet (race day itself counts), or undefined. */
export function nextRace(races: Race[], today: Date): Race | undefined {
  return races.filter((r) => daysUntil(r, today) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
}

/** Paces used when there is no recent training to go on: a steady age-group athlete. */
const FALLBACK = {
  swimSecPer100: 135,
  bikeKmh: 25,
  runSecPerKm: 360,
};

/** How far back to look for training paces. */
const RECENT_DAYS = 60;

export interface LegPrediction {
  sport: 'swim' | 'bike' | 'run';
  distanceM: number;
  durationSec: number;
  /** True when there wasn't enough recent training and a typical pace was used instead. */
  estimated: boolean;
}

export interface Prediction {
  legs: LegPrediction[];
  t1Sec: number;
  t2Sec: number;
  totalSec: number;
}

/**
 * Riegel's formula: how long a distance takes given a known effort over another distance. The exponent makes
 * longer efforts proportionally slower, as fatigue builds.
 */
export const riegel = (knownSec: number, knownM: number, targetM: number, exponent = 1.06): number =>
  knownSec * (targetM / knownM) ** exponent;

/**
 * The best effort for a sport among recent workouts, scaled to the race distance with Riegel's formula.
 * Only sessions at least a quarter of the race distance count, so a short sprint doesn't predict a marathon.
 */
function predictLeg(sport: 'swim' | 'bike' | 'run', distanceM: number, workouts: Workout[], today: Date): LegPrediction {
  if (distanceM <= 0) return { sport, distanceM, durationSec: 0, estimated: false };
  const efforts = workouts
    .filter((w) => {
      const age = daysBetween(new Date(w.startedAt), today);
      return age >= 0 && age <= RECENT_DAYS;
    })
    .flatMap((w) => w.segments.filter((s) => s.sport === sport && s.distanceM >= distanceM / 4 && s.durationSec > 0))
    .map((s) => riegel(s.durationSec, s.distanceM, distanceM, sport === 'bike' ? 1.03 : 1.06));

  if (efforts.length > 0) return { sport, distanceM, durationSec: Math.round(Math.min(...efforts)), estimated: false };

  const fallback =
    sport === 'swim'
      ? (distanceM / 100) * FALLBACK.swimSecPer100
      : sport === 'bike'
        ? (distanceM / 1000 / FALLBACK.bikeKmh) * 3600
        : (distanceM / 1000) * FALLBACK.runSecPerKm;
  return { sport, distanceM, durationSec: Math.round(fallback), estimated: true };
}

/** A finish-time prediction for a race, leg by leg, from your recent training. */
export function predictFinish(race: Pick<Race, 'distance' | 'custom'>, workouts: Workout[], today: Date): Prediction {
  const legs = raceLegs(race);
  const preset = race.distance === 'custom' ? null : RACE_DISTANCES[race.distance];
  const t1Sec = preset?.t1Sec ?? 180;
  const t2Sec = preset?.t2Sec ?? 120;
  const predicted = [
    predictLeg('swim', legs.swimM, workouts, today),
    predictLeg('bike', legs.bikeM, workouts, today),
    predictLeg('run', legs.runM, workouts, today),
  ];
  return { legs: predicted, t1Sec, t2Sec, totalSec: predicted.reduce((s, l) => s + l.durationSec, 0) + t1Sec + t2Sec };
}

/**
 * What each leg needs to take to finish in `goalSec`, sharing the time between swim, bike and run in the same
 * proportions as your predicted race (transitions stay as predicted). Null if the goal leaves no time for them.
 */
export function goalSplits(prediction: Prediction, goalSec: number): Prediction | null {
  const transitions = prediction.t1Sec + prediction.t2Sec;
  const legsSec = prediction.legs.reduce((s, l) => s + l.durationSec, 0);
  if (goalSec <= transitions || legsSec <= 0) return null;
  const scale = (goalSec - transitions) / legsSec;
  const legs = prediction.legs.map((l) => ({ ...l, durationSec: Math.round(l.durationSec * scale) }));
  return { ...prediction, legs, totalSec: legs.reduce((s, l) => s + l.durationSec, 0) + transitions };
}
