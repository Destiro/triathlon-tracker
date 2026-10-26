import { Gear, Race, Segment, Workout } from '../types';
import { addDays, startOfWeek, toKey } from './dates';

/**
 * Six weeks of believable training and an upcoming Olympic race, for trying the app out. Deterministic, so the
 * same day always gives the same data.
 */
export function sampleData(today: Date): { workouts: Workout[]; races: Race[]; gear: Gear[] } {
  const workouts: Workout[] = [];
  const firstWeek = addDays(startOfWeek(today), -35);
  // Day of week (0 = Monday), sport legs, and a 1-6 week ramp factor.
  const week: { day: number; legs: (ramp: number) => Segment[]; rpe: number; gear?: string }[] = [
    { day: 1, legs: (r) => [{ sport: 'swim', durationSec: 1800 + r * 60, distanceM: 1500 + r * 50 }], rpe: 5 },
    { day: 2, legs: (r) => [{ sport: 'bike', durationSec: 3600 + r * 120, distanceM: 28_000 + r * 1200, elevationGainM: 180 }], rpe: 7, gear: 'bike' },
    { day: 3, legs: (r) => [{ sport: 'run', durationSec: 2400 + r * 60, distanceM: 7000 + r * 250 }], rpe: 6, gear: 'shoes' },
    { day: 4, legs: () => [{ sport: 'strength', durationSec: 2400, distanceM: 0 }], rpe: 5 },
    { day: 4, legs: (r) => [{ sport: 'swim', durationSec: 2100 + r * 60, distanceM: 1800 + r * 60 }], rpe: 4 },
    {
      day: 5,
      legs: (r) => [
        { sport: 'bike', durationSec: 5400 + r * 300, distanceM: 45_000 + r * 2500, elevationGainM: 420 },
        { sport: 'transition', durationSec: 150, distanceM: 0 },
        { sport: 'run', durationSec: 900, distanceM: 3000 },
      ],
      rpe: 6,
      gear: 'bike',
    },
    { day: 6, legs: (r) => [{ sport: 'run', durationSec: 3600 + r * 240, distanceM: 10_500 + r * 700 }], rpe: 5, gear: 'shoes' },
  ];
  for (let w = 0; w < 6; w++) {
    const ramp = w === 3 ? 1 : w + 1; // the fourth week is a lighter recovery week
    for (const [i, s] of week.entries()) {
      const day = addDays(firstWeek, w * 7 + s.day);
      if (day > today) continue;
      const startedAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), i % 2 ? 6 : 17, 30).toISOString();
      workouts.push({
        id: `sample-${w}-${i}`,
        startedAt,
        segments: s.legs(ramp),
        rpe: s.rpe,
        source: 'manual',
        ...(s.gear ? { gearId: `sample-${s.gear}` } : {}),
      });
    }
  }
  const races: Race[] = [{ id: 'sample-race', name: 'Summer Olympic Tri', date: toKey(addDays(today, 70)), distance: 'olympic', goalSec: 2 * 3600 + 35 * 60 }];
  const gear: Gear[] = [
    { id: 'sample-shoes', name: 'Daily trainers', kind: 'shoes', startDistanceM: 420_000, limitM: 700_000 },
    { id: 'sample-bike', name: 'Road bike', kind: 'bike', startDistanceM: 2_100_000, limitM: undefined },
  ];
  return { workouts, races, gear };
}
