import { matchDay } from '../matching';
import { buildSchedule } from '../plan/schedule';
import { activity } from './helpers';

const schedule = buildSchedule('2026-10-19', '2027-03-05', 'Race');
// Week 2: Tue 27 Oct bike 50 min, Wed 28 swim 1,300 + run 30, Sat 31 brick 45 + 10.
const TUESDAY = '2026-10-27';
const WEDNESDAY = '2026-10-28';
const SATURDAY = '2026-10-31';

describe('matchDay', () => {
  it('counts a ride of about the planned length as done', () => {
    const [r] = matchDay(schedule.get(TUESDAY), [activity({ id: 1, sport: 'bike', date: TUESDAY, movingS: 48 * 60 })], '2026-10-30').results;
    expect(r.status).toBe('done');
  });

  it('counts a short session as partly done', () => {
    const [r] = matchDay(schedule.get(TUESDAY), [activity({ id: 1, sport: 'bike', date: TUESDAY, movingS: 25 * 60 })], '2026-10-30').results;
    expect(r.status).toBe('partial');
    expect(r.fraction).toBeCloseTo(0.5);
  });

  it('marks a past day with nothing recorded as missed, today as today and later days as upcoming', () => {
    expect(matchDay(schedule.get(TUESDAY), [], '2026-10-30').results[0].status).toBe('missed');
    expect(matchDay(schedule.get(TUESDAY), [], TUESDAY).results[0].status).toBe('today');
    expect(matchDay(schedule.get(TUESDAY), [], '2026-10-26').results[0].status).toBe('upcoming');
  });

  it('matches each workout to its own sport on a two-workout day and leaves the rest as extras', () => {
    const acts = [
      activity({ id: 1, sport: 'swim', date: WEDNESDAY, distanceM: 1300, movingS: 2400 }),
      activity({ id: 2, sport: 'run', date: WEDNESDAY, movingS: 30 * 60 }),
      activity({ id: 3, sport: 'bike', date: WEDNESDAY, movingS: 40 * 60 }),
    ];
    const { results, extras } = matchDay(schedule.get(WEDNESDAY), acts, '2026-10-30');
    expect(results.map((r) => r.status)).toEqual(['done', 'done']);
    expect(extras.map((a) => a.id)).toEqual([3]);
  });

  it('adds up a swim recorded in two parts', () => {
    const acts = [
      activity({ id: 1, sport: 'swim', date: WEDNESDAY, distanceM: 700, movingS: 1200 }),
      activity({ id: 2, sport: 'swim', date: WEDNESDAY, distanceM: 600, movingS: 1100 }),
    ];
    expect(matchDay(schedule.get(WEDNESDAY), acts, '2026-10-30').results[0].fraction).toBeCloseTo(1);
  });

  it('lets a brick take both the ride and the run', () => {
    const acts = [
      activity({ id: 1, sport: 'bike', date: SATURDAY, movingS: 45 * 60 }),
      activity({ id: 2, sport: 'run', date: SATURDAY, movingS: 10 * 60 }),
    ];
    const { results, extras } = matchDay(schedule.get(SATURDAY), acts, '2026-11-02');
    expect(results[0].status).toBe('done');
    expect(results[0].activities).toHaveLength(2);
    expect(extras).toHaveLength(0);
  });

  it('treats activities on a rest day as extras', () => {
    const run = activity({ id: 1, sport: 'run', date: '2026-10-26', movingS: 1800 });
    const { results, extras } = matchDay(schedule.get('2026-10-26'), [run], '2026-10-27');
    expect(results).toEqual([]);
    expect(extras).toHaveLength(1);
  });
});
