import { EMPTY_DATA } from '../lib/migrate';
import { hasSamples, sampleData, withoutSamples, withSamples } from '../lib/sample';
import { workout } from './fixtures';

const today = new Date(2026, 9, 28, 12);

describe('sample data', () => {
  it('is six weeks of training up to today, an upcoming race and gear', () => {
    const s = sampleData(today);
    expect(s.workouts.length).toBeGreaterThan(30);
    expect(s.workouts.every((w) => new Date(w.startedAt) <= today)).toBe(true);
    expect(new Set(s.workouts.map((w) => w.id)).size).toBe(s.workouts.length);
    expect(s.races[0].date > '2026-10-28').toBe(true);
    expect(s.workouts.some((w) => w.segments.length > 1)).toBe(true);
    expect(sampleData(today)).toEqual(s);
  });

  it('can be added alongside your data without duplicating, and removed again', () => {
    const mine = { ...EMPTY_DATA, workouts: [workout('2026-10-27', 'run', 30, 5)] };
    const once = withSamples(mine, today);
    expect(withSamples(once, today).workouts).toHaveLength(once.workouts.length);
    expect(hasSamples(once)).toBe(true);
    const back = withoutSamples({ ...once, plan: { raceId: 'sample-race', createdAt: '', weeklyHours: 8, weeks: [] } });
    expect(back.workouts).toEqual(mine.workouts);
    expect(back.races).toEqual([]);
    expect(back.gear).toEqual([]);
    expect(back.plan).toBeNull();
    expect(hasSamples(back)).toBe(false);
  });
});
