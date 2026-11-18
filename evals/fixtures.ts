import { Activity, byDate } from '../src/activities';
import { applyProposal, CoachData, Proposal } from '../src/coach/tools';
import { addIssue, HealthIssue, Notes, resolveIssue, setNote } from '../src/notes';
import { addSessions, applyEdits, NO_EDITS, PlanEdits, removeSession, setMove } from '../src/plan/edits';
import { buildSchedule, Schedule } from '../src/plan/schedule';
import { DEFAULT_SETTINGS, Settings } from '../src/settings';

// The athlete the coach is tested against, shared by the unit tests and the evals so both see the same world.
// Friday 6 November 2026, week 3: the morning swim is in, the run is still to do, a gym session of their own repeats
// on Thursdays, last night's sleep was short and a head cold started on Wednesday.

export const TODAY = '2026-11-06';

function activity(a: Partial<Activity> & Pick<Activity, 'id' | 'sport' | 'date' | 'name'>): Activity {
  return { type: a.sport, start: `${a.date}T07:00:00`, distanceM: 0, movingS: 0, elapsedS: a.movingS ?? 0, elevationM: 0, avgSpeed: 0, ...a };
}

const night = (asleepMin: number, sleepingHr: number) => ({ start: '', end: '', asleepMin, awakeMin: 20, deepMin: 60, remMin: 80, lightMin: asleepMin - 140, sleepingHr });

export interface World {
  settings: Settings;
  base: Schedule;
  edits: PlanEdits;
  activities: Activity[];
  health: CoachData['health'];
  notes: Notes;
  issues: HealthIssue[];
  todayKey: string;
}

export function makeWorld(): World {
  const settings: Settings = { ...DEFAULT_SETTINGS, planStart: '2026-10-19', raceDate: '2027-03-06' };
  let n = 0;
  return {
    settings,
    todayKey: TODAY,
    base: buildSchedule(settings.planStart, settings.raceDate, settings.raceName),
    edits: addSessions(NO_EDITS, { date: '2026-11-05', title: 'Gym: legs', minutes: 45, repeatWeekly: true }, settings.raceDate, () => `s${n++}`),
    activities: [
      activity({ id: 1, sport: 'swim', date: '2026-11-06', name: 'Morning Swim', distanceM: 1300, movingS: 1880, avgSpeed: 0.69, avgHr: 138 }),
      activity({ id: 2, sport: 'bike', date: '2026-11-05', name: 'Evening Ride', distanceM: 31000, movingS: 3600, avgSpeed: 8.6, avgHr: 131, elevationM: 240 }),
    ],
    health: {
      '2026-11-05': { date: '2026-11-05', sleep: night(430, 52), hrv: 61, restingHr: 49 },
      '2026-11-06': { date: '2026-11-06', sleep: night(310, 58), hrv: 44, restingHr: 54 },
    },
    notes: {},
    issues: [{ id: 'cold', kind: 'illness', title: 'Head cold', start: '2026-11-04', severity: 1 }],
  };
}

/** What the coach sees of a world, as the store would give it. */
export function dataOf(world: World): CoachData {
  return {
    todayKey: world.todayKey,
    settings: world.settings,
    schedule: applyEdits(world.base, world.edits),
    activities: world.activities,
    activitiesByDate: byDate(world.activities),
    health: world.health,
    notes: world.notes,
    issues: world.issues,
  };
}

/** The world after the athlete taps Apply on a proposal, made with the same functions the store uses. */
export function applyInWorld(world: World, proposal: Proposal): World {
  const next = { ...world };
  let id = 0;
  applyProposal(proposal, {
    moveWorkout: (workoutId, to, plannedDate) => (next.edits = setMove(next.edits, workoutId, to, plannedDate)),
    addSession: (input) => (next.edits = addSessions(next.edits, input, world.settings.raceDate, () => `added${id++}`)),
    removeSession: (sessionId, scope) => (next.edits = removeSession(next.edits, sessionId, scope)),
    saveNote: (workoutId, note) => (next.notes = setNote(next.notes, workoutId, note)),
    logIssue: (input) => (next.issues = addIssue(next.issues, input, `issue${id++}`)),
    clearIssue: (issueId, end) => (next.issues = resolveIssue(next.issues, issueId, end)),
  });
  return next;
}

/** The athlete as the unit tests know them. */
export const coachData = (): CoachData => dataOf(makeWorld());
