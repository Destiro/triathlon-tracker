import { Activity } from '../activities';

/** A watch activity with sensible defaults, so each test only states what it cares about. */
export function activity(overrides: Partial<Activity> & Pick<Activity, 'id' | 'sport' | 'date'>): Activity {
  return {
    name: 'Workout',
    type: overrides.sport === 'bike' ? 'Ride' : overrides.sport === 'swim' ? 'Swim' : 'Run',
    start: `${overrides.date}T07:00:00`,
    distanceM: 0,
    movingS: 0,
    elapsedS: overrides.movingS ?? 0,
    elevationM: 0,
    avgSpeed: 0,
    ...overrides,
  };
}

/**
 * What the coach sees on Friday 6 November 2026, week 3: the morning swim is in, the run is still to do, a gym
 * session of your own repeats on Thursdays, two nights of sleep are recorded and a cold started on Wednesday.
 */
export function coachData(): import('../coach/tools').CoachData {
  /* eslint-disable @typescript-eslint/no-require-imports -- loaded lazily so tests that mock these modules still can */
  const { byDate } = require('../activities');
  const { buildSchedule } = require('../plan/schedule');
  const { applyEdits, addSessions, NO_EDITS } = require('../plan/edits');
  const { DEFAULT_SETTINGS } = require('../settings');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const settings = { ...DEFAULT_SETTINGS, planStart: '2026-10-19', raceDate: '2027-03-06' };
  let n = 0;
  const edits = addSessions(NO_EDITS, { date: '2026-11-05', title: 'Gym: legs', minutes: 45, repeatWeekly: true }, settings.raceDate, () => `s${n++}`);
  const activities = [
    activity({ id: 1, sport: 'swim', date: '2026-11-06', name: 'Morning Swim', distanceM: 1300, movingS: 1880, avgSpeed: 0.69, avgHr: 138 }),
    activity({ id: 2, sport: 'bike', date: '2026-11-05', name: 'Evening Ride', distanceM: 31000, movingS: 3600, avgSpeed: 8.6, avgHr: 131, elevationM: 240 }),
  ];
  const night = (asleepMin: number, sleepingHr: number) => ({ start: '', end: '', asleepMin, awakeMin: 20, deepMin: 60, remMin: 80, lightMin: asleepMin - 140, sleepingHr });
  return {
    todayKey: '2026-11-06',
    settings,
    schedule: applyEdits(buildSchedule(settings.planStart, settings.raceDate, settings.raceName), edits),
    activities,
    activitiesByDate: byDate(activities),
    health: {
      '2026-11-05': { date: '2026-11-05', sleep: night(430, 52), hrv: 61, restingHr: 49 },
      '2026-11-06': { date: '2026-11-06', sleep: night(310, 58), hrv: 44, restingHr: 54 },
    },
    notes: {},
    issues: [{ id: 'cold', kind: 'illness', title: 'Head cold', start: '2026-11-04', severity: 1 }],
  };
}
