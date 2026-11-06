import { PLAN } from '../plan/data';
import { histogramFromResponse, histogramFromStream, shareInZones, targetZones, wantsZones, zoneIndex, zoneSeconds, zoneVerdict } from '../zones';
import { activity } from './helpers';

const week3 = PLAN[2].days;

describe('zoneIndex and zoneSeconds', () => {
  it('puts a heart rate in the zone that starts at or below it, for a max of 190', () => {
    // Zones start at 60, 70, 80 and 90 percent of 190: 114, 133, 152 and 171.
    const zones = [100, 113, 114, 132, 133, 151, 152, 170, 171, 190].map((bpm) => zoneIndex(bpm, 190) + 1);
    expect(zones).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('adds up the seconds spent in each zone', () => {
    expect(zoneSeconds({ 100: 60, 120: 600, 140: 1200, 160: 300, 180: 30 }, 190)).toEqual([60, 600, 1200, 300, 30]);
  });
});

describe('heart rate from a stream', () => {
  it('counts each sample for the time until the next, and the last for a second', () => {
    expect(histogramFromStream([0, 5, 10, 12], [120, 120, 150, 150])).toEqual({ 120: 10, 150: 3 });
  });

  it('does not count a long pause as time at the last heart rate', () => {
    expect(histogramFromStream([0, 600], [120, 130])).toEqual({ 120: 30, 130: 1 });
  });

  it('skips samples with no heart rate', () => {
    expect(histogramFromStream([0, 1, 2], [0, 140, 140])).toEqual({ 140: 2 });
  });

  it('reads Strava answering with a list of streams or with an object keyed by name', () => {
    const asList = [
      { type: 'time', data: [0, 1, 2] },
      { type: 'heartrate', data: [130, 130, 130] },
    ];
    const asObject = { time: { data: [0, 1, 2] }, heartrate: { data: [130, 130, 130] } };
    expect(histogramFromResponse(asList)).toEqual({ 130: 3 });
    expect(histogramFromResponse(asObject)).toEqual({ 130: 3 });
  });

  it('gives null when heart rate is missing or malformed', () => {
    expect(histogramFromResponse([{ type: 'time', data: [0, 1] }])).toBeNull();
    expect(histogramFromResponse({ time: { data: [0] }, heartrate: { data: ['x'] } })).toBeNull();
    expect(histogramFromResponse(null)).toBeNull();
  });
});

describe('wantsZones', () => {
  it('is true for a recorded workout with heart rate and no breakdown yet', () => {
    expect(wantsZones(activity({ id: 1, sport: 'run', date: '2026-11-02', movingS: 1800, avgHr: 140 }))).toBe(true);
  });

  it('is false once it has one (even an empty one), without heart rate, when very short, or not a tracked sport', () => {
    const base = { id: 1, date: '2026-11-02', movingS: 1800, avgHr: 140 } as const;
    expect(wantsZones(activity({ ...base, sport: 'run', hr: {} }))).toBe(false);
    expect(wantsZones(activity({ ...base, sport: 'run', avgHr: undefined }))).toBe(false);
    expect(wantsZones(activity({ ...base, sport: 'run', movingS: 120 }))).toBe(false);
    expect(wantsZones(activity({ ...base, sport: 'other' }))).toBe(false);
  });
});

describe('targetZones', () => {
  it('is zones 2 to 3 for a workout that is moderate aerobic all the way through', () => {
    const run = week3[4][1]; // Friday: Foundation Run
    expect(run.title).toBe('Foundation Run');
    expect(targetZones(run)).toEqual({ from: 2, to: 3, intensity: 'moderate aerobic' });
  });

  it('is none for intervals and for sets that mix efforts', () => {
    expect(targetZones(week3[2][1])).toBeNull(); // Fartlek Run: moderate with VO2max bursts
    expect(targetZones(week3[1][0])).toBeNull(); // Power Intervals
    expect(targetZones(week3[2][0])).toBeNull(); // Swim with low aerobic ends and a moderate set
  });

  it('is none for a workout with no stated effort', () => {
    expect(targetZones({ kind: 'gym', title: 'Legs', minutes: 45, steps: [] })).toBeNull();
  });
});

describe('shareInZones', () => {
  it('is the share of time in the zones asked for', () => {
    expect(shareInZones([60, 600, 1200, 300, 30], 2, 3)).toBeCloseTo(1800 / 2190);
    expect(shareInZones([0, 0, 0, 0, 0], 2, 3)).toBe(0);
  });
});

describe('targetZones across the plan', () => {
  const all = PLAN.flatMap((week) => week.days.flat());

  it('still sets a target for a foundation run with strides on the end', () => {
    const withStrides = all.find((w) => w.title === 'Foundation Run' && w.steps.some((s) => s.startsWith('Strides:')));
    expect(withStrides).toBeDefined();
    expect(targetZones(withStrides!)).toMatchObject({ from: 2, to: 3 });
  });

  it('puts a recovery ride in zone 1', () => {
    const recovery = all.find((w) => w.title === 'Recovery Bike')!;
    expect(targetZones(recovery)).toEqual({ from: 1, to: 1, intensity: 'recovery' });
  });

  it('covers every foundation, long and brick workout, and no interval workout', () => {
    const steady = all.filter((w) => ['Foundation Run', 'Foundation Bike', 'Long Run', 'Long Bike', 'Brick'].includes(w.title));
    expect(steady.length).toBeGreaterThan(50);
    expect(steady.filter((w) => !targetZones(w))).toEqual([]);
    const intervals = all.filter((w) => /Intervals|Hill|Fartlek|Tempo|Time Trial/.test(w.title));
    expect(intervals.filter((w) => targetZones(w))).toEqual([]);
  });
});

describe('zoneVerdict', () => {
  const target = { from: 2, to: 3, intensity: 'moderate aerobic' };

  it('is on target when most of the time was in the zones asked for', () => {
    const v = zoneVerdict([60, 600, 1200, 300, 30], target);
    expect(v.onTarget).toBe(true);
    expect(v.text).toBe('On target: 82% of the time in zones 2–3 (moderate aerobic).');
  });

  it('says whether the rest was above or below when it falls short', () => {
    expect(zoneVerdict([60, 200, 300, 900, 600], target).text).toBe('24% of the time in zones 2–3 (moderate aerobic). Most of the rest was above that.');
    expect(zoneVerdict([1500, 200, 300, 60, 0], target).text).toBe('24% of the time in zones 2–3 (moderate aerobic). Most of the rest was below that.');
  });

  it('names a single zone as a zone', () => {
    expect(zoneVerdict([1800, 0, 0, 0, 0], { from: 1, to: 1, intensity: 'recovery' }).text).toBe('On target: 100% of the time in zone 1 (recovery).');
  });
});
