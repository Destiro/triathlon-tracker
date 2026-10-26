import { DEFAULT_LIMITS, gearDistance, gearKindsFor, wear } from '../lib/gear';
import { describeForm, intensityFactor, loadSeries, trainingStress } from '../lib/load';
import { daysUntil, goalSplits, nextRace, predictFinish, raceLegs, riegel } from '../lib/races';
import { currentStreak, newBests, personalBests, recent, totals, weeklyVolume } from '../lib/stats';
import { isMultisport, primarySport, sportTotals, workoutDistance, workoutDuration, workoutTitle } from '../lib/workout';
import { estimateMaxHr, hrZones, zoneFor } from '../lib/zones';
import { Gear, Race } from '../types';
import { multi, workout } from './fixtures';

const today = new Date(2026, 9, 28, 12); // Wednesday 28 October 2026

describe('workout helpers', () => {
  const brick = multi('2026-10-27', [
    { sport: 'bike', durationSec: 3600, distanceM: 30_000 },
    { sport: 'transition', durationSec: 120, distanceM: 0 },
    { sport: 'run', durationSec: 900, distanceM: 3000 },
  ]);

  it('totals legs and recognises bricks', () => {
    expect(workoutDuration(brick)).toBe(4620);
    expect(workoutDistance(brick)).toBe(33_000);
    expect(isMultisport(brick)).toBe(true);
    expect(primarySport(brick)).toBe('multisport');
    expect(sportTotals(brick, 'run')).toEqual({ durationSec: 900, distanceM: 3000 });
    expect(workoutTitle(brick)).toBe('Bike + Run');
    expect(primarySport(workout('2026-10-27', 'swim', 30))).toBe('swim');
    expect(workoutTitle({ ...brick, title: '  Club brick ' })).toBe('Club brick');
  });
});

describe('heart-rate zones', () => {
  it('uses percentages of max, or heart-rate reserve when resting HR is known', () => {
    expect(hrZones(200).map((z) => [z.min, z.max])).toEqual([
      [100, 120],
      [120, 140],
      [140, 160],
      [160, 180],
      [180, 200],
    ]);
    expect(hrZones(200, 50)[0]).toEqual({ zone: 1, name: 'Recovery', min: 125, max: 140 });
  });

  it('places a heart rate in its zone', () => {
    const zones = hrZones(200);
    expect(zoneFor(90, zones)).toBeNull();
    expect(zoneFor(150, zones)?.zone).toBe(3);
    expect(zoneFor(205, zones)?.zone).toBe(5);
    expect(estimateMaxHr(30)).toBe(187);
  });
});

describe('training load', () => {
  const settings = { maxHr: 190, restingHr: 50 };

  it('scores an hour at threshold as 100 and scales with effort', () => {
    expect(intensityFactor(workout('2026-10-28', 'run', 60, 10, { rpe: 1 }), {})).toBeCloseTo(0.5);
    expect(intensityFactor(workout('2026-10-28', 'run', 60, 10, { rpe: 10 }), {})).toBeCloseTo(1.1);
    const atThreshold = workout('2026-10-28', 'run', 60, 10, { avgHr: Math.round(50 + 140 * 0.88) });
    expect(trainingStress(atThreshold, settings)).toBeCloseTo(100, -1);
    expect(trainingStress(workout('2026-10-28', 'run', 30, 5, { rpe: 3 }), {})).toBeLessThan(trainingStress(workout('2026-10-28', 'run', 30, 5, { rpe: 8 }), {}));
  });

  it('builds fitness slowly and fatigue quickly', () => {
    const block = Array.from({ length: 14 }, (_, i) => workout(`2026-10-${String(i + 15).padStart(2, '0')}`, 'bike', 90, 40, { rpe: 6 }));
    const series = loadSeries(block, {}, today, 30);
    expect(series).toHaveLength(30);
    const last = series[series.length - 1];
    expect(last.fatigue).toBeGreaterThan(last.fitness);
    expect(series[0].fitness).toBe(0);
  });

  it('describes form in words', () => {
    expect(describeForm(20).label).toBe('Very fresh');
    expect(describeForm(0).label).toBe('Balanced');
    expect(describeForm(-20).label).toBe('Productive');
    expect(describeForm(-40).label).toBe('Overreaching');
  });
});

describe('races and predictions', () => {
  const race: Race = { id: 'r', name: 'Taupo', date: '2026-12-05', distance: 'olympic' };

  it('knows race distances and counts down', () => {
    expect(raceLegs(race)).toEqual({ swimM: 1500, bikeM: 40_000, runM: 10_000 });
    expect(raceLegs({ distance: 'custom', custom: { swimM: 1, bikeM: 2, runM: 3 } })).toEqual({ swimM: 1, bikeM: 2, runM: 3 });
    expect(daysUntil(race, today)).toBe(38);
    const past = { ...race, id: 'p', date: '2026-10-01' };
    expect(nextRace([past, race], today)?.id).toBe('r');
    expect(nextRace([past], today)).toBeUndefined();
  });

  it('applies Riegel to slow longer efforts down', () => {
    expect(riegel(1200, 5000, 10_000)).toBeGreaterThan(2400);
    expect(riegel(1200, 5000, 5000)).toBe(1200);
  });

  it('predicts from recent training, and says when it had to guess', () => {
    const training = [workout('2026-10-20', 'run', 50, 10), workout('2026-10-22', 'bike', 80, 40), workout('2025-01-01', 'swim', 20, 1.5)];
    const p = predictFinish(race, training, today);
    expect(p.legs.find((l) => l.sport === 'run')).toMatchObject({ durationSec: 3000, estimated: false });
    expect(p.legs.find((l) => l.sport === 'bike')).toMatchObject({ durationSec: 4800, estimated: false });
    // The swim is too old to count, so a typical pace is used.
    expect(p.legs.find((l) => l.sport === 'swim')).toMatchObject({ durationSec: 2025, estimated: true });
    expect(p.totalSec).toBe(3000 + 4800 + 2025 + 180 + 120);
  });

  it('ignores efforts far shorter than the race leg', () => {
    const p = predictFinish({ distance: 'full' }, [workout('2026-10-20', 'run', 25, 5)], today);
    expect(p.legs.find((l) => l.sport === 'run')?.estimated).toBe(true);
  });
});

describe('stats', () => {
  const log = [
    workout('2026-10-26', 'run', 30, 6),
    workout('2026-10-27', 'swim', 40, 2),
    workout('2026-10-28', 'bike', 60, 25),
    workout('2026-10-20', 'run', 50, 10.5),
    multi('2026-10-24', [
      { sport: 'bike', durationSec: 3600, distanceM: 30_000 },
      { sport: 'run', durationSec: 1200, distanceM: 4000 },
    ]),
  ];

  it('adds up weekly volume per sport', () => {
    const weeks = weeklyVolume(log, today, 2);
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-10-19', '2026-10-26']);
    expect(weeks[1].seconds).toEqual({ swim: 2400, bike: 3600, run: 1800, strength: 0 });
    expect(weeks[1].sessions).toBe(3);
    expect(weeks[0].seconds.run).toBe(3000 + 1200);
    expect(weeks[0].metres.bike).toBe(30_000);
  });

  it('counts the current streak, allowing for not having trained yet today', () => {
    expect(currentStreak(log, today)).toBe(3);
    expect(currentStreak(log, new Date(2026, 9, 29))).toBe(3);
    expect(currentStreak(log, new Date(2026, 9, 31))).toBe(0);
  });

  it('finds personal bests from pace and distance', () => {
    const bests = personalBests(log);
    // The 10.5 km run (50 min) is quicker per km than the 6 km run (30 min), so its pace sets the 5 km best.
    expect(bests.find((b) => b.label === 'Fastest 5 km run')?.value).toBe(Math.round((3000 / 10_500) * 5000));
    expect(bests.find((b) => b.label === 'Fastest 10 km run')?.value).toBe(Math.round((3000 / 10_500) * 10_000));
    expect(bests.find((b) => b.label === 'Longest ride')?.value).toBe(30_000);
    expect(bests.find((b) => b.label === 'Fastest 1500 m swim')?.value).toBe(1800);
    expect(bests.find((b) => b.label === 'Fastest 40 km ride')).toBeUndefined();
  });

  it('totals everything, counting a brick for each sport in it', () => {
    const t = totals(log);
    expect(t.sessions).toBe(5);
    expect(t.bySport.run.sessions).toBe(3);
    expect(t.bySport.bike.distanceM).toBe(55_000);
    expect(recent(log, today, 3)).toHaveLength(3);
  });
});

describe('gear', () => {
  const shoes: Gear = { id: 'g', name: 'Pegasus', kind: 'shoes', startDistanceM: 600_000, limitM: DEFAULT_LIMITS.shoes };

  it('adds workout distance to the starting distance and warns near the limit', () => {
    const runs = [workout('2026-10-20', 'run', 50, 10, { gearId: 'g' }), workout('2026-10-21', 'run', 50, 10)];
    expect(gearDistance(shoes, runs)).toBe(610_000);
    expect(wear(shoes, runs).status).toBe('ok');
    expect(wear({ ...shoes, startDistanceM: 640_000 }, runs).status).toBe('soon');
    expect(wear({ ...shoes, startDistanceM: 700_000 }, runs).status).toBe('replace');
    expect(wear({ ...shoes, limitM: undefined }, runs)).toMatchObject({ status: 'ok', fraction: null });
    expect(gearKindsFor('run')).toContain('shoes');
    expect(gearKindsFor('bike')).not.toContain('shoes');
  });
});

describe('goal splits', () => {
  const race: Race = { id: 'r', name: 'x', date: '2026-12-05', distance: 'olympic' };

  it('shares the goal between legs in the predicted proportions, keeping transitions', () => {
    const p = predictFinish(race, [], today);
    const g = goalSplits(p, 2 * 3600 + 30 * 60)!;
    expect(Math.abs(g.totalSec - 9000)).toBeLessThanOrEqual(2);
    expect(g.t1Sec).toBe(p.t1Sec);
    const ratio = (x: typeof p) => x.legs[1].durationSec / x.legs[2].durationSec;
    expect(ratio(g)).toBeCloseTo(ratio(p), 2);
  });

  it('refuses a goal shorter than the transitions', () => {
    expect(goalSplits(predictFinish(race, [], today), 200)).toBeNull();
  });
});

describe('new personal bests', () => {
  it('reports bests that a workout sets, but not ones it merely matches or misses', () => {
    const old = [workout('2026-10-20', 'run', 30, 6)];
    const faster = workout('2026-10-27', 'run', 27, 6);
    const slower = workout('2026-10-27', 'run', 40, 6);
    const labels = (list: ReturnType<typeof newBests>) => list.map((b) => b.label);
    expect(labels(newBests(old, [...old, faster], faster.id))).toEqual(['Fastest 5 km run']);
    expect(newBests(old, [...old, slower], slower.id)).toEqual([]);
    const first = workout('2026-10-27', 'swim', 30, 1.5);
    expect(labels(newBests([], [first], first.id))).toEqual(['Fastest 400 m swim', 'Fastest 1500 m swim', 'Longest swim']);
  });
});
