import { haversine } from '../lib/geo';
import { addFix, addLap, finish, legElapsed, nextLeg, pause, resume, startSession, toWorkout, totalElapsed } from '../lib/session';
import { DATA_VERSION, DEFAULT_SETTINGS, migrate } from '../lib/migrate';

const KM_LAT = 1000 / haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
const T0 = 1_800_000_000_000;
const at = (sec: number) => T0 + sec * 1000;
/** A fix `m` metres north of the start. */
const north = (m: number) => ({ lat: -41.29 + (m / 1000) * KM_LAT, lon: 174.78, accuracy: 5 });

describe('timing', () => {
  it('counts moving time only, leaving pauses out', () => {
    let s = startSession(['run'], at(0), 25);
    expect(totalElapsed(s, at(60))).toBe(60_000);
    s = pause(s, at(60));
    expect(totalElapsed(s, at(500))).toBe(60_000);
    s = resume(s, at(500));
    expect(totalElapsed(s, at(530))).toBe(90_000);
    s = finish(s, at(530));
    expect(s.status).toBe('finished');
    expect(totalElapsed(s, at(9999))).toBe(90_000);
  });

  it('ignores actions that make no sense in the current state', () => {
    const s = startSession(['run'], at(0), 25);
    expect(resume(s, at(10))).toBe(s);
    const paused = pause(s, at(10));
    expect(pause(paused, at(20))).toBe(paused);
    const done = finish(s, at(10));
    expect(nextLeg(done, at(20))).toBe(done);
  });

  it('times each leg of a multisport session and finishes after the last', () => {
    let s = startSession(['swim', 'transition', 'bike'], at(0), 25);
    s = nextLeg(s, at(600)); // swim done
    s = nextLeg(s, at(690)); // T1 done
    expect(s.index).toBe(2);
    expect(legElapsed(s, at(4290))).toBe(3_600_000);
    s = nextLeg(s, at(4290)); // last leg: finishes
    expect(s.status).toBe('finished');
    expect(s.segments.map((x) => x.elapsedMs)).toEqual([600_000, 90_000, 3_600_000]);
  });

  it('starts the clock again when moving to the next leg while paused', () => {
    let s = startSession(['bike', 'run'], at(0), 25);
    s = pause(s, at(100));
    s = nextLeg(s, at(200));
    expect(s.status).toBe('running');
    expect(totalElapsed(s, at(260))).toBe(160_000);
  });
});

describe('GPS distance', () => {
  it('adds up accepted fixes on a run', () => {
    let s = startSession(['run'], at(0), 25);
    for (let i = 0; i <= 10; i++) s = addFix(s, north(i * 100), at(i * 30));
    expect(s.segments[0].distanceM).toBeCloseTo(1000, 0);
    expect(s.segments[0].points).toHaveLength(11);
  });

  it('skips inaccurate fixes, impossible jumps, and fixes while paused', () => {
    let s = startSession(['run'], at(0), 25);
    s = addFix(s, north(0), at(0));
    s = addFix(s, { ...north(100), accuracy: 80 }, at(30));
    s = addFix(s, north(5000), at(31)); // 5 km in a second
    s = addFix(s, north(100), at(40));
    expect(s.segments[0].distanceM).toBeCloseTo(100, 0);
    s = pause(s, at(40));
    s = addFix(s, north(200), at(60));
    expect(s.segments[0].points).toHaveLength(2);
  });

  it('does not count ground covered during a pause', () => {
    let s = startSession(['run'], at(0), 25);
    s = addFix(s, north(0), at(0));
    s = addFix(s, north(100), at(30));
    s = pause(s, at(30));
    s = resume(s, at(300));
    s = addFix(s, north(400), at(301)); // walked 300 m while paused
    s = addFix(s, north(500), at(331));
    expect(s.segments[0].distanceM).toBeCloseTo(200, 0);
    expect(s.segments[0].points[2].brk).toBe(true);
  });

  it('takes no GPS on swims and counts pool lengths instead', () => {
    let s = startSession(['swim'], at(0), 25);
    s = addFix(s, north(0), at(0));
    expect(s.segments[0].points).toHaveLength(0);
    s = addLap(addLap(addLap(s)));
    s = addLap(s, -1);
    expect(s.segments[0]).toMatchObject({ laps: 2, distanceM: 50 });
    expect(addLap(startSession(['run'], at(0), 25))).toMatchObject({ segments: [{ laps: 0 }] });
  });
});

describe('toWorkout', () => {
  it('saves times, distance, splits and a thinned route', () => {
    let s = startSession(['run'], at(0), 25);
    for (let i = 0; i <= 30; i++) s = addFix(s, north(i * 100), at(i * 30));
    const w = toWorkout(s, at(900), 'id1');
    expect(w).toMatchObject({ id: 'id1', source: 'tracked', segments: [{ sport: 'run', durationSec: 900, distanceM: 3000 }] });
    expect(w.splitsSec).toEqual([300, 300, 300]);
    expect(w.route!.length).toBeGreaterThanOrEqual(2);
    expect(w.route!.length).toBeLessThan(31);
    expect(w.startedAt).toBe(new Date(T0).toISOString());
  });

  it('drops empty legs and keeps lap counts', () => {
    let s = startSession(['swim', 'transition', 'bike'], at(0), 50);
    s = addLap(addLap(s));
    s = nextLeg(s, at(300));
    s = nextLeg(s, at(300)); // skipped transition: no time
    const w = toWorkout(s, at(900), 'id2');
    expect(w.segments.map((x) => x.sport)).toEqual(['swim', 'bike']);
    expect(w.segments[0]).toMatchObject({ laps: 2, distanceM: 100 });
    expect(w.splitsSec).toBeUndefined();
  });
});

describe('migrate', () => {
  it('fills in defaults and drops what it cannot understand', () => {
    const data = migrate({
      workouts: [{ id: 'a', startedAt: '2026-10-01T07:00:00Z', segments: [] }, { nope: true }, null],
      races: [{ id: 'r', name: 'x', date: '2026-12-01' }, 'bad'],
      gear: 'bad',
      settings: { units: 'imperial', poolLengthM: -1 },
    });
    expect(data.version).toBe(DATA_VERSION);
    expect(data.workouts).toHaveLength(1);
    expect(data.races).toHaveLength(1);
    expect(data.gear).toEqual([]);
    expect(data.plan).toBeNull();
    expect(data.settings).toEqual({ ...DEFAULT_SETTINGS, units: 'imperial' });
  });

  it('refuses data that is not ours or from a newer version', () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate([])).toThrow();
    expect(() => migrate({ version: DATA_VERSION + 1 })).toThrow();
  });
});
