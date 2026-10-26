import { GeoPoint, Segment, Sport, Workout } from '../types';
import { acceptFix, elevationGain, Fix, haversine, simplify, splits } from './geo';

/**
 * The live state of a workout being recorded. Kept as plain data and changed only through the functions
 * below, so the timing rules can be tested without a phone.
 */
export type TrackStatus = 'running' | 'paused' | 'finished';

export interface LiveSegment {
  sport: Sport;
  /** Moving time completed before the current running stretch, in ms. */
  elapsedMs: number;
  distanceM: number;
  points: GeoPoint[];
  laps: number;
}

export interface LiveSession {
  status: TrackStatus;
  /** The legs, in order. One for a normal workout; several for a brick or race. */
  legs: Sport[];
  index: number;
  segments: LiveSegment[];
  /** Wall-clock start, ms since epoch. */
  startedAt: number;
  /** When the current running stretch began, or null while paused or finished. */
  resumedAt: number | null;
  poolLengthM: number;
  /** The next GPS point starts a new stretch (after a pause or a new leg). */
  breakNext: boolean;
}

/** Sports whose distance comes from GPS. */
export const usesGps = (sport: Sport): boolean => sport === 'run' || sport === 'bike';

const newSegment = (sport: Sport): LiveSegment => ({ sport, elapsedMs: 0, distanceM: 0, points: [], laps: 0 });

export function startSession(legs: Sport[], now: number, poolLengthM: number): LiveSession {
  if (legs.length === 0) throw new Error('A session needs at least one leg');
  return { status: 'running', legs, index: 0, segments: [newSegment(legs[0])], startedAt: now, resumedAt: now, poolLengthM, breakNext: true };
}

const current = (s: LiveSession) => s.segments[s.index];

/** Moving time of the current leg, in ms. */
export const legElapsed = (s: LiveSession, now: number): number =>
  current(s).elapsedMs + (s.status === 'running' && s.resumedAt !== null ? Math.max(0, now - s.resumedAt) : 0);

/** Moving time of the whole session, in ms. */
export const totalElapsed = (s: LiveSession, now: number): number =>
  s.segments.reduce((sum, seg, i) => sum + (i === s.index ? legElapsed(s, now) : seg.elapsedMs), 0);

const withCurrent = (s: LiveSession, change: (seg: LiveSegment) => LiveSegment): LiveSession => ({
  ...s,
  segments: s.segments.map((seg, i) => (i === s.index ? change(seg) : seg)),
});

/** Banks the running time into the current leg. */
const bank = (s: LiveSession, now: number): LiveSession => withCurrent(s, (seg) => ({ ...seg, elapsedMs: legElapsed(s, now) }));

export function pause(s: LiveSession, now: number): LiveSession {
  if (s.status !== 'running') return s;
  return { ...bank(s, now), status: 'paused', resumedAt: null, breakNext: true };
}

export function resume(s: LiveSession, now: number): LiveSession {
  if (s.status !== 'paused') return s;
  return { ...s, status: 'running', resumedAt: now };
}

/** Moves to the next leg (e.g. swim to T1), or finishes after the last. Starts the clock if paused. */
export function nextLeg(s: LiveSession, now: number): LiveSession {
  if (s.status === 'finished') return s;
  if (s.index >= s.legs.length - 1) return finish(s, now);
  const banked = bank(s, now);
  return {
    ...banked,
    status: 'running',
    index: s.index + 1,
    segments: [...banked.segments, newSegment(s.legs[s.index + 1])],
    resumedAt: now,
    breakNext: true,
  };
}

export function finish(s: LiveSession, now: number): LiveSession {
  if (s.status === 'finished') return s;
  return { ...bank(s, now), status: 'finished', resumedAt: null };
}

/** Counts a pool length on a swim leg. */
export function addLap(s: LiveSession, change = 1): LiveSession {
  if (s.status === 'finished' || current(s).sport !== 'swim') return s;
  return withCurrent(s, (seg) => {
    const laps = Math.max(0, seg.laps + change);
    return { ...seg, laps, distanceM: laps * s.poolLengthM };
  });
}

/**
 * Adds a GPS fix to the current leg if it is a running or riding leg, the clock is going, and the fix looks
 * genuine. The point's time is the session's moving time, so pauses don't distort pace or splits.
 */
export function addFix(s: LiveSession, fix: Omit<Fix, 't'>, now: number): LiveSession {
  const seg = current(s);
  if (s.status !== 'running' || !usesGps(seg.sport)) return s;
  const point: GeoPoint = { lat: fix.lat, lon: fix.lon, t: totalElapsed(s, now), ...(fix.alt != null ? { alt: fix.alt } : {}) };
  const last = s.breakNext ? undefined : seg.points[seg.points.length - 1];
  if (!acceptFix(last, { ...point, accuracy: fix.accuracy }, seg.sport)) return s;
  const step = last ? haversine(last, point) : 0;
  const stored = s.breakNext && seg.points.length > 0 ? { ...point, brk: true } : point;
  return {
    ...withCurrent(s, (x) => ({ ...x, points: [...x.points, stored], distanceM: x.distanceM + step })),
    breakNext: false,
  };
}

/**
 * Turns a finished (or abandoned) session into a workout to save. Legs with no time are dropped. The route
 * is thinned for storage; splits are given for single-leg runs and rides.
 */
export function toWorkout(s: LiveSession, now: number, id: string): Workout {
  const done = finish(s, now);
  const segments: Segment[] = done.segments
    .filter((seg) => seg.elapsedMs >= 1000)
    .map((seg) => ({
      sport: seg.sport,
      durationSec: Math.round(seg.elapsedMs / 1000),
      distanceM: Math.round(seg.distanceM),
      ...(seg.sport === 'swim' && seg.laps > 0 ? { laps: seg.laps } : {}),
      ...(usesGps(seg.sport) ? { elevationGainM: elevationGain(seg.points) } : {}),
    }));
  const allPoints = done.segments.filter((seg) => usesGps(seg.sport)).flatMap((seg, i) => seg.points.map((p, j) => (i > 0 && j === 0 ? { ...p, brk: true } : p)));
  const single = done.segments.length === 1 && usesGps(done.segments[0].sport) ? done.segments[0] : null;
  return {
    id,
    startedAt: new Date(s.startedAt).toISOString(),
    segments,
    source: 'tracked',
    ...(allPoints.length > 1 ? { route: simplify(allPoints) } : {}),
    ...(single && single.points.length > 1 ? { splitsSec: splits(single.points, 1000) } : {}),
  };
}

/** Ready-made activities offered on the tracking screen. */
export const ACTIVITIES: { id: string; label: string; legs: Sport[]; description: string }[] = [
  { id: 'run', label: 'Run', legs: ['run'], description: 'GPS distance, pace and km splits' },
  { id: 'bike', label: 'Ride', legs: ['bike'], description: 'GPS distance, speed and climbing' },
  { id: 'swim', label: 'Pool swim', legs: ['swim'], description: 'Tap a button for each length' },
  { id: 'strength', label: 'Strength', legs: ['strength'], description: 'A timer for gym and core work' },
  { id: 'brick', label: 'Brick', legs: ['bike', 'transition', 'run'], description: 'Bike, transition, then run' },
  { id: 'tri', label: 'Triathlon', legs: ['swim', 'transition', 'bike', 'transition', 'run'], description: 'Race mode: swim, T1, bike, T2, run' },
];
