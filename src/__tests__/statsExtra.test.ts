import { READ_TYPES } from '../health/connect';
import { morningReadiness, readinessSeries } from '../health/readiness';
import { combine, HealthByDate, overnightReadings } from '../health/summary';
import { needsReading, READ_VERSION, SessionData, sessionToActivity } from '../health/workouts';
import { bodyTrend, driftOf, driftSessions, healthCoverage, monthSummary, overnightTrend, weekEnergy, weeklyZones } from '../statsExtra';
import { activity } from './helpers';

const appJson = require('../../app.json') as { expo: { android: { permissions?: string[] } } };

describe('permissions', () => {
  it('declares in app.json everything the reader asks Health Connect for', () => {
    const declared = appJson.expo.android.permissions ?? [];
    for (const t of READ_TYPES) expect(declared).toContain(t.permission);
  });
});

describe('weeklyZones', () => {
  const week1 = activity({ id: 1, sport: 'run', date: '2026-10-20', hr: { 110: 600, 120: 600 } });
  const week2 = activity({ id: 2, sport: 'bike', date: '2026-10-28', hr: { 120: 900, 160: 300, 180: 60 } });
  const noHr = activity({ id: 3, sport: 'swim', date: '2026-10-21' });

  it('adds up each week in zones, and the share that was easy', () => {
    const weeks = weeklyZones([week1, week2, noHr], '2026-10-19', 2, 190);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ week: 1, total: 1200, seconds: [600, 600, 0, 0, 0], easyShare: 1 });
    expect(weeks[1].seconds).toEqual([0, 900, 0, 300, 60]);
    expect(weeks[1].easyShare).toBeCloseTo(900 / 1260);
  });

  it('leaves out weeks with no heart rate and weeks not reached yet', () => {
    expect(weeklyZones([week2], '2026-10-19', 2, 190).map((w) => w.week)).toEqual([2]);
    expect(weeklyZones([week2], '2026-10-19', 1, 190)).toEqual([]);
  });
});

describe('drift', () => {
  const halves = { hr1: 140, hr2: 147, v1: 7, v2: 7 };

  it('is how much more heart rate the same speed took in the second half', () => {
    expect(driftOf(activity({ id: 1, sport: 'run', date: '2026-11-01', halves }))).toBeCloseTo(5);
    // Heart rate steady while speed fell is drift too.
    expect(driftOf(activity({ id: 1, sport: 'bike', date: '2026-11-01', halves: { hr1: 140, hr2: 140, v1: 8, v2: 7.6 } }))).toBeCloseTo(5.26, 1);
  });

  it('is null without halves, and for swims and gym', () => {
    expect(driftOf(activity({ id: 1, sport: 'run', date: '2026-11-01' }))).toBeNull();
    expect(driftOf(activity({ id: 1, sport: 'swim', date: '2026-11-01', halves }))).toBeNull();
  });

  it('lists the newest sessions that have a figure', () => {
    const list = [
      activity({ id: 3, sport: 'run', date: '2026-11-10', halves }),
      activity({ id: 2, sport: 'run', date: '2026-11-08' }),
      activity({ id: 1, sport: 'bike', date: '2026-11-05', halves }),
    ];
    expect(driftSessions(list, 5).map((d) => d.activity.id)).toEqual([3, 1]);
    expect(driftSessions(list, 1)).toHaveLength(1);
  });
});

describe('weekEnergy', () => {
  const list = [
    activity({ id: 1, sport: 'run', date: '2026-11-09', kcal: 500 }), // Monday
    activity({ id: 2, sport: 'bike', date: '2026-11-15', kcal: 700 }), // Sunday
    activity({ id: 3, sport: 'gym', date: '2026-11-12' }), // no calories
    activity({ id: 4, sport: 'run', date: '2026-11-16', kcal: 400 }), // next week
  ];

  it('adds up the Monday-to-Sunday week by sport', () => {
    expect(weekEnergy(list, '2026-11-12')).toEqual({ total: 1200, bySport: { swim: 0, bike: 700, run: 500, gym: 0, other: 0 } });
    expect(weekEnergy(list, '2026-11-16').total).toBe(400);
  });
});

describe('monthSummary', () => {
  const list = [
    activity({ id: 1, sport: 'run', date: '2026-11-03', movingS: 3600, distanceM: 10000 }),
    activity({ id: 2, sport: 'bike', date: '2026-11-05', movingS: 7200, distanceM: 50000 }),
    activity({ id: 3, sport: 'gym', date: '2026-11-06', movingS: 1800 }),
    activity({ id: 4, sport: 'run', date: '2026-10-02', movingS: 1800, distanceM: 5000 }),
    activity({ id: 5, sport: 'run', date: '2026-10-25', movingS: 9999, distanceM: 99999 }), // after the 6th: not the same days
    activity({ id: 6, sport: 'other', date: '2026-11-04', movingS: 600 }),
  ];

  it('totals this month so far against the same days of last month', () => {
    const m = monthSummary(list, '2026-11-06');
    expect(m.thisMonth).toEqual({ seconds: 12600, metres: 60000, sessions: 3 });
    expect(m.previousSameDays).toEqual({ seconds: 1800, metres: 5000, sessions: 1 });
    expect([m.month, m.previousMonth]).toEqual(['2026-11', '2026-10']);
  });

  it('finds the busiest week that has training in this month', () => {
    // Nov 3 and 5 are in the week of Mon 2 Nov, with the gym session on the 6th: 3600 + 7200 + 1800.
    expect(monthSummary(list, '2026-11-06').biggestWeekS).toBe(12600);
  });

  it('reaches back across a year end', () => {
    const jan = [activity({ id: 1, sport: 'run', date: '2026-12-02', movingS: 600, distanceM: 1000 })];
    expect(monthSummary(jan, '2027-01-04').previousMonth).toBe('2026-12');
  });
});

describe('morningReadiness', () => {
  /** A month of steady nights: 7.5 h, sleeping heart rate 52, HRV 60. */
  const steady = (): HealthByDate => {
    const health: HealthByDate = {};
    for (let d = 1; d <= 20; d++) {
      const date = `2026-11-${String(d).padStart(2, '0')}`;
      health[date] = { date, hrv: 60, sleep: { start: '', end: '', asleepMin: 450, awakeMin: 0, deepMin: 0, remMin: 0, lightMin: 0, sleepingHr: 52 } };
    }
    return health;
  };

  it('scores a normal night as good to go', () => {
    const r = morningReadiness(steady(), '2026-11-20')!;
    expect(r.score).toBe(100);
    expect(r).toMatchObject({ tone: 'good', label: 'Good to go', missing: [] });
    expect(r.parts.map((p) => p.label)).toEqual(['Sleep', 'Heart rate', 'HRV']);
  });

  it('marks down a short night with a raised heart rate and low HRV', () => {
    const health = steady();
    health['2026-11-20'] = { date: '2026-11-20', hrv: 45, sleep: { ...health['2026-11-20'].sleep!, asleepMin: 330, sleepingHr: 58 } };
    const r = morningReadiness(health, '2026-11-20')!;
    // Sleep (330 - 240) / 210 = 43; heart rate +6 bpm = 40; HRV 45/60 is 0.75 so 17: 0.4*43 + 0.3*40 + 0.3*17.
    expect(r.score).toBe(34);
    expect(r.tone).toBe('low');
  });

  it('scores on what there is, and says what it left out', () => {
    const r = morningReadiness({ '2026-11-20': { date: '2026-11-20', sleep: { start: '', end: '', asleepMin: 450, awakeMin: 0, deepMin: 0, remMin: 0, lightMin: 0 } } }, '2026-11-20')!;
    expect(r.score).toBe(100);
    expect(r.missing).toEqual(['heart rate', 'HRV']);
  });

  it('is null with no day or nothing to score', () => {
    expect(morningReadiness({}, '2026-11-20')).toBeNull();
    expect(morningReadiness({ '2026-11-20': { date: '2026-11-20' } }, '2026-11-20')).toBeNull();
  });

  it('gives a score for each of the last days, null where there is no data', () => {
    const series = readinessSeries(steady(), '2026-11-22', 4);
    expect(series.map((p) => p.date)).toEqual(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    expect(series.map((p) => p.score)).toEqual([100, 100, null, null]);
  });
});

describe('body and overnight readings', () => {
  const health: HealthByDate = combine({
    weight: { '2026-10-05': 75.8, '2026-11-12': 74.2 },
    bodyFat: { '2026-10-05': 16.7, '2026-11-12': 15.8 },
    lean: { '2026-11-12': 35.1 },
    overnight: { '2026-11-14': { spo2: 95.5, spo2Low: 91, breathing: 15.9 }, '2026-11-13': { spo2: 96.5, spo2Low: 93, breathing: 14.1 } },
  });

  it('gives the latest weight and body fat, and the change over the window', () => {
    const t = bodyTrend(health, '2026-11-15', 56)!;
    expect(t.latest).toEqual({ date: '2026-11-12', weightKg: 74.2, bodyFat: 15.8, leanKg: 35.1 });
    expect(t.change).toEqual({ weightKg: -1.6, bodyFat: -0.9 });
  });

  it('is null with no readings in the window', () => {
    expect(bodyTrend(health, '2026-11-20', 3)).toBeNull();
    expect(bodyTrend({}, '2026-11-15', 56)).toBeNull();
  });

  it('averages blood oxygen and breathing over the recent nights and keeps the lowest oxygen', () => {
    expect(overnightTrend(health, '2026-11-15', 7, 14.2)).toEqual({ nights: 2, spo2: 96, spo2Low: 91, breathing: 15, breathingUsual: 14.2 });
    expect(overnightTrend(health, '2026-11-25', 7, null)).toBeNull();
  });

  it('files overnight readings under the night they were taken in, and drops the rest', () => {
    const nights = { '2026-11-14': { start: '2026-11-13T22:00:00.000Z', end: '2026-11-14T06:00:00.000Z', asleepMin: 480, awakeMin: 0, deepMin: 0, remMin: 0, lightMin: 0 } };
    const spo2 = [
      { time: '2026-11-13T23:00:00.000Z', value: 96 },
      { time: '2026-11-14T03:00:00.000Z', value: 92 },
      { time: '2026-11-14T12:00:00.000Z', value: 99 }, // the afternoon: not in the night
    ];
    const breathing = [{ time: '2026-11-14T02:00:00.000Z', value: 15 }];
    expect(overnightReadings(nights, spo2, breathing)).toEqual({ '2026-11-14': { spo2: 94, spo2Low: 92, breathing: 15 } });
    expect(overnightReadings(nights, [], [])).toEqual({});
  });

  it('counts what has come through, with none for what has not', () => {
    const coverage = Object.fromEntries(healthCoverage(health, [activity({ id: 1, sport: 'run', date: '2026-11-01', source: 'health', kcal: 300 })]).map((c) => [c.label, c.count]));
    expect(coverage).toMatchObject({ Workouts: 1, Calories: 1, Weight: 2, 'Body fat': 2, 'Blood oxygen': 2, Breathing: 2, HRV: 0, Sleep: 0 });
  });
});

describe('calories and drift from a Health Connect workout', () => {
  const START = '2026-11-14T19:00:00.000Z';
  const at = (s: number) => new Date(Date.parse(START) + s * 1000).toISOString();
  const seconds = 3600; // an hour: long enough for drift
  const ride = (second: (t: number) => number): SessionData => ({
    session: { startTime: START, endTime: at(seconds), exerciseType: 8 },
    distances: [{ distance: { inMeters: 25000 } }],
    heartRates: [{ samples: Array.from({ length: seconds / 5 }, (_, i) => ({ time: at(i * 5), beatsPerMinute: second(i * 5) })) }],
    speeds: [{ samples: Array.from({ length: seconds / 5 }, (_, i) => ({ time: at(i * 5), speed: { inMetersPerSecond: 7 } })) }],
    elevations: [],
    calories: [{ energy: { inKilocalories: 619.6 } }],
  });

  it('keeps the calories, rounded, and marks the record as made by this reader', () => {
    const a = sessionToActivity(ride(() => 145))!;
    expect(a.kcal).toBe(620);
    expect(a.read).toBe(READ_VERSION);
  });

  it('finds drift between the halves after the warm-up, from a heart rate that climbs', () => {
    // 140 until the halfway point after warm-up (10 minutes in plus 25), then 147.
    const a = sessionToActivity(ride((t) => (t < 600 + 1500 ? 140 : 147)))!;
    expect(a.halves).toEqual({ hr1: 140, hr2: 147, v1: 7, v2: 7 });
    expect(driftOf(a)).toBeCloseTo(5);
  });

  it('has no drift figure on a short session, a swim, or one with no calories', () => {
    const short = ride(() => 145);
    short.session = { ...short.session, endTime: at(1500) };
    short.heartRates = [{ samples: short.heartRates[0].samples.filter((s) => Date.parse(s.time) <= Date.parse(at(1500))) }];
    expect(sessionToActivity(short)!.halves).toBeUndefined();

    const swim = ride(() => 145);
    swim.session = { ...swim.session, exerciseType: 74 };
    expect(sessionToActivity(swim)!.halves).toBeUndefined();

    const bare = ride(() => 145);
    bare.calories = [];
    expect(sessionToActivity(bare)!.kcal).toBeUndefined();
  });

  it('reads workouts saved by an older reader again, but not current ones', () => {
    const old = activity({ id: Date.parse(START), sport: 'bike', date: '2026-11-14', start: '2026-11-15T08:00:00', source: 'health' });
    const current = { ...old, read: READ_VERSION };
    const session = { startTime: START, exerciseType: 8 };
    // The cutoff for "recent" is after the workout, so only a version difference can make it be read again.
    const afterIt = Date.parse('2026-12-01T00:00:00Z');
    expect(needsReading(session, [old], afterIt)).toBe(true);
    expect(needsReading(session, [current], afterIt)).toBe(false);
  });
});
