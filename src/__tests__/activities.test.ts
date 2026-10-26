import { byDate, mergeActivities, toActivity } from '../activities';
import { activity } from './helpers';

describe('toActivity', () => {
  const raw = {
    id: 99,
    name: 'Morning Run',
    sport_type: 'TrailRun',
    start_date_local: '2026-10-27T06:45:10Z',
    distance: 5012.4,
    moving_time: 1500,
    elapsed_time: 1560,
    total_elevation_gain: 31,
    average_heartrate: 148.6,
    max_heartrate: 171,
    has_heartrate: true,
    average_speed: 3.34,
  };

  it('reads the fields the app uses and takes the local date from the start time', () => {
    expect(toActivity(raw)).toMatchObject({ id: 99, sport: 'run', date: '2026-10-27', start: '2026-10-27T06:45:10', avgHr: 148.6, movingS: 1500 });
  });

  it('files rides, swims and everything else under the right sport', () => {
    expect(toActivity({ ...raw, sport_type: 'VirtualRide' })?.sport).toBe('bike');
    expect(toActivity({ ...raw, sport_type: 'Swim' })?.sport).toBe('swim');
    expect(toActivity({ ...raw, sport_type: 'Yoga' })?.sport).toBe('other');
  });

  it('drops the heart rate when the watch did not record one', () => {
    expect(toActivity({ ...raw, has_heartrate: false })?.avgHr).toBeUndefined();
  });

  it('rejects entries that are missing an id or a start time', () => {
    expect(toActivity({ ...raw, id: undefined })).toBeNull();
    expect(toActivity({ ...raw, start_date_local: 'soon' })).toBeNull();
  });
});

describe('mergeActivities and byDate', () => {
  const a = activity({ id: 1, sport: 'run', date: '2026-10-20', name: 'Old name' });
  const b = activity({ id: 2, sport: 'bike', date: '2026-10-21' });

  it('replaces an activity edited on Strava rather than duplicating it, newest first', () => {
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
