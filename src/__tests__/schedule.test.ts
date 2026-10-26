import { buildSchedule, daysOfWeek } from '../plan/schedule';

const schedule = buildSchedule('2026-10-19', '2027-03-05', 'Ironman 70.3 New Zealand');

describe('buildSchedule', () => {
  it('starts week 1 on the chosen Monday, so 26 Oct is a Monday in week 2', () => {
    expect(schedule.get('2026-10-19')?.week).toBe(1);
    expect(schedule.get('2026-10-26')).toMatchObject({ week: 2, workouts: [] });
    expect(schedule.get('2026-10-27')?.workouts[0]).toMatchObject({ kind: 'bike', minutes: 50 });
  });

  it('puts the race on the race date, with the race name', () => {
    const race = schedule.get('2027-03-05');
    expect(race?.week).toBe(20);
    expect(race?.workouts[0]).toMatchObject({ kind: 'race', title: 'Ironman 70.3 New Zealand' });
  });

  it('counts race week back from the race, and lets it replace the days of week 19 it overlaps', () => {
    expect(daysOfWeek(schedule, 20).map((d) => d.date)).toEqual([
      '2027-02-27',
      '2027-02-28',
      '2027-03-01',
      '2027-03-02',
      '2027-03-03',
      '2027-03-04',
      '2027-03-05',
    ]);
    expect(schedule.get('2027-02-26')?.week).toBe(19);
    expect(daysOfWeek(schedule, 19)).toHaveLength(5);
  });

  it('has no days before the plan starts or after the race', () => {
    expect(schedule.get('2026-10-18')).toBeUndefined();
    expect(schedule.get('2027-03-06')).toBeUndefined();
  });

  it('keeps all seven days of week 19 when the race falls on the plan own Sunday', () => {
    const sunday = buildSchedule('2026-10-19', '2027-03-07', 'Race');
    expect(daysOfWeek(sunday, 19)).toHaveLength(7);
    expect(sunday.get('2027-03-07')?.week).toBe(20);
  });
});
