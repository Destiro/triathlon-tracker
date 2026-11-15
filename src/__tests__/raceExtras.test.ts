import { addItem, CHECKLIST, NO_CHECKLIST, progress, removeItem, toggleItem } from '../checklist';
import { pacingPlan } from '../pacing';
import { predictRace } from '../prediction';
import { buildSchedule } from '../plan/schedule';
import { plannedLoad, projectForm } from '../projection';
import { longestSoFar, shareOf } from '../readiness';
import { plannedMinutes } from '../stats';
import { activity } from './helpers';

const RACE = { swim: 1900, bike: 90000, run: 21100 };
const hr = { maxHr: 190, restHr: 55 };

describe('pacingPlan', () => {
  const recent = [
    activity({ id: 1, sport: 'swim', date: '2026-11-10', distanceM: 1500, movingS: 1800, openWater: true }),
    activity({ id: 2, sport: 'bike', date: '2026-11-11', distanceM: 40000, movingS: 5400 }),
    activity({ id: 3, sport: 'run', date: '2026-11-12', distanceM: 10000, movingS: 3300 }),
  ];
  const prediction = predictRace(recent, '2026-11-14', RACE);

  it('gives each leg its predicted pace, with heart rate ceilings from max heart rate', () => {
    const plan = pacingPlan(prediction, 190)!;
    expect(plan.swim.speed).toBeCloseTo(1500 / 1800);
    expect(plan.bike.speed).toBeCloseTo(40000 / 5400);
    expect(plan.bike.ceilingBpm).toBe(152);
    expect(plan.run.ceilingBpm).toBe(162);
  });

  it('holds the start of the run back 10 seconds a km, then settles to the predicted pace', () => {
    const plan = pacingPlan(prediction, 190)!;
    const pace = 1000 / plan.run.speed;
    expect(1000 / plan.run.startSpeed).toBeCloseTo(pace + 10);
    expect(plan.run.holdBackKm).toBe(5);
  });

  it('has no plan until every leg has something to go on', () => {
    expect(pacingPlan(predictRace([], '2026-11-14', RACE), 190)).toBeNull();
  });
});

describe('longestSoFar', () => {
  const list = [
    activity({ id: 1, sport: 'swim', date: '2026-11-01', distanceM: 1200 }),
    activity({ id: 2, sport: 'swim', date: '2026-11-08', distanceM: 1600 }),
    activity({ id: 3, sport: 'bike', date: '2026-11-08', start: '2026-11-08T07:00:00', distanceM: 50000 }),
    activity({ id: 4, sport: 'run', date: '2026-11-08', start: '2026-11-08T09:00:00', distanceM: 8000 }),
    activity({ id: 5, sport: 'bike', date: '2026-11-10', start: '2026-11-10T07:00:00', distanceM: 62000 }),
    activity({ id: 6, sport: 'run', date: '2026-11-12', start: '2026-11-12T07:00:00', distanceM: 16000 }),
    activity({ id: 7, sport: 'run', date: '2026-11-20', distanceM: 21000 }),
  ];

  it('finds the longest of each sport up to today', () => {
    const l = longestSoFar(list, '2026-11-14', RACE);
    expect([l.swim, l.bike, l.run]).toEqual([1600, 62000, 16000]);
  });

  it('finds the brick as a ride then a run on the same day, not a run before the ride', () => {
    expect(longestSoFar(list, '2026-11-14', RACE).brick).toEqual({ bikeM: 50000, runM: 8000, date: '2026-11-08' });
    const reversed = [activity({ id: 1, sport: 'run', date: '2026-11-08', start: '2026-11-08T06:00:00', distanceM: 8000 }), activity({ id: 2, sport: 'bike', date: '2026-11-08', start: '2026-11-08T08:00:00', distanceM: 50000 })];
    expect(longestSoFar(reversed, '2026-11-14', RACE).brick).toBeNull();
  });

  it('shares a distance as a fraction that stops at 1', () => {
    expect(shareOf(45000, 90000)).toBe(0.5);
    expect(shareOf(95000, 90000)).toBe(1);
    expect(shareOf(5, 0)).toBe(0);
  });
});

describe('plannedMinutes and plannedLoad', () => {
  const plan = buildSchedule('2026-10-19', '2027-03-06', 'Race');
  const brick = [...plan.values()].flatMap((d) => d.workouts).find((w) => w.kind === 'brick')!;

  it('adds up the legs of a brick', () => {
    expect(plannedMinutes(brick)).toBe(brick.legs!.reduce((s, l) => s + (l.minutes ?? 0), 0));
    expect(plannedMinutes(brick)).toBeGreaterThan(0);
  });

  it('turns a swim into minutes at an easy pool pace', () => {
    expect(plannedMinutes({ kind: 'swim', title: '', steps: [], metres: 2000 })).toBe(50);
  });

  it('scales load by the rate for the sport', () => {
    const rates = { swim: 1, bike: 2, run: 3, gym: 1 };
    expect(plannedLoad({ kind: 'bike', title: '', steps: [], minutes: 60 }, rates)).toBe(120);
    expect(plannedLoad({ kind: 'run', title: '', steps: [], minutes: 30 }, rates)).toBe(90);
  });
});

describe('projectForm', () => {
  const schedule = buildSchedule('2026-10-19', '2027-03-06', 'Race');
  // A steady month of an hour a day, so there is something to project from.
  const month = Array.from({ length: 28 }, (_, i) =>
    activity({ id: i + 1, sport: i % 2 ? 'run' : 'bike', date: new Date(2026, 9, 19 + i).toISOString().slice(0, 10), movingS: 3600, avgHr: 140 }),
  );

  it('carries fitness and fatigue forward to race day, one point a day', () => {
    const p = projectForm(month, schedule, '2026-10-19', '2026-11-15', '2027-03-06', hr)!;
    expect(p.points[p.points.length - 1].date).toBe('2027-03-06');
    expect(p.points.filter((x) => !x.projected).length).toBe(28);
    expect(p.points.filter((x) => x.projected).length).toBe(111);
    expect(p.raceForm).toBe(p.points[p.points.length - 1].form);
  });

  it('comes in fresher than a hard block, because the taper cuts the load', () => {
    const p = projectForm(month, schedule, '2026-10-19', '2026-11-15', '2027-03-06', hr)!;
    const week = p.points.slice(-14);
    expect(week[week.length - 1].form).toBeGreaterThan(week[0].form);
  });

  it('is null on or after race day, or with nothing to start from', () => {
    expect(projectForm(month, schedule, '2026-10-19', '2027-03-06', '2027-03-06', hr)).toBeNull();
    expect(projectForm([], schedule, '2026-10-19', '2026-11-15', '2027-03-06', hr)).toBeNull();
  });
});

describe('checklist', () => {
  it('has the same ids every time and none twice', () => {
    const ids = CHECKLIST.flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ticks, unticks, adds and removes, and counts your own items', () => {
    const total = progress(NO_CHECKLIST).total;
    let s = toggleItem(NO_CHECKLIST, 'swim.0');
    expect(progress(s)).toEqual({ done: 1, total });
    s = toggleItem(s, 'swim.0');
    expect(progress(s).done).toBe(0);

    s = addItem(s, '  Spare goggles  ', 'x1');
    expect(s.extra).toEqual([{ id: 'x1', text: 'Spare goggles' }]);
    s = toggleItem(s, 'x1');
    expect(progress(s)).toEqual({ done: 1, total: total + 1 });
    s = removeItem(s, 'x1');
    expect(progress(s)).toEqual({ done: 0, total });
    expect(s.done).toEqual({});
  });

  it('ignores an empty item', () => {
    expect(addItem(NO_CHECKLIST, '   ', 'y')).toBe(NO_CHECKLIST);
  });
});
