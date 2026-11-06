import { byDate } from '../activities';
import { addSessions, applyEdits, NO_EDITS } from '../plan/edits';
import { buildSchedule } from '../plan/schedule';
import { bestValue } from '../bests';
import { efficiency, loadSeries, newBests, records, swimsByWater, trainingLoad, upNext, weekCompliance, weekMinutes, weekVolume } from '../stats';
import { activity } from './helpers';

const hr = { maxHr: 190, restHr: 50 };
const schedule = buildSchedule('2026-10-19', '2027-03-05', 'Race');

describe('trainingLoad', () => {
  it('scores a harder hour higher than an easy one', () => {
    const easy = trainingLoad(activity({ id: 1, sport: 'run', date: '2026-10-20', movingS: 3600, avgHr: 130 }), hr);
    const hard = trainingLoad(activity({ id: 2, sport: 'run', date: '2026-10-20', movingS: 3600, avgHr: 170 }), hr);
    expect(hard).toBeGreaterThan(easy * 1.8);
    expect(easy).toBeGreaterThan(30);
  });

  it('falls back to a steady-effort estimate without heart rate', () => {
    expect(trainingLoad(activity({ id: 1, sport: 'swim', date: '2026-10-20', movingS: 3000 }), hr)).toBeCloseTo(60);
  });
});

describe('loadSeries', () => {
  it('builds fitness slower than fatigue, so form dips after a hard day and recovers with rest', () => {
    const acts = [activity({ id: 1, sport: 'run', date: '2026-10-20', movingS: 3600, avgHr: 170 })];
    const series = loadSeries(acts, '2026-10-19', '2026-11-30', hr);
    const day = (d: string) => series.find((p) => p.date === d)!;
    expect(series).toHaveLength(43);
    expect(day('2026-10-21').form).toBeLessThan(0);
    expect(day('2026-10-21').fatigue).toBeGreaterThan(day('2026-10-21').fitness);
    expect(day('2026-11-30').form).toBeGreaterThan(day('2026-10-21').form);
  });
});

describe('weekVolume and weekCompliance', () => {
  const acts = [
    activity({ id: 1, sport: 'bike', date: '2026-10-27', movingS: 50 * 60 }),
    activity({ id: 2, sport: 'swim', date: '2026-10-28', distanceM: 1300, movingS: 2400 }),
  ];
  const map = byDate(acts);

  it('totals planned and actual per sport for a plan week', () => {
    const v = weekVolume(schedule, map, 2);
    expect(v.bike.actual).toBe(50);
    expect(v.swim.actual).toBe(1300);
    expect(v.swim.planned).toBe(1300 + 1300 + 1600);
    expect(v.run.actual).toBe(0);
  });

  it('counts workouts whose day has passed, and ones already done, but not ones still to do today', () => {
    // On Wednesday the ride (Tuesday) and the swim (done today) count; the run is still to do today.
    expect(weekCompliance(schedule, map, 2, '2026-10-28')).toEqual({ due: 2, score: 2 });
  });
});

describe('efficiency and records', () => {
  const acts = [
    activity({ id: 1, sport: 'run', date: '2026-10-20', distanceM: 6000, movingS: 1800, avgSpeed: 6000 / 1800, avgHr: 150 }),
    activity({ id: 2, sport: 'run', date: '2026-10-22', distanceM: 1000, movingS: 300, avgSpeed: 1000 / 300, avgHr: 160 }),
    activity({ id: 3, sport: 'run', date: '2026-10-25', distanceM: 10000, movingS: 3300, avgSpeed: 10000 / 3300, avgHr: 150 }),
  ];

  it('ignores short sessions when judging aerobic efficiency', () => {
    expect(efficiency(acts, 'run').map((p) => p.date)).toEqual(['2026-10-20', '2026-10-25']);
  });

  it('finds the longest run, and a fastest pace that needs 5 km or more (so the 1 km effort cannot win)', () => {
    const found = Object.fromEntries(records(acts, '2026-10-19').map((r) => [r.label, r.activity.id]));
    expect(found['Longest run']).toBe(3);
    // 6 km at 5:00 per km beats 10 km at 5:30 per km.
    expect(found['Fastest run pace (5 km+)']).toBe(1);
  });
});

describe('upNext', () => {
  // Friday 6 November 2026, week 3: a 1,400 m swim then a 40 min Foundation Run.
  const friday = '2026-11-06';

  it('is the first workout today that has not been recorded', () => {
    const next = upNext(schedule, new Map(), friday);
    expect(next?.date).toBe(friday);
    expect(next?.index).toBe(0);
    expect(next?.result.workout.kind).toBe('swim');
  });

  it('moves on to the run once the swim is in', () => {
    const swum = byDate([activity({ id: 1, sport: 'swim', date: friday, distanceM: 1450, movingS: 1880 })]);
    const next = upNext(schedule, swum, friday);
    expect(next?.index).toBe(1);
    expect(next?.result.workout.title).toBe('Foundation Run');
  });

  it('looks ahead to the next day with workouts when today is done or a rest day', () => {
    const monday = '2026-11-09'; // week 4 Monday: rest
    const next = upNext(schedule, new Map(), monday);
    expect(next?.date).toBe('2026-11-10');
    expect(next?.result.status).toBe('upcoming');
  });

  it('is null once the race is over', () => {
    expect(upNext(schedule, new Map(), '2027-03-06')).toBeNull();
  });
});

describe('weekMinutes', () => {
  it('adds up a week of rides, runs and swims, turning swim metres into time', () => {
    // Week 3: bike 50 + 60 + 75, run 35 + 40 + 45, swims 1,400 + 1,400 + 1,700 m = 4,500 m at 2.5 min per 100 m.
    expect(weekMinutes(schedule, 3)).toBeCloseTo(185 + 120 + 112.5);
  });

  it('counts a gym session you added', () => {
    const withGym = applyEdits(schedule, addSessions(NO_EDITS, { date: '2026-11-10', title: 'Gym', minutes: 45, repeatWeekly: false }, '2027-03-05', () => 'x'));
    expect(weekMinutes(withGym, 4) - weekMinutes(schedule, 4)).toBe(45);
  });
});

describe('newBests', () => {
  const ride = (id: number, date: string, km: number, hours: number) =>
    activity({ id, sport: 'bike', date, distanceM: km * 1000, movingS: hours * 3600, avgSpeed: (km * 1000) / (hours * 3600) });
  const first = ride(1, '2026-10-25', 30, 1.5);

  it('flags an effort from the last two days that beats the best before it', () => {
    const longer = ride(2, '2026-11-05', 45, 2.5);
    const found = newBests([first, longer], '2026-10-19', '2026-11-06');
    expect(found.map((b) => b.label)).toEqual(['Longest ride']);
    expect(found[0].activity.id).toBe(2);
    expect(found[0].previous.id).toBe(1);
  });

  it('does not call the first effort of a kind a new best', () => {
    expect(newBests([first], '2026-10-19', '2026-10-25')).toEqual([]);
  });

  it('does not flag a best set more than two days ago', () => {
    const longer = ride(2, '2026-11-02', 45, 2.5);
    expect(newBests([first, longer], '2026-10-19', '2026-11-06')).toEqual([]);
  });

  it('does not flag an effort that ties or falls short of the earlier best', () => {
    expect(newBests([first, ride(2, '2026-11-05', 30, 1.6)], '2026-10-19', '2026-11-06')).toEqual([]);
  });

  it('finds a faster pace as well as a longer distance', () => {
    const faster = ride(2, '2026-11-06', 40, 1.5);
    expect(newBests([first, faster], '2026-10-19', '2026-11-06').map((b) => b.label)).toEqual(['Longest ride', 'Fastest ride (20 km+)']);
  });

  it('ignores efforts from before the plan began', () => {
    const old = ride(0, '2026-10-01', 80, 3);
    expect(newBests([old, first, ride(2, '2026-11-05', 45, 2.5)], '2026-10-19', '2026-11-06')[0].previous.id).toBe(1);
  });
});

describe('swimsByWater', () => {
  const swim = (id: number, openWater: boolean, metres = 1400, seconds = 2100) =>
    activity({ id, sport: 'swim', date: '2026-11-02', distanceM: metres, movingS: seconds, openWater });

  it('adds up pool and open water swims separately', () => {
    const t = swimsByWater([swim(1, false), swim(2, false, 1000, 1500), swim(3, true, 1900, 3300)], '2026-10-19');
    expect(t.pool).toEqual({ count: 2, metres: 2400, seconds: 3600 });
    expect(t.open).toEqual({ count: 1, metres: 1900, seconds: 3300 });
  });

  it('skips swims without a distance', () => {
    expect(swimsByWater([swim(1, false, 0, 0)], '2026-10-19').pool.count).toBe(0);
  });
});

describe('bestValue', () => {
  it('writes each kind of best effort in its own units', () => {
    const swim = activity({ id: 1, sport: 'swim', date: '2026-11-02', distanceM: 1500, movingS: 1800, avgSpeed: 100 / 120 });
    expect(bestValue({ measure: 'distance', sport: 'swim', activity: swim })).toBe('1,500 m');
    expect(bestValue({ measure: 'speed', sport: 'swim', activity: swim })).toBe('2:00 /100m');
    const ride = activity({ id: 2, sport: 'bike', date: '2026-11-02', elevationM: 310.4, avgSpeed: 7.5 });
    expect(bestValue({ measure: 'climb', sport: 'bike', activity: ride })).toBe('310 m');
    expect(bestValue({ measure: 'speed', sport: 'bike', activity: ride })).toBe('27.0 km/h');
  });
});
