import { RacePrediction } from './prediction';

// How the pacing plan is made. Each of these is a judgement call, so they live here where they are easy to change.

/** The bike heart rate ceiling, as a share of max heart rate: the top of zone 3. Above it the run suffers. */
export const BIKE_CEILING = 0.8;
/** The run heart rate ceiling: a little higher, since the run is the last leg. */
export const RUN_CEILING = 0.85;
/** The first part of the run is held back this much per km, then you settle to the predicted pace. */
export const RUN_HOLD_BACK_S_PER_KM = 10;
export const RUN_HOLD_BACK_KM = 5;

export interface PacingPlan {
  /** Metres per second for each leg. */
  swim: { speed: number; zones: string };
  bike: { speed: number; ceilingBpm: number };
  run: { speed: number; ceilingBpm: number; startSpeed: number; holdBackKm: number };
  total: number;
}

/** What to aim for on each leg to land the predicted finish, or null until there is a prediction. */
export function pacingPlan(prediction: RacePrediction, maxHr: number): PacingPlan | null {
  const { swim, bike, run, total } = prediction;
  if (total === null || swim.speed === null || bike.speed === null || run.speed === null) return null;
  return {
    swim: { speed: swim.speed, zones: 'zones 2–3' },
    bike: { speed: bike.speed, ceilingBpm: Math.round(maxHr * BIKE_CEILING) },
    run: {
      speed: run.speed,
      ceilingBpm: Math.round(maxHr * RUN_CEILING),
      startSpeed: 1000 / (1000 / run.speed + RUN_HOLD_BACK_S_PER_KM),
      holdBackKm: RUN_HOLD_BACK_KM,
    },
    total,
  };
}
