import { Activity } from '../activities';
import { predictRace, T1_SECONDS, T2_SECONDS } from '../prediction';
import { activity } from './helpers';

const TODAY = '2026-12-14';
const RACE = { swim: 1900, bike: 90000, run: 21100 };

// A pool swim at 2:10 /100 m, a ride at 20 km/h and a run at 6:00 /km: simple numbers to check by hand.
let nextId = 1;
const swim = (over: Partial<Activity> = {}) =>
  activity({ id: nextId++, sport: 'swim', date: '2026-12-10', distanceM: 1500, movingS: 1950, openWater: false, ...over });
const ride = (over: Partial<Activity> = {}) => activity({ id: nextId++, sport: 'bike', date: '2026-12-11', distanceM: 30000, movingS: 5400, ...over });
const run = (over: Partial<Activity> = {}) => activity({ id: nextId++, sport: 'run', date: '2026-12-12', distanceM: 10000, movingS: 3600, ...over });
const three = (make: () => Activity) => [make(), make(), make()];

const SWIM_S = 1900 * 1.1 * 1.3; // 2:10 /100 m, slowed 10% for open water
const BIKE_S = 90000 / (30000 / 5400); // 4:30
const RUN_S = 21100 / (10000 / 3600); // 6:00 /km

describe('predictRace', () => {
  it('has nothing to go on without training, and says what is missing', () => {
    const p = predictRace([], TODAY, RACE);
    expect([p.swim.seconds, p.bike.seconds, p.run.seconds, p.total, p.low, p.high, p.confidence]).toEqual([null, null, null, null, null, null, null]);
    expect(p.swim.basedOn).toBe('Needs a swim of 1 km or more in the last 6 weeks.');
    expect(p.bike.basedOn).toBe('Needs a ride of 15 km and 45 minutes or more in the last 6 weeks.');
    expect(p.run.basedOn).toBe('Needs a run of 4 km or more in the last 6 weeks.');
  });

  it('adds up swim, bike, run and the two transitions', () => {
    const p = predictRace([...three(swim), ...three(ride), ...three(run)], TODAY, RACE);
    expect(p.swim.seconds).toBeCloseTo(SWIM_S);
    expect(p.bike.seconds).toBeCloseTo(BIKE_S);
    expect(p.run.seconds).toBeCloseTo(RUN_S);
    expect(p.total).toBeCloseTo(SWIM_S + BIKE_S + RUN_S + T1_SECONDS + T2_SECONDS);
    expect(p.swim.speed).toBeCloseTo(100 / 130 / 1.1);
  });

  it('keeps the legs it can predict when one is missing, but gives no total', () => {
    const p = predictRace([...three(swim), ...three(run)], TODAY, RACE);
    expect(p.swim.seconds).not.toBeNull();
    expect(p.run.seconds).not.toBeNull();
    expect(p.bike.seconds).toBeNull();
    expect(p.total).toBeNull();
    expect(p.confidence).toBeNull();
  });

  it('uses open water swims as they are, without the pool slowdown', () => {
    const openSwim = swim({ openWater: true, distanceM: 1500, movingS: 2250 }); // 2:30 /100 m
    const p = predictRace([openSwim, ...three(ride), ...three(run)], TODAY, RACE);
    expect(p.swim.seconds).toBeCloseTo(1900 * 1.5);
    expect(p.swim.basedOn).toBe('Average pace of your 1 fastest open water swim over 1 km.');
  });

  it('goes on the three best sessions, so a slow or short one changes nothing', () => {
    const base = [...three(swim), ...three(ride), ...three(run)];
    const extra = [
      swim({ movingS: 3000 }), // a much slower swim
      swim({ distanceM: 600, movingS: 300 }), // too short to count
      ride({ distanceM: 8000, movingS: 1200 }), // too short
      ride({ distanceM: 20000, movingS: 7200 }), // shorter than the best three and slow
      run({ distanceM: 3000, movingS: 600 }), // too short
    ];
    expect(predictRace([...base, ...extra], TODAY, RACE).total).toBeCloseTo(predictRace(base, TODAY, RACE).total!);
  });

  it('takes the fastest swims, the longest rides and the longest runs', () => {
    const fast = swim({ movingS: 1500 }); // 1:40 /100 m
    const p = predictRace([fast, ...three(swim), ...three(ride), ...three(run)], TODAY, RACE);
    const expectedSpeed = ((1500 / 1500 + 2 * (1500 / 1950)) / 3) / 1.1;
    expect(p.swim.speed).toBeCloseTo(expectedSpeed);
    const longRide = ride({ distanceM: 60000, movingS: 10800 }); // 20 km/h too, but the longest
    const q = predictRace([...three(swim), longRide, ...three(ride), ...three(run)], TODAY, RACE);
    expect(q.bike.basedOn).toBe('Average speed of your 3 longest rides. Hills change this a lot.');
  });

  it('only counts the last six weeks, and nothing from after today', () => {
    const old = swim({ date: '2026-10-01', movingS: 1000 });
    const future = swim({ date: '2026-12-20', movingS: 1000 });
    const withOldAndFuture = predictRace([old, future, ...three(swim), ...three(ride), ...three(run)], TODAY, RACE);
    expect(withOldAndFuture.swim.seconds).toBeCloseTo(SWIM_S);
    const onlyOld = predictRace([old, ...three(ride), ...three(run)], TODAY, RACE);
    expect(onlyOld.swim.seconds).toBeNull();
  });

  it('is more sure with more sessions on every leg, and widens the range when unsure', () => {
    const sessions = (n: number) => {
      const out: Activity[] = [];
      for (let i = 0; i < n; i++) out.push(swim(), ride(), run());
      return out;
    };
    const rough = predictRace(sessions(1), TODAY, RACE);
    const fair = predictRace(sessions(2), TODAY, RACE);
    const good = predictRace(sessions(4), TODAY, RACE);
    expect([rough.confidence, fair.confidence, good.confidence]).toEqual(['rough', 'fair', 'good']);
    expect(rough.low).toBeCloseTo(rough.total! * 0.88);
    expect(rough.high).toBeCloseTo(rough.total! * 1.12);
    expect(good.low).toBeCloseTo(good.total! * 0.96);
    // The least-trained leg sets the confidence.
    const lopsided = predictRace(sessions(4).filter((a) => a.sport !== 'run').concat(run()), TODAY, RACE);
    expect(lopsided.confidence).toBe('rough');
  });
});
