import { byDate, mergeActivities } from '../activities';
import { activity } from './helpers';

describe('mergeActivities and byDate', () => {
  const a = activity({ id: 1, sport: 'run', date: '2026-10-20', name: 'Old name' });
  const b = activity({ id: 2, sport: 'bike', date: '2026-10-21' });

  it('replaces an activity that was edited rather than duplicating it, newest first', () => {
    const merged = mergeActivities([a, b], [{ ...a, name: 'New name' }]);
    expect(merged.map((x) => [x.id, x.name])).toEqual([
      [2, 'Workout'],
      [1, 'New name'],
    ]);
  });

  it('groups by local date in start order', () => {
    const early = activity({ id: 3, sport: 'swim', date: '2026-10-21', start: '2026-10-21T05:30:00' });
    expect(byDate([b, early]).get('2026-10-21')?.map((x) => x.id)).toEqual([3, 2]);
  });
});

describe('heart rate on activities', () => {
  it('keeps the heart rate breakdown already saved when a fresh copy has none', () => {
    const saved = activity({ id: 1, sport: 'run', date: '2026-10-20', hr: { 140: 600 } });
    const fresh = activity({ id: 1, sport: 'run', date: '2026-10-20', name: 'Renamed' });
    const merged = mergeActivities([saved], [fresh]);
    expect(merged[0]).toMatchObject({ name: 'Renamed', hr: { 140: 600 } });
  });
});
