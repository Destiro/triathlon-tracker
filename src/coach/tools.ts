import { Activity } from '../activities';
import { addDays, daysBetween, fromKey, isDateKey, toKey } from '../dates';
import { formatDistance, formatMinutes } from '../format';
import { morningReadiness } from '../health/readiness';
import { HealthByDate } from '../health/summary';
import { activeIssues, HealthIssue, Notes } from '../notes';
import { NewSession, sessionIdOf } from '../plan/edits';
import { PHASE_LABELS, Schedule, TOTAL_WEEKS } from '../plan/schedule';
import { PlannedWorkout } from '../plan/types';
import { Settings } from '../settings';
import { dayResult, SPORTS, weekCompliance, weekMinutes, weekVolume } from '../stats';
import { ToolDef } from './api';

/** What the coach can look at: the same data the screens draw, as it is when a message is sent. */
export interface CoachData {
  todayKey: string;
  settings: Settings;
  schedule: Schedule;
  activities: Activity[];
  activitiesByDate: Map<string, Activity[]>;
  health: HealthByDate;
  notes: Notes;
  issues: HealthIssue[];
}

/** A change the coach wants to make. Nothing is saved until you tap Apply on its card. */
export type Proposal =
  | { kind: 'move'; workoutId: string; title: string; from: string; to: string; plannedDate: string }
  | { kind: 'add'; session: NewSession }
  | { kind: 'remove'; sessionId: string; title: string; date: string; scope: 'one' | 'later' };

/** What the screen's store can do, so a proposal can be applied without the coach knowing about React. */
export interface CoachActions {
  moveWorkout: (id: string, to: string, plannedDate: string) => void;
  addSession: (input: NewSession) => void;
  removeSession: (sessionId: string, scope: 'one' | 'later') => void;
}

export interface ToolOutcome {
  /** Sent back to Claude as the tool result. */
  result: string;
  isError?: boolean;
  proposal?: Proposal;
}

// Lookups are capped so one question can't send months of data and run up the bill.
const MAX_PLAN_DAYS = 42;
const MAX_ACTIVITY_DAYS = 120;
const MAX_HEALTH_DAYS = 60;

const PROPOSED =
  'Shown to the athlete as a card with Apply and Cancel. Nothing is saved yet: do not say it is done. A later message from the app says what they chose.';

const dateField = (description: string) => ({ type: 'string', description: `${description} YYYY-MM-DD.` });

export const READ_TOOLS: ToolDef[] = [
  {
    name: 'get_overview',
    description:
      "Today's date, where the athlete is in the 20-week plan, the race and days to go, today's workouts and their status, and any injury or illness that is on now. Call this first in a conversation.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_plan',
    description: `Planned workouts for a range of days (at most ${MAX_PLAN_DAYS}), with each workout's id, steps and status: done, partial, missed, today or upcoming. Use the ids to move or remove workouts.`,
    input_schema: {
      type: 'object',
      properties: { from: dateField('First day.'), to: dateField('Last day, inclusive.') },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_week_summary',
    description: 'One plan week: planned against done swim distance and ride and run time, how many due workouts were done, and planned hours.',
    input_schema: {
      type: 'object',
      properties: { week: { type: 'integer', minimum: 1, maximum: TOTAL_WEEKS, description: `Plan week, 1 to ${TOTAL_WEEKS}.` } },
      required: ['week'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_activities',
    description: `Workouts the watch recorded in a range of days (at most ${MAX_ACTIVITY_DAYS}): distance, time, pace or speed, heart rate, climbing and energy. Optionally one sport.`,
    input_schema: {
      type: 'object',
      properties: {
        from: dateField('First day.'),
        to: dateField('Last day, inclusive.'),
        sport: { type: 'string', enum: ['swim', 'bike', 'run', 'gym'] },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_health',
    description: `Sleep, sleeping and resting heart rate, HRV, VO2 max, weight and the morning readiness score (0 to 100) by day, for a range of days (at most ${MAX_HEALTH_DAYS}). Days with nothing recorded are left out.`,
    input_schema: {
      type: 'object',
      properties: { from: dateField('First day.'), to: dateField('Last day, inclusive.') },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
];

export const PLAN_TOOLS: ToolDef[] = [
  {
    name: 'move_workout',
    description: 'Propose moving a planned workout to another day. The athlete confirms it on a card. Race days cannot be moved; use the id from get_plan.',
    input_schema: {
      type: 'object',
      properties: { workout_id: { type: 'string' }, to_date: dateField('The new day.') },
      required: ['workout_id', 'to_date'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_session',
    description:
      "Propose adding a session of the athlete's own, such as gym or mobility, on a day. It is saved as a timed session, not a swim, ride or run. The athlete confirms it on a card.",
    input_schema: {
      type: 'object',
      properties: {
        date: dateField('The day.'),
        title: { type: 'string', description: 'Short name, such as "Gym: legs".' },
        minutes: { type: 'integer', minimum: 5, maximum: 300 },
        notes: { type: 'string', description: 'Optional: what to do.' },
        repeat_weekly: { type: 'boolean', description: 'Also add it on the same weekday every week until the race.' },
      },
      required: ['date', 'title', 'minutes'],
      additionalProperties: false,
    },
  },
  {
    name: 'remove_session',
    description:
      "Propose removing one of the athlete's own sessions (custom: true in get_plan). Plan workouts can't be removed, only moved. The athlete confirms it on a card.",
    input_schema: {
      type: 'object',
      properties: {
        workout_id: { type: 'string' },
        scope: { type: 'string', enum: ['one', 'later'], description: '"later" also removes the later weeks of a repeating session.' },
      },
      required: ['workout_id'],
      additionalProperties: false,
    },
  },
];

export const TOOLS: ToolDef[] = [...READ_TOOLS, ...PLAN_TOOLS];

// ---- Reading ----

const round = (n: number, places = 0) => Math.round(n * 10 ** places) / 10 ** places;
const weekday = (key: string) => fromKey(key).toLocaleDateString('en-NZ', { weekday: 'long' });

/** "1,200 m", "1 h 15", or the legs of a brick or race. */
export function amountOf(w: PlannedWorkout): string {
  if (w.kind === 'swim' && w.metres) return formatDistance(w.metres, true);
  if (w.legs?.length) return w.legs.map((l) => `${l.sport} ${l.metres ? formatDistance(l.metres) : formatMinutes(l.minutes ?? 0)}`).join(', ');
  return w.minutes ? formatMinutes(w.minutes) : '';
}

function planDay(data: CoachData, date: string) {
  const day = data.schedule.get(date);
  if (!day) return { date, inPlan: false };
  const { results, extras } = dayResult(data.schedule, data.activitiesByDate, date, data.todayKey);
  return {
    date,
    weekday: weekday(date),
    week: day.week,
    phase: PHASE_LABELS[day.phase],
    ...(day.recovery ? { recoveryWeek: true } : {}),
    workouts: results.map(({ workout: w, status }) => ({
      id: w.id,
      kind: w.kind,
      title: w.title,
      planned: amountOf(w),
      steps: w.steps,
      status,
      ...(w.movedFrom ? { movedFrom: w.movedFrom } : {}),
      ...(w.custom ? { custom: true } : {}),
      ...(w.repeats ? { repeatsWeekly: true } : {}),
    })),
    ...(extras.length ? { notInPlan: extras.map((a) => a.name) } : {}),
  };
}

function activitySummary(a: Activity) {
  const minutes = a.movingS / 60;
  const pace =
    a.avgSpeed > 0 && a.sport === 'run'
      ? { paceMinPerKm: round(1000 / a.avgSpeed / 60, 2) }
      : a.avgSpeed > 0 && a.sport === 'swim'
        ? { paceMinPer100m: round(100 / a.avgSpeed / 60, 2) }
        : a.avgSpeed > 0 && a.sport === 'bike'
          ? { speedKmh: round(a.avgSpeed * 3.6, 1) }
          : {};
  return {
    id: a.id,
    date: a.date,
    name: a.name,
    sport: a.sport,
    ...(a.distanceM > 0 ? { distanceKm: round(a.distanceM / 1000, 2) } : {}),
    movingMin: round(minutes),
    ...pace,
    ...(a.avgHr ? { avgHr: Math.round(a.avgHr) } : {}),
    ...(a.maxHr ? { maxHr: Math.round(a.maxHr) } : {}),
    ...(a.elevationM > 0 ? { climbM: Math.round(a.elevationM) } : {}),
    ...(a.kcal ? { kcal: Math.round(a.kcal) } : {}),
    ...(a.sport === 'swim' && a.openWater !== undefined ? { openWater: a.openWater } : {}),
  };
}

/** Every day from `from` to `to`, or an error message when the range is unusable. */
function range(input: Record<string, unknown>, max: number): string[] | string {
  const { from, to } = input;
  if (typeof from !== 'string' || typeof to !== 'string' || !isDateKey(from) || !isDateKey(to)) return 'from and to must be dates as YYYY-MM-DD.';
  if (to < from) return 'to is before from.';
  const days = daysBetween(fromKey(from), fromKey(to)) + 1;
  if (days > max) return `That is ${days} days; ask for ${max} or fewer at a time.`;
  return Array.from({ length: days }, (_, i) => toKey(addDays(fromKey(from), i)));
}

function overview(data: CoachData) {
  const { todayKey, settings, schedule } = data;
  const today = schedule.get(todayKey);
  return {
    today: todayKey,
    weekday: weekday(todayKey),
    plan: today
      ? { week: today.week, of: TOTAL_WEEKS, phase: PHASE_LABELS[today.phase], recoveryWeek: today.recovery, started: settings.planStart }
      : { note: todayKey < settings.planStart ? `The plan starts on ${settings.planStart}.` : 'The plan has finished.' },
    race: { name: settings.raceName, date: settings.raceDate, daysToGo: daysBetween(fromKey(todayKey), fromKey(settings.raceDate)) },
    todaysWorkouts: (() => {
      const day = planDay(data, todayKey);
      return 'workouts' in day ? day.workouts : [];
    })(),
    injuryOrIllnessNow: activeIssues(data.issues, todayKey).map((i) => ({ kind: i.kind, title: i.title, since: i.start, severity: i.severity })),
    heartRate: { max: settings.maxHr, resting: settings.restHr },
    units: 'Swims in metres; rides, runs, bricks and own sessions in minutes.',
  };
}

function weekSummary(data: CoachData, week: number) {
  const volume = weekVolume(data.schedule, data.activitiesByDate, week);
  const compliance = weekCompliance(data.schedule, data.activitiesByDate, week, data.todayKey);
  return {
    week,
    plannedHours: round(weekMinutes(data.schedule, week) / 60, 1),
    ...Object.fromEntries(
      SPORTS.map((s) => [s, s === 'swim' ? { plannedM: Math.round(volume[s].planned), doneM: Math.round(volume[s].actual) } : { plannedMin: Math.round(volume[s].planned), doneMin: Math.round(volume[s].actual) }]),
    ),
    workoutsDue: compliance.due,
    workoutsDone: compliance.score,
  };
}

function healthDays(data: CoachData, days: string[]) {
  return days.flatMap((date) => {
    const d = data.health[date];
    if (!d) return [];
    const readiness = morningReadiness(data.health, date);
    const row = {
      date,
      ...(d.sleep ? { asleepHours: round(d.sleep.asleepMin / 60, 1), ...(d.sleep.sleepingHr ? { sleepingHr: Math.round(d.sleep.sleepingHr) } : {}) } : {}),
      ...(d.restingHr ? { restingHr: d.restingHr } : {}),
      ...(d.hrv ? { hrvMs: Math.round(d.hrv) } : {}),
      ...(d.vo2Max ? { vo2Max: d.vo2Max } : {}),
      ...(d.weightKg ? { weightKg: d.weightKg } : {}),
      ...(readiness ? { readiness: readiness.score } : {}),
    };
    return Object.keys(row).length > 1 ? [row] : [];
  });
}

// ---- Proposing changes ----

function findWorkout(data: CoachData, id: unknown): { date: string; workout: PlannedWorkout } | null {
  if (typeof id !== 'string') return null;
  for (const day of data.schedule.values()) {
    const workout = day.workouts.find((w) => w.id === id);
    if (workout) return { date: day.date, workout };
  }
  return null;
}

const fail = (result: string): ToolOutcome => ({ result, isError: true });

function proposeMove(data: CoachData, input: Record<string, unknown>): ToolOutcome {
  const found = findWorkout(data, input.workout_id);
  if (!found) return fail('No workout has that id. Look it up with get_plan.');
  const { date, workout } = found;
  if (workout.custom) return fail("That is one of the athlete's own sessions; those can't be moved. Remove it and add it on the new day instead.");
  if (workout.kind === 'race') return fail('Races stay on their day.');
  const to = input.to_date;
  if (typeof to !== 'string' || !isDateKey(to)) return fail('to_date must be a date as YYYY-MM-DD.');
  if (!data.schedule.has(to)) return fail(`${to} is outside the plan (${data.settings.planStart} to ${data.settings.raceDate}).`);
  if (to === date) return fail(`It is already on ${to}.`);
  const proposal: Proposal = { kind: 'move', workoutId: workout.id!, title: workout.title, from: date, to, plannedDate: workout.movedFrom ?? date };
  return { result: PROPOSED, proposal };
}

function proposeAdd(data: CoachData, input: Record<string, unknown>): ToolOutcome {
  const { date, title, minutes, notes, repeat_weekly } = input;
  if (typeof date !== 'string' || !isDateKey(date)) return fail('date must be a date as YYYY-MM-DD.');
  if (!data.schedule.has(date)) return fail(`${date} is outside the plan.`);
  if (typeof title !== 'string' || !title.trim()) return fail('Give the session a title.');
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 5 || minutes > 300) return fail('minutes must be from 5 to 300.');
  const session: NewSession = {
    date,
    title: title.trim().slice(0, 60),
    minutes: Math.round(minutes),
    repeatWeekly: repeat_weekly === true,
    ...(typeof notes === 'string' && notes.trim() ? { notes: notes.trim() } : {}),
  };
  return { result: PROPOSED, proposal: { kind: 'add', session } };
}

function proposeRemove(data: CoachData, input: Record<string, unknown>): ToolOutcome {
  const found = findWorkout(data, input.workout_id);
  if (!found) return fail('No workout has that id. Look it up with get_plan.');
  if (!found.workout.custom) return fail("Only the athlete's own sessions can be removed. Plan workouts can be moved instead.");
  const scope = input.scope === 'later' && found.workout.repeats ? 'later' : 'one';
  return { result: PROPOSED, proposal: { kind: 'remove', sessionId: sessionIdOf(found.workout.id!), title: found.workout.title, date: found.date, scope } };
}

/** Runs one tool. Reads answer straight away; changes come back as a proposal for the athlete to confirm. */
export function runTool(name: string, input: Record<string, unknown>, data: CoachData): ToolOutcome {
  const json = (value: unknown): ToolOutcome => ({ result: JSON.stringify(value) });
  try {
    switch (name) {
      case 'get_overview':
        return json(overview(data));
      case 'get_plan': {
        const days = range(input, MAX_PLAN_DAYS);
        return typeof days === 'string' ? fail(days) : json(days.map((d) => planDay(data, d)));
      }
      case 'get_week_summary': {
        const week = input.week;
        if (typeof week !== 'number' || !Number.isInteger(week) || week < 1 || week > TOTAL_WEEKS) return fail(`week must be 1 to ${TOTAL_WEEKS}.`);
        return json(weekSummary(data, week));
      }
      case 'get_activities': {
        const days = range(input, MAX_ACTIVITY_DAYS);
        if (typeof days === 'string') return fail(days);
        const [from, to] = [days[0], days[days.length - 1]];
        const list = data.activities.filter((a) => a.date >= from && a.date <= to && (!input.sport || a.sport === input.sport));
        return json(list.map(activitySummary));
      }
      case 'get_health': {
        const days = range(input, MAX_HEALTH_DAYS);
        return typeof days === 'string' ? fail(days) : json(healthDays(data, days));
      }
      case 'move_workout':
        return proposeMove(data, input);
      case 'add_session':
        return proposeAdd(data, input);
      case 'remove_session':
        return proposeRemove(data, input);
      default:
        return fail(`There is no tool called ${name}.`);
    }
  } catch {
    // A bug in a lookup should cost one answer, not the whole chat.
    return fail('That lookup failed in the app. Try a different question.');
  }
}

const shortDay = (key: string) => fromKey(key).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });

/** One line for the confirmation card, such as "Move Foundation Run from Thu, 19 Nov to Fri, 20 Nov". */
export function describeProposal(p: Proposal): string {
  switch (p.kind) {
    case 'move':
      return `Move ${p.title} from ${shortDay(p.from)} to ${shortDay(p.to)}`;
    case 'add':
      return `Add ${p.session.title} (${formatMinutes(p.session.minutes)}) on ${shortDay(p.session.date)}${p.session.repeatWeekly ? ', then every week until the race' : ''}`;
    case 'remove':
      return `Remove ${p.title} on ${shortDay(p.date)}${p.scope === 'later' ? ' and every later week' : ''}`;
  }
}

export function applyProposal(p: Proposal, actions: CoachActions): void {
  switch (p.kind) {
    case 'move':
      return actions.moveWorkout(p.workoutId, p.to, p.plannedDate);
    case 'add':
      return actions.addSession(p.session);
    case 'remove':
      return actions.removeSession(p.sessionId, p.scope);
  }
}
