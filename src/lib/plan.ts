import { Intensity, Phase, PlanSession, PlanSport, PlanWeek, Race, TrainingPlan, Workout } from '../types';
import { addDays, daysBetween, fromKey, startOfWeek, toKey } from './dates';
import { raceLegs } from './races';

/** Longest plan generated; earlier weeks are left out of a very distant race. */
export const MAX_WEEKS = 30;

/** How many taper weeks a race deserves: longer races need longer to freshen up. */
function taperWeeks(race: Pick<Race, 'distance' | 'custom'>): number {
  const legs = raceLegs(race);
  // Rough effort-weighted size: Sprint ~38k, Olympic ~76k, 70.3 ~160k, Ironman ~320k.
  const total = legs.swimM * 4 + legs.bikeM + legs.runM * 3;
  return total > 250_000 ? 3 : total > 120_000 ? 2 : 1;
}

/**
 * Phases for each week, from the first to race week. Race week is always last, then taper, then two peak
 * weeks; the rest splits roughly 60/40 between base and build. Short plans drop base first, then build.
 */
export function phasesFor(weeks: number, taper: number): Phase[] {
  if (weeks <= 0) return [];
  const phases: Phase[] = ['race'];
  let left = weeks - 1;
  const take = (n: number, phase: Phase) => {
    const k = Math.min(n, left);
    for (let i = 0; i < k; i++) phases.unshift(phase);
    left -= k;
  };
  take(taper, 'taper');
  take(2, 'peak');
  const build = Math.round(left * 0.4);
  take(build, 'build');
  take(left, 'base');
  return phases;
}

/** How much of the target weekly volume each week carries. */
function volumeFactor(phases: Phase[], i: number, recovery: boolean): number {
  const phase = phases[i];
  const position = (p: Phase) => {
    const indexes = phases.map((x, j) => (x === p ? j : -1)).filter((j) => j >= 0);
    return indexes.length <= 1 ? 1 : indexes.indexOf(i) / (indexes.length - 1);
  };
  let f: number;
  if (phase === 'base') f = 0.7 + 0.15 * position('base');
  else if (phase === 'build') f = 0.85 + 0.15 * position('build');
  else if (phase === 'peak') f = 1;
  else if (phase === 'taper') f = position('taper') === 0 && phases.filter((p) => p === 'taper').length > 1 ? 0.7 : 0.55;
  else f = 0.35;
  return recovery ? f * 0.7 : f;
}

/** Every fourth week of base and build is lighter, so the body can absorb the work. */
const isRecovery = (phase: Phase, index: number) => (phase === 'base' || phase === 'build') && index % 4 === 3;

const minutes = (n: number) => Math.max(20, Math.round(n / 5) * 5);

interface Template {
  title: string;
  intensity: Intensity;
  description: string;
}

/** What each kind of session looks like in each phase. */
const SESSIONS: Record<'swimTech' | 'swimEndurance' | 'bikeQuality' | 'bikeLong' | 'runQuality' | 'runLong' | 'brick' | 'strength', Partial<Record<Phase, Template>> & { base: Template }> = {
  swimTech: {
    base: { title: 'Technique swim', intensity: 'easy', description: 'Warm up 200, then drills (catch-up, fingertip drag, 6-kick switch) as 8 x 50 with 20 s rest. Finish with 4 x 100 relaxed and smooth.' },
    build: { title: 'Threshold swim', intensity: 'hard', description: 'Warm up 300. Main set 8-12 x 100 at a hard, steady pace with 15 s rest. Cool down 200 easy.' },
    peak: { title: 'Race-pace swim', intensity: 'hard', description: 'Warm up 300. 3 x 400 at goal race pace with 30 s rest, practising sighting every 6-8 strokes.' },
    taper: { title: 'Sharpening swim', intensity: 'moderate', description: 'Warm up 200. 6 x 50 fast with full recovery, then 300 easy. Keep it short and crisp.' },
  },
  swimEndurance: {
    base: { title: 'Endurance swim', intensity: 'easy', description: 'Continuous easy swimming, breathing bilaterally. Add a few 25s of pull-buoy work to focus on your stroke.' },
    build: { title: 'Endurance swim', intensity: 'moderate', description: 'Warm up 300, then 2-3 x 500 steady with 30 s rest. Open water if you can.' },
    peak: { title: 'Open water practice', intensity: 'moderate', description: 'Race-distance swim in a wetsuit if possible, practising starts, sighting and swimming in a straight line.' },
    taper: { title: 'Easy swim', intensity: 'easy', description: 'Relaxed swimming with a few short pick-ups. Stay loose.' },
  },
  bikeQuality: {
    base: { title: 'Aerobic ride', intensity: 'easy', description: 'Steady ride you could hold a conversation through. Include 4 x 1 min high-cadence spins.' },
    build: { title: 'Bike intervals', intensity: 'hard', description: 'Warm up 15 min. 4-5 x 8 min hard (threshold) with 4 min easy spinning. Cool down 10 min.' },
    peak: { title: 'Race-pace intervals', intensity: 'hard', description: 'Warm up 15 min. 3 x 15 min at goal race effort with 5 min easy. Practise drinking on the bike.' },
    taper: { title: 'Openers ride', intensity: 'moderate', description: 'Easy ride with 4 x 1 min at race effort and full recovery. Check your race bike is ready.' },
  },
  bikeLong: {
    base: { title: 'Long ride', intensity: 'easy', description: 'Long, steady, conversational ride. Eat and drink every 20-30 min to practise fuelling.' },
    build: { title: 'Long ride', intensity: 'moderate', description: 'Long ride with the middle third at a steady, comfortably hard effort. Fuel as you would on race day.' },
    taper: { title: 'Short ride', intensity: 'easy', description: 'Short, easy spin to stay loose.' },
  },
  runQuality: {
    base: { title: 'Easy run + strides', intensity: 'easy', description: 'Easy conversational run, finishing with 6 x 20 s strides (quick, relaxed, full recovery).' },
    build: { title: 'Tempo run', intensity: 'hard', description: 'Warm up 10 min. 2 x 12 min at a comfortably hard tempo with 3 min jog. Cool down 10 min.' },
    peak: { title: 'Run intervals', intensity: 'hard', description: 'Warm up 10 min. 5 x 1 km at 10 km race pace with 2 min jog. Cool down 10 min.' },
    taper: { title: 'Sharpening run', intensity: 'moderate', description: 'Easy run with 4 x 30 s at race pace. Short and snappy.' },
  },
  runLong: {
    base: { title: 'Long run', intensity: 'easy', description: 'Long, easy run at a pace you could talk at. Walk breaks are fine; time on feet is the goal.' },
    build: { title: 'Long run', intensity: 'moderate', description: 'Long run, with the last 15 min at a steady, stronger effort.' },
    taper: { title: 'Easy run', intensity: 'easy', description: 'Short, easy run. Nothing hard this close to the race.' },
  },
  brick: {
    base: { title: 'Brick: bike + run', intensity: 'moderate', description: 'Ride, then head straight out for a short run. Practise a quick transition and get used to running on tired legs.' },
    peak: { title: 'Race simulation brick', intensity: 'hard', description: 'Ride with the middle section at race effort, transition quickly, then run 15-20 min at race pace. Rehearse race-day nutrition and kit.' },
  },
  strength: {
    base: { title: 'Strength & mobility', intensity: 'moderate', description: 'Squats, lunges, deadlifts, step-ups, planks and side planks: 3 x 10-12. Finish with 10 min hip and shoulder mobility.' },
    build: { title: 'Strength maintenance', intensity: 'moderate', description: 'A shorter session: 2 x 8 of squats, single-leg deadlifts, push-ups and core. Keep it crisp, not exhausting.' },
  },
};

const template = (kind: keyof typeof SESSIONS, phase: Phase, recovery: boolean): Template => {
  const t = SESSIONS[kind][phase] ?? (phase === 'peak' ? SESSIONS[kind].build : undefined) ?? SESSIONS[kind].base;
  return recovery ? { ...t, intensity: t.intensity === 'hard' ? 'moderate' : t.intensity, description: `Recovery week: keep this easier than usual. ${t.description}` } : t;
};

/** Share of endurance time for each sport. Cycling gets the most, as it is the longest leg. */
const SPLIT = { swim: 0.22, bike: 0.45, run: 0.33 };
/** How much run is tacked onto the brick, in minutes. */
const BRICK_RUN_MIN = 15;

export interface PlanOptions {
  race: Race;
  /** Peak training hours per week. */
  weeklyHours: number;
  today: Date;
  /** Include a weekly strength session (recommended from 6 hours a week). */
  strength?: boolean;
}

/**
 * Builds a periodised plan from this week (or next, if this week is mostly over) to race day. Returns null
 * if the race has already happened.
 */
export function generatePlan({ race, weeklyHours, today, strength }: PlanOptions): TrainingPlan | null {
  const raceDay = fromKey(race.date);
  if (daysBetween(today, raceDay) < 0) return null;
  const raceWeek = startOfWeek(raceDay);
  let start = startOfWeek(today);
  // From Friday on, start next week rather than with a half-finished one (unless race week is this week).
  if (daysBetween(start, today) >= 4 && start < raceWeek) start = addDays(start, 7);
  let weeks = Math.floor(daysBetween(start, raceWeek) / 7) + 1;
  if (weeks > MAX_WEEKS) {
    start = addDays(raceWeek, -7 * (MAX_WEEKS - 1));
    weeks = MAX_WEEKS;
  }

  const phases = phasesFor(weeks, taperWeeks(race));
  const withStrength = strength ?? weeklyHours >= 6;
  const plan: PlanWeek[] = phases.map((phase, i) => {
    const weekStart = addDays(start, 7 * i);
    const recovery = isRecovery(phase, i);
    const sessions = phase === 'race' ? raceWeekSessions(weekStart, race) : trainingWeek(weekStart, i, phase, recovery, weeklyHours * 60 * volumeFactor(phases, i, recovery), withStrength);
    return { index: i, phase, startDate: toKey(weekStart), recovery, sessions };
  });

  return { raceId: race.id, createdAt: new Date().toISOString(), weeklyHours, weeks: plan };
}

function trainingWeek(weekStart: Date, index: number, phase: Phase, recovery: boolean, totalMin: number, withStrength: boolean): PlanSession[] {
  const strengthMin = withStrength && (phase === 'base' || phase === 'build') && !recovery ? (phase === 'base' ? 45 : 30) : 0;
  const endurance = totalMin - strengthMin;
  const swim = endurance * SPLIT.swim;
  const bike = endurance * SPLIT.bike;
  const run = endurance * SPLIT.run;
  const brickWeek = phase === 'build' || phase === 'peak';
  const day = (n: number) => toKey(addDays(weekStart, n));
  const make = (n: number, sport: PlanSport, kind: keyof typeof SESSIONS | null, durationMin: number, override?: Partial<Template>): PlanSession => {
    const t = kind ? template(kind, phase, recovery) : { title: 'Rest day', intensity: 'rest' as Intensity, description: 'Full rest, or a gentle walk and some stretching. Recovery is when you get fitter.' };
    return { id: `w${index}-d${n}-${sport}`, date: day(n), sport, durationMin, ...t, ...override };
  };

  const sessions: PlanSession[] = [
    make(0, 'rest', null, 0),
    make(1, 'swim', 'swimTech', minutes(swim * 0.5)),
    make(2, 'bike', 'bikeQuality', minutes(bike * 0.35)),
    make(3, 'run', 'runQuality', minutes(run * 0.4)),
    make(4, 'swim', 'swimEndurance', minutes(swim * 0.5)),
    brickWeek
      ? make(5, 'brick', 'brick', minutes(bike * 0.65) + BRICK_RUN_MIN)
      : make(5, 'bike', 'bikeLong', minutes(bike * 0.65)),
    make(6, 'run', 'runLong', minutes(run * 0.6 - (brickWeek ? BRICK_RUN_MIN : 0))),
  ];
  if (strengthMin > 0) sessions.splice(4, 0, make(3, 'strength', 'strength', strengthMin));
  return sessions;
}

/** Race week: a few short sessions to stay sharp, rest the day before, then the race. */
function raceWeekSessions(weekStart: Date, race: Race): PlanSession[] {
  const raceKey = race.date;
  const day = (n: number) => toKey(addDays(weekStart, n));
  const week: PlanSession[] = [
    { id: 'race-d0', date: day(0), sport: 'rest', title: 'Rest day', durationMin: 0, intensity: 'rest', description: 'Rest. Start thinking about race logistics and kit.' },
    { id: 'race-d1', date: day(1), sport: 'swim', title: 'Short swim', durationMin: 20, intensity: 'easy', description: 'Easy swim with 4 x 25 at race pace.' },
    { id: 'race-d2', date: day(2), sport: 'bike', title: 'Short ride', durationMin: 30, intensity: 'easy', description: 'Easy spin with 3 x 1 min at race effort.' },
    { id: 'race-d3', date: day(3), sport: 'run', title: 'Short run', durationMin: 20, intensity: 'easy', description: 'Easy jog with 4 strides.' },
    { id: 'race-d4', date: day(4), sport: 'rest', title: 'Rest day', durationMin: 0, intensity: 'rest', description: 'Rest, hydrate and pack your race bag.' },
    { id: 'race-d5', date: day(5), sport: 'brick', title: 'Shakeout', durationMin: 25, intensity: 'easy', description: '15 min easy ride and 10 min jog to wake the legs up. Check the bike and rack it if allowed.' },
  ];
  const sessions = week.filter((s) => s.date < raceKey);
  const legs = raceLegs(race);
  sessions.push({
    id: 'race-day',
    date: raceKey,
    sport: 'race',
    title: `Race day: ${race.name}`,
    durationMin: 0,
    intensity: 'race',
    description: `Swim ${legs.swimM} m, bike ${Math.round(legs.bikeM / 1000)} km, run ${Math.round(legs.runM / 100) / 10} km. Trust your training, start steady and enjoy it.`,
  });
  return sessions;
}

export type SessionStatus = 'done' | 'missed' | 'today' | 'upcoming' | 'rest';

/** Whether a workout on the session's day covers it. A brick needs a ride; race day takes anything. */
function covers(session: PlanSession, w: Workout): boolean {
  if (toKey(new Date(w.startedAt)) !== session.date) return false;
  const sports = new Set(w.segments.map((s) => s.sport));
  if (session.sport === 'race') return true;
  if (session.sport === 'brick') return sports.has('bike');
  return sports.has(session.sport as 'swim' | 'bike' | 'run' | 'strength');
}

export function sessionStatus(session: PlanSession, workouts: Workout[], today: Date): SessionStatus {
  if (session.sport === 'rest') return 'rest';
  if (workouts.some((w) => covers(session, w))) return 'done';
  const diff = daysBetween(today, fromKey(session.date));
  return diff < 0 ? 'missed' : diff === 0 ? 'today' : 'upcoming';
}

/** Sessions (not rest days) due so far and how many were done. */
export function planProgress(plan: TrainingPlan, workouts: Workout[], today: Date): { done: number; due: number; total: number } {
  const sessions = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.sport !== 'rest');
  const statuses = sessions.map((s) => sessionStatus(s, workouts, today));
  return {
    done: statuses.filter((s) => s === 'done').length,
    due: statuses.filter((s) => s === 'done' || s === 'missed' || s === 'today').length,
    total: sessions.length,
  };
}

/** Planned sessions on a given day. */
export const sessionsOn = (plan: TrainingPlan | null, day: Date): PlanSession[] =>
  plan ? plan.weeks.flatMap((w) => w.sessions).filter((s) => s.date === toKey(day)) : [];

/** The week of the plan containing `day`, if any. */
export const weekContaining = (plan: TrainingPlan | null, day: Date): PlanWeek | undefined =>
  plan?.weeks.find((w) => w.startDate === toKey(startOfWeek(day)));

/** Planned minutes in a week, not counting race day itself. */
export const plannedMinutes = (week: PlanWeek): number => week.sessions.reduce((s, x) => s + x.durationMin, 0);

export const PHASE_LABELS: Record<Phase, string> = {
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  taper: 'Taper',
  race: 'Race week',
};
