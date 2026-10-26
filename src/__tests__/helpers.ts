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
