import { byDate, toActivity } from '../activities';
import { matchDay } from '../matching';
import { addSessions, applyEdits, NO_EDITS, removeSession, sessionDates, sessionIdOf, setMove } from '../plan/edits';
import { buildSchedule } from '../plan/schedule';
import { totals, weekCompliance, weekGym, weekVolume } from '../stats';
import { activity } from './helpers';

const RACE = '2027-03-05';
const base = buildSchedule('2026-10-19', RACE, 'Race');
let counter = 0;
const makeId = () => `id${++counter}`;

// Week 3 (2 to 8 November 2026): Tuesday is a 50 min power-interval ride, Thursday a 60 min Foundation Bike.
const TUESDAY = '2026-11-03';
const THURSDAY = '2026-11-05';
const SATURDAY = '2026-11-07';

describe('moving a workout', () => {
  const tuesdayRide = base.get(TUESDAY)!.workouts[0];

  it('gives every plan workout a stable id', () => {
    expect(tuesdayRide.id).toBe('3.1.0');
    expect(base.get('2026-11-04')!.workouts.map((w) => w.id)).toEqual(['3.2.0', '3.2.1']);
  });

  it('takes the workout off its day and puts it on the new one, after what was already there', () => {
    const moved = applyEdits(base, setMove(NO_EDITS, tuesdayRide.id!, THURSDAY, TUESDAY));
    expect(moved.get(TUESDAY)!.workouts).toEqual([]);
    expect(moved.get(THURSDAY)!.workouts.map((w) => w.title)).toEqual(['Foundation Bike', 'Bike Power Intervals']);
    expect(moved.get(THURSDAY)!.workouts[1].movedFrom).toBe(TUESDAY);
  });

  it('leaves the original plan untouched', () => {
    applyEdits(base, setMove(NO_EDITS, tuesdayRide.id!, THURSDAY, TUESDAY));
    expect(base.get(TUESDAY)!.workouts).toHaveLength(1);
    expect(base.get(THURSDAY)!.workouts).toHaveLength(1);
  });

  it('puts it back when moved to the day it was planned for', () => {
    const there = setMove(NO_EDITS, tuesdayRide.id!, THURSDAY, TUESDAY);
    expect(setMove(there, tuesdayRide.id!, TUESDAY, TUESDAY).moves).toEqual({});
  });

  it('can move a workout to a rest day', () => {
    const monday = '2026-11-02';
    const moved = applyEdits(base, setMove(NO_EDITS, tuesdayRide.id!, monday, TUESDAY));
    expect(moved.get(monday)!.workouts.map((w) => w.title)).toEqual(['Bike Power Intervals']);
  });

  it('ignores a move to a day outside the plan, and never moves the race', () => {
    const outside = applyEdits(base, { ...NO_EDITS, moves: { [tuesdayRide.id!]: '2030-01-01' } });
    expect(outside.get(TUESDAY)!.workouts).toHaveLength(1);
    const raceId = base.get(RACE)!.workouts[0].id!;
    const race = applyEdits(base, { ...NO_EDITS, moves: { [raceId]: '2027-03-01' } });
    expect(race.get(RACE)!.workouts[0].kind).toBe('race');
  });

  it('counts a moved workout on its new day, so the watch ticks it off there', () => {
    const moved = applyEdits(base, setMove(NO_EDITS, tuesdayRide.id!, SATURDAY, TUESDAY));
    // Saturday now has the 75 min Foundation Bike and the 50 min power intervals.
    const rides = [
      activity({ id: 1, sport: 'bike', date: SATURDAY, start: `${SATURDAY}T07:00:00`, movingS: 75 * 60 }),
      activity({ id: 2, sport: 'bike', date: SATURDAY, start: `${SATURDAY}T15:00:00`, movingS: 50 * 60 }),
    ];
    const both = matchDay(moved.get(SATURDAY), rides, '2026-11-10');
    expect(both.results.map((r) => [r.workout.title, r.status])).toEqual([['Foundation Bike', 'done'], ['Bike Power Intervals', 'done']]);
  });

  it('does not let one ride cover two planned rides', () => {
    const moved = applyEdits(base, setMove(NO_EDITS, tuesdayRide.id!, SATURDAY, TUESDAY));
    const one = [activity({ id: 1, sport: 'bike', date: SATURDAY, movingS: 125 * 60 })];
    const result = matchDay(moved.get(SATURDAY), one, '2026-11-10');
    expect(result.results.map((r) => r.status)).toEqual(['done', 'missed']);
  });
});

describe('your own sessions', () => {
  it('adds a gym session to a day', () => {
    const edits = addSessions(NO_EDITS, { date: THURSDAY, title: 'Legs', minutes: 45, notes: 'Squats, lunges', repeatWeekly: false }, RACE, makeId);
    const day = applyEdits(base, edits).get(THURSDAY)!;
    expect(day.workouts).toHaveLength(2);
    expect(day.workouts[1]).toMatchObject({ kind: 'gym', title: 'Legs', minutes: 45, steps: ['Squats, lunges'], custom: true });
  });

  it('repeats weekly on the same weekday up to the race, not on it', () => {
    const dates = sessionDates('2026-11-05', true, RACE);
    expect(dates[0]).toBe('2026-11-05');
    expect(dates[1]).toBe('2026-11-12');
    expect(dates.every((d) => d < RACE)).toBe(true);
    expect(dates[dates.length - 1]).toBe('2027-03-04');
    expect(sessionDates('2026-11-05', false, RACE)).toEqual(['2026-11-05']);
  });

  it('removes one session, or this one and the later ones in its series', () => {
    const edits = addSessions(NO_EDITS, { date: THURSDAY, title: 'Gym', minutes: 40, repeatWeekly: true }, RACE, makeId);
    const second = edits.sessions[1];
    expect(removeSession(edits, second.id, 'one').sessions).toHaveLength(edits.sessions.length - 1);
    const kept = removeSession(edits, second.id, 'later').sessions;
    expect(kept).toHaveLength(1);
    expect(kept[0].date).toBe(THURSDAY);
  });

  it('turns a workout id back into a session id', () => {
    expect(sessionIdOf('session.abc')).toBe('abc');
  });
});

describe('gym on the watch', () => {
  it('reads Strava strength types as gym', () => {
    const a = toActivity({ id: 5, name: 'Legs', sport_type: 'WeightTraining', start_date_local: '2026-11-05T18:00:00Z', moving_time: 2700 });
    expect(a?.sport).toBe('gym');
  });

  const edits = addSessions(NO_EDITS, { date: THURSDAY, title: 'Gym', minutes: 45, repeatWeekly: false }, RACE, makeId);
  const schedule = applyEdits(base, edits);
  const lifted = [
    activity({ id: 9, sport: 'gym', type: 'WeightTraining', date: THURSDAY, movingS: 44 * 60 }),
    activity({ id: 10, sport: 'bike', date: THURSDAY, movingS: 60 * 60 }),
  ];

  it('ticks off a gym session and leaves the ride to the ride', () => {
    const result = matchDay(schedule.get(THURSDAY), lifted, '2026-11-10');
    expect(result.results.map((r) => [r.workout.kind, r.status])).toEqual([['bike', 'done'], ['gym', 'done']]);
    expect(result.extras).toEqual([]);
  });

  it('counts a gym session in the week score, apart from swim, bike and run volume', () => {
    const map = byDate(lifted);
    expect(weekCompliance(schedule, map, 3, '2026-11-10').due).toBeGreaterThan(weekCompliance(base, map, 3, '2026-11-10').due);
    expect(weekGym(schedule, map, 3)).toEqual({ planned: 45, actual: 44 });
    expect(weekVolume(schedule, map, 3).bike.actual).toBe(60);
  });

  it('counts gym in the totals', () => {
    const t = totals(lifted, '2026-10-19');
    expect(t.gym).toMatchObject({ count: 1, movingS: 44 * 60 });
    expect(t.bike.count).toBe(1);
  });
});
