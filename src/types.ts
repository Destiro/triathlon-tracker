/** The disciplines a workout can contain. Transitions are the changeovers between legs of a race or brick. */
export type Sport = 'swim' | 'bike' | 'run' | 'strength' | 'transition';

/** The sports you can choose when logging or tracking. Transitions only appear inside multisport sessions. */
export const TRAINING_SPORTS = ['swim', 'bike', 'run', 'strength'] as const satisfies readonly Sport[];

/** One leg of a workout. A single-sport workout has one segment; a brick or race has several. */
export interface Segment {
  sport: Sport;
  durationSec: number;
  distanceM: number;
  /** Pool lengths swum, for tracked swims. */
  laps?: number;
  elevationGainM?: number;
}

/**
 * A recorded GPS position. `t` is in milliseconds: moving time since the start for tracked routes, so pauses
 * don't count. `brk` marks the first point after a pause, which isn't joined to the point before it.
 */
export interface GeoPoint {
  lat: number;
  lon: number;
  t: number;
  alt?: number;
  brk?: boolean;
}

export interface Workout {
  id: string;
  /** When it started, as an ISO date-time. */
  startedAt: string;
  title?: string;
  segments: Segment[];
  /** Effort from 1 (very easy) to 10 (all out). */
  rpe?: number;
  avgHr?: number;
  notes?: string;
  /** The recorded route, thinned out to keep saved data small. */
  route?: GeoPoint[];
  /** Seconds taken for each whole kilometre, for tracked runs and rides. */
  splitsSec?: number[];
  gearId?: string;
  source: 'manual' | 'tracked';
}

export type RaceDistanceId = 'sprint' | 'olympic' | 'half' | 'full' | 'custom';

export interface Race {
  id: string;
  name: string;
  /** Race day, YYYY-MM-DD. */
  date: string;
  distance: RaceDistanceId;
  /** Leg lengths in metres, used when `distance` is custom. */
  custom?: { swimM: number; bikeM: number; runM: number };
  goalSec?: number;
  notes?: string;
}

export type PlanSport = 'swim' | 'bike' | 'run' | 'brick' | 'strength' | 'rest' | 'race';
export type Intensity = 'rest' | 'easy' | 'moderate' | 'hard' | 'race';
export type Phase = 'base' | 'build' | 'peak' | 'taper' | 'race';

export interface PlanSession {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  sport: PlanSport;
  title: string;
  durationMin: number;
  intensity: Intensity;
  description: string;
}

export interface PlanWeek {
  index: number;
  phase: Phase;
  /** Monday of the week, YYYY-MM-DD. */
  startDate: string;
  /** A lighter week to absorb training. */
  recovery: boolean;
  sessions: PlanSession[];
}

export interface TrainingPlan {
  raceId: string;
  createdAt: string;
  weeklyHours: number;
  weeks: PlanWeek[];
}

export type GearKind = 'shoes' | 'bike' | 'wetsuit' | 'other';

export interface Gear {
  id: string;
  name: string;
  kind: GearKind;
  /** Distance already on it when you added it, in metres. */
  startDistanceM: number;
  /** When to think about replacing it, in metres. */
  limitM?: number;
  retired?: boolean;
}

export type Units = 'metric' | 'imperial';

export interface Settings {
  name: string;
  units: Units;
  poolLengthM: number;
  maxHr?: number;
  restingHr?: number;
  /** Training time you aim for each week, in minutes. */
  weeklyTargetMin: number;
}
