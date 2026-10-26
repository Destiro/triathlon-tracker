import { byDate } from '../activities';
import { buildSchedule } from '../plan/schedule';
import { efficiency, loadSeries, records, trainingLoad, weekCompliance, weekVolume } from '../stats';
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
