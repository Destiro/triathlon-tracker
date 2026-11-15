import { Activity } from '../activities';
import { findSame, localIso, mergeWorkouts, needsReading, READ_VERSION, SessionData, sessionToActivity } from '../health/workouts';
import { activity } from './helpers';

const START = '2026-11-16T06:00:00.000Z';
const END = '2026-11-16T06:30:00.000Z';
const at = (seconds: number) => new Date(Date.parse(START) + seconds * 1000).toISOString();

/** A 30-minute pool swim: 1,450 m, a heart rate reading every 5 s, and one reading from before it. */
const swim = (over: Partial<SessionData> = {}): SessionData => ({
  session: { startTime: START, endTime: END, exerciseType: 74, title: 'Pool swim' },
  distances: [{ distance: { inMeters: 1000 } }, { distance: { inMeters: 450 } }],
  heartRates: [
    {
      samples: [
        { time: at(-60), beatsPerMinute: 70 },
        ...Array.from({ length: 361 }, (_, i) => ({ time: at(i * 5), beatsPerMinute: i === 100 ? 160 : 140 })),
      ],
    },
  ],
  speeds: [],
  elevations: [],
  calories: [],
  ...over,
});

describe('sessionToActivity', () => {
  it('turns a pool swim into an activity, with its distance, heart rate and zones', () => {
    const a = sessionToActivity(swim())!;
    expect(a).toMatchObject({ id: Date.parse(START), name: 'Pool swim', sport: 'swim', type: 'Swimming (pool)', distanceM: 1450, elapsedS: 1800, openWater: false, source: 'health' });
    // Local time without a zone, which reads back as the same moment.
    expect(new Date(a.start).getTime()).toBe(Date.parse(START));
    expect(a.date).toBe(a.start.slice(0, 10));
    expect(a.maxHr).toBe(160);
    expect(a.avgHr).toBeCloseTo((360 * 140 + 160) / 361, 1);
    // A reading every 5 s for 30 minutes (and a second for the last one), 5 s of it at 160.
    expect(a.hr).toEqual({ 140: 1796, 160: 5 });
  });

  it('works out moving time from the speed while moving, so stops do not slow the pace', () => {
    const run = swim({
      distances: [{ distance: { inMeters: 5000 } }],
      // 3 m/s while moving, standing still at lights some of the time.
      speeds: [{ samples: [0, 3, 3, 0.1, 3].map((v, i) => ({ time: at(i * 60), speed: { inMetersPerSecond: v } })) }],
    });
    run.session = { startTime: START, endTime: END, exerciseType: 56 };
    const a = sessionToActivity(run)!;
    expect(a).toMatchObject({ sport: 'run', name: 'Running', movingS: 1667, elapsedS: 1800 });
    expect(a.avgSpeed).toBeCloseTo(3, 2);
    expect(a.openWater).toBeUndefined();
  });

  it('uses the whole time when there is no speed or distance', () => {
    const a = sessionToActivity(swim({ distances: [] }))!;
    expect([a.movingS, a.distanceM, a.avgSpeed]).toEqual([1800, 0, 0]);
  });

  it('calls an open-water swim open water', () => {
    const data = swim();
    data.session = { ...data.session, exerciseType: 73 };
    expect(sessionToActivity(data)?.openWater).toBe(true);
  });

  it('keeps the heart rate but has no zones when a gym app wrote only a few readings', () => {
    const gym = swim({ heartRates: [{ samples: [0, 600, 1200].map((s) => ({ time: at(s), beatsPerMinute: 80 })) }], distances: [] });
    gym.session = { ...gym.session, exerciseType: 70, title: 'Light legs' };
    expect(sessionToActivity(gym)).toMatchObject({ sport: 'gym', name: 'Light legs', avgHr: 80, hr: {} });
  });

  it('leaves out walks, and keeps other workouts as other', () => {
    const walk = swim();
    walk.session = { ...walk.session, exerciseType: 79 };
    expect(sessionToActivity(walk)).toBeNull();
    const other = swim();
    other.session = { ...other.session, exerciseType: 0 };
    expect(sessionToActivity(other)?.sport).toBe('other');
  });

  it('rejects a workout that ends before it starts', () => {
    const bad = swim();
    bad.session = { ...bad.session, endTime: START };
    expect(sessionToActivity(bad)).toBeNull();
  });
});

describe('keeping Strava history while reading Health Connect', () => {
  const local = (iso: string) => localIso(Date.parse(iso));
  // Saved from Strava before the switch, under Strava's own ids.
  const stravaRun = activity({ id: 16000000001, sport: 'run', date: local('2026-11-13T02:51:00.000Z').slice(0, 10), start: local('2026-11-13T02:51:00.000Z'), distanceM: 6100, elevationM: 40, hr: { 150: 2000 } });
  const stravaRide = activity({ id: 16000000002, sport: 'bike', date: local('2026-11-12T05:00:00.000Z').slice(0, 10), start: local('2026-11-12T05:00:00.000Z'), distanceM: 20000 });
  const fromHealth = (iso: string, over: Partial<Activity> = {}): Activity =>
    activity({ id: Date.parse(iso), sport: 'run', date: local(iso).slice(0, 10), start: local(iso), distanceM: 6080, source: 'health', read: READ_VERSION, hr: { 148: 2100 }, ...over });

  it('finds the same workout by id, or the same sport started within ten minutes', () => {
    expect(findSame([stravaRun], fromHealth('2026-11-13T02:51:20.000Z'))).toBe(stravaRun);
    expect(findSame([stravaRun], fromHealth('2026-11-13T03:05:00.000Z'))).toBeUndefined();
    expect(findSame([stravaRun], fromHealth('2026-11-13T02:51:20.000Z', { sport: 'bike' }))).toBeUndefined();
  });

  it('never replaces or duplicates a workout saved from Strava', () => {
    expect(mergeWorkouts([stravaRun, stravaRide], [fromHealth('2026-11-13T02:51:20.000Z')])).toEqual([stravaRun, stravaRide]);
  });

  it('fills in heart rate zones Strava never gave, and keeps the rest of the Strava workout', () => {
    const merged = mergeWorkouts([stravaRide], [fromHealth('2026-11-12T05:00:30.000Z', { sport: 'bike', avgHr: 141, maxHr: 170 })]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: stravaRide.id, distanceM: 20000, hr: { 148: 2100 }, avgHr: 141, maxHr: 170 });
  });

  it('adds new workouts, newest first, and updates a recent one read again', () => {
    const today = fromHealth('2026-11-15T21:13:00.000Z');
    const merged = mergeWorkouts([stravaRun], [today]);
    expect(merged.map((a) => a.id)).toEqual([today.id, stravaRun.id]);
    const again = mergeWorkouts(merged, [{ ...today, distanceM: 6200 }]);
    expect(again).toHaveLength(2);
    expect(again[0].distanceM).toBe(6200);
  });

  it('keeps the fuller one when two apps wrote the same workout', () => {
    const watch = fromHealth('2026-11-14T05:00:00.000Z', { sport: 'gym', distanceM: 0, avgHr: 120, hr: { 120: 1500 } });
    const app = fromHealth('2026-11-14T05:01:00.000Z', { sport: 'gym', distanceM: 0, avgHr: undefined, hr: {} });
    expect(mergeWorkouts([watch], [app])).toEqual([watch]);
    expect(mergeWorkouts([app], [watch])).toEqual([watch]);
  });

  it('reads a workout in full only when it is new, recent, or a Strava one missing its zones', () => {
    const refreshAfter = Date.parse('2026-11-13T12:00:00.000Z');
    const session = (startTime: string, exerciseType = 56) => ({ startTime, exerciseType });
    const saved = [stravaRun, stravaRide, fromHealth('2026-11-10T05:00:00.000Z'), fromHealth('2026-11-14T05:00:00.000Z')];
    expect(needsReading(session('2026-11-11T05:00:00.000Z'), saved, refreshAfter)).toBe(true); // new
    expect(needsReading(session('2026-11-10T05:00:00.000Z'), saved, refreshAfter)).toBe(false); // read before
    expect(needsReading(session('2026-11-14T05:00:00.000Z'), saved, refreshAfter)).toBe(true); // recent, may have changed
    expect(needsReading(session('2026-11-13T02:51:20.000Z'), saved, refreshAfter)).toBe(false); // Strava, has zones
    expect(needsReading(session('2026-11-12T05:00:30.000Z', 8), saved, refreshAfter)).toBe(true); // Strava, no zones
    expect(needsReading(session('2026-11-11T05:00:00.000Z', 79), saved, refreshAfter)).toBe(false); // a walk
  });
});
