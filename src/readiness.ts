import { Activity } from './activities';
import { RaceDistances } from './prediction';

export interface Longest {
  /** The longest single swim, ride and run, in metres. */
  swim: number;
  bike: number;
  run: number;
  /** The best bike-then-run on one day, by how close it comes to the race legs. Null if there has not been one. */
  brick: { bikeM: number; runM: number; date: string } | null;
}

/** The longest sessions so far, to set against the race distances. */
export function longestSoFar(activities: Activity[], todayKey: string, race: RaceDistances): Longest {
  const past = activities.filter((a) => a.date <= todayKey && a.distanceM > 0);
  const longest = (sport: Activity['sport']) => Math.max(0, ...past.filter((a) => a.sport === sport).map((a) => a.distanceM));

  let brick: Longest['brick'] = null;
  let bestScore = 0;
  const rides = past.filter((a) => a.sport === 'bike');
  const runs = past.filter((a) => a.sport === 'run');
  for (const ride of rides) {
    for (const run of runs) {
      if (run.date !== ride.date || run.start < ride.start) continue;
      const score = ride.distanceM / race.bike + run.distanceM / race.run;
      if (score > bestScore) {
        bestScore = score;
        brick = { bikeM: ride.distanceM, runM: run.distanceM, date: ride.date };
      }
    }
  }
  return { swim: longest('swim'), bike: longest('bike'), run: longest('run'), brick };
}

/** How far along a distance is, 0 to 1. */
export const shareOf = (done: number, race: number): number => (race > 0 ? Math.min(done / race, 1) : 0);
