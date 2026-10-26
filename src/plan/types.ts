export type Sport = 'swim' | 'bike' | 'run';

/** A brick is a bike straight into a run; a race is all three. */
export type WorkoutKind = Sport | 'brick' | 'race';

export type Phase = 'base' | 'build' | 'peak' | 'taper' | 'race';

/** One leg of a brick or race. */
export interface Leg {
  sport: Sport;
  minutes?: number;
  metres?: number;
}

export interface PlannedWorkout {
  kind: WorkoutKind;
  title: string;
  /** Planned time, for everything except swims and races. */
  minutes?: number;
  /** Planned distance, for swims. */
  metres?: number;
  /** The legs of a brick or race, in order. */
  legs?: Leg[];
  /** Warm-up, main set and cool-down, as written in the plan. */
  steps: string[];
}

export interface PlanWeek {
  week: number;
  phase: Phase;
  recovery: boolean;
  /** Monday to Sunday. An empty day is a rest day. */
  days: PlannedWorkout[][];
}
