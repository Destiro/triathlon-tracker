import { buildSchedule } from '../plan/schedule';
import { DEFAULT_SETTINGS, loadSettings } from '../settings';

describe('loadSettings', () => {
  it('has the race on Saturday 6 March 2027', () => {
    expect(DEFAULT_SETTINGS.raceDate).toBe('2027-03-06');
    expect(new Date(2027, 2, 6).getDay()).toBe(6);
    expect(loadSettings(undefined).raceDate).toBe('2027-03-06');
  });

  it('moves the old Friday default that earlier versions saved', () => {
    expect(loadSettings({ ...DEFAULT_SETTINGS, raceDate: '2027-03-05', maxHr: 185 })).toEqual({ ...DEFAULT_SETTINGS, maxHr: 185 });
  });

  it('leaves a date you chose alone, and the 5th for a race you renamed', () => {
    expect(loadSettings({ raceDate: '2027-03-13' }).raceDate).toBe('2027-03-13');
    expect(loadSettings({ raceDate: '2027-03-05', raceName: 'Another race' }).raceDate).toBe('2027-03-05');
  });

  it('puts the race on the Saturday in the plan', () => {
    const schedule = buildSchedule(DEFAULT_SETTINGS.planStart, DEFAULT_SETTINGS.raceDate, DEFAULT_SETTINGS.raceName);
    expect(schedule.get('2027-03-06')?.workouts.some((w) => w.kind === 'race')).toBe(true);
    expect(schedule.get('2027-03-05')?.workouts.some((w) => w.kind === 'race')).toBe(false);
  });
});
