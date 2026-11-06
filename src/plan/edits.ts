import { addDays, fromKey, toKey } from '../dates';
import { Schedule } from './schedule';
import { PlannedWorkout } from './types';

/** A session you added yourself, such as a gym workout. */
export interface CustomSession {
  id: string;
  date: string;
  title: string;
  minutes: number;
  notes?: string;
  /** Shared by sessions added together with "repeat every week". */
  series?: string;
}

/**
 * Your changes to the plan, kept apart from it so the plan itself is never altered and any change can be undone.
 * `moves` maps a plan workout's id to the day it has been moved to.
 */
export interface PlanEdits {
  moves: Record<string, string>;
  sessions: CustomSession[];
}

export const NO_EDITS: PlanEdits = { moves: {}, sessions: [] };

/** The plan laid out on the calendar with your moves and added sessions applied. */
export function applyEdits(base: Schedule, edits: PlanEdits): Schedule {
  const out: Schedule = new Map();
  for (const [key, day] of base) out.set(key, { ...day, workouts: [] });

  const moved: [string, PlannedWorkout][] = [];
  for (const day of base.values()) {
    for (const w of day.workouts) {
      const target = w.id ? edits.moves[w.id] : undefined;
      if (target && target !== day.date && w.kind !== 'race' && out.has(target)) moved.push([target, { ...w, movedFrom: day.date }]);
      else out.get(day.date)!.workouts.push(w);
    }
  }
  // Moved workouts and your own sessions go after what was already on the day.
  for (const [date, w] of moved) out.get(date)!.workouts.push(w);
  for (const s of edits.sessions) {
    out.get(s.date)?.workouts.push({
      kind: 'gym',
      title: s.title,
      minutes: s.minutes,
      steps: s.notes ? [s.notes] : [],
      id: `session.${s.id}`,
      custom: true,
      ...(s.series ? { repeats: true } : {}),
    });
  }
  return out;
}

/** Moves a workout to `to`. Moving it back to the day it was planned for removes the change. */
export function setMove(edits: PlanEdits, id: string, to: string, plannedDate: string): PlanEdits {
  const moves = { ...edits.moves };
  if (to === plannedDate) delete moves[id];
  else moves[id] = to;
  return { ...edits, moves };
}

export interface NewSession {
  date: string;
  title: string;
  minutes: number;
  notes?: string;
  /** Add the same session on the same weekday every week until the race. */
  repeatWeekly: boolean;
}

/** The days a session lands on: just `date`, or the same weekday each week up to (not including) the race. */
export function sessionDates(date: string, repeatWeekly: boolean, raceDate: string): string[] {
  if (!repeatWeekly) return [date];
  const dates: string[] = [];
  for (let d = fromKey(date); toKey(d) < raceDate; d = addDays(d, 7)) dates.push(toKey(d));
  return dates;
}

export function addSessions(edits: PlanEdits, input: NewSession, raceDate: string, makeId: () => string): PlanEdits {
  const series = input.repeatWeekly ? makeId() : undefined;
  const added = sessionDates(input.date, input.repeatWeekly, raceDate).map(
    (date): CustomSession => ({ id: makeId(), date, title: input.title, minutes: input.minutes, notes: input.notes || undefined, series }),
  );
  return { ...edits, sessions: [...edits.sessions, ...added] };
}

/** Removes one session, or it and every later one added with it. `sessionId` is the id without the "session." prefix. */
export function removeSession(edits: PlanEdits, sessionId: string, scope: 'one' | 'later'): PlanEdits {
  const target = edits.sessions.find((s) => s.id === sessionId);
  if (!target) return edits;
  const gone = (s: CustomSession) => s.id === sessionId || (scope === 'later' && s.series !== undefined && s.series === target.series && s.date >= target.date);
  return { ...edits, sessions: edits.sessions.filter((s) => !gone(s)) };
}

export const sessionIdOf = (workoutId: string): string => workoutId.replace(/^session\./, '');
