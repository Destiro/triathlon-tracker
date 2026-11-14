import { describeOverview, describeSession, describeSleep, exerciseName, overviewOf, SessionData, summariseSession } from '../healthprobe';

const START = '2026-11-16T06:00:00.000Z';
const END = '2026-11-16T06:30:00.000Z';
const at = (seconds: number) => new Date(Date.parse(START) + seconds * 1000).toISOString();

/** A pool swim: three lengths of distance, a heart rate reading every 5 s, and some readings from outside it. */
const swim = (over: Partial<SessionData> = {}): SessionData => ({
  session: {
    startTime: START,
    endTime: END,
    exerciseType: 74,
    title: 'Pool swim',
    metadata: { dataOrigin: 'com.sec.android.app.shealth', device: { manufacturer: 'samsung', model: 'SM-R960' } },
  },
  distances: [{ distance: { inMeters: 500 } }, { distance: { inMeters: 500 } }, { distance: { inMeters: 450 } }],
  heartRates: [
    {
      samples: [
        { time: at(-60), beatsPerMinute: 70 }, // before the swim
        ...Array.from({ length: 361 }, (_, i) => ({ time: at(i * 5), beatsPerMinute: i === 100 ? 160 : 140 })),
        { time: at(1900), beatsPerMinute: 95 }, // after it
      ],
    },
  ],
  speeds: [{ samples: [{ time: at(0), speed: { inMetersPerSecond: 0.8 } }, { time: at(5), speed: { inMetersPerSecond: 0.6 } }] }],
  elevations: [],
  calories: [{ energy: { inKilocalories: 312 } }],
  ...over,
});

describe('exerciseName', () => {
  it('names the types the plan uses, and shows the number for any other', () => {
    expect([exerciseName(74), exerciseName(73), exerciseName(56), exerciseName(8), exerciseName(70)]).toEqual([
      'Swimming (pool)',
      'Swimming (open water)',
      'Running',
      'Cycling',
      'Strength training',
    ]);
    expect(exerciseName(999)).toBe('Exercise type 999');
  });
});

describe('summariseSession', () => {
  it('adds up the distance records and the calories, and says where it came from', () => {
    const s = summariseSession(swim());
    expect(s.name).toBe('Swimming (pool)');
    expect(s.title).toBe('Pool swim');
    expect(s.seconds).toBe(1800);
    expect(s.distanceM).toBe(1450);
    expect(s.distanceRecords).toBe(3);
    expect(s.kcal).toBe(312);
    expect(s.origin).toBe('com.sec.android.app.shealth');
    expect(s.device).toBe('samsung SM-R960');
  });

  it('only counts heart rate readings that fall inside the workout', () => {
    const s = summariseSession(swim());
    expect(s.heartSamples).toBe(361);
    expect(s.heartMax).toBe(160);
    expect(s.heartAvg).toBeCloseTo((360 * 140 + 160) / 361, 5);
    expect(s.heartEveryS).toBe(5);
  });

  it('counts speed readings and converts their average', () => {
    const s = summariseSession(swim());
    expect(s.speedSamples).toBe(2);
    expect(s.speedAvg).toBeCloseTo(0.7);
  });

  it('reports missing readings as null rather than zero, so none and nothing recorded can be told apart', () => {
    const s = summariseSession(swim({ distances: [], heartRates: [], speeds: [], calories: [] }));
    expect([s.distanceM, s.heartAvg, s.heartMax, s.heartEveryS, s.speedAvg, s.elevationM, s.kcal]).toEqual([null, null, null, null, null, null, null]);
    expect([s.heartSamples, s.speedSamples, s.distanceRecords]).toEqual([0, 0, 0]);
  });

  it('copes with a workout that has no title, device or origin', () => {
    const data = swim();
    data.session = { startTime: START, endTime: END, exerciseType: 56 };
    const s = summariseSession(data);
    expect([s.title, s.origin, s.device]).toEqual([null, null, null]);
  });
});

describe('describeSession', () => {
  it('writes one line per kind of reading, and says "none" for what is missing', () => {
    const lines = describeSession(summariseSession(swim()));
    expect(lines[0]).toContain('Swimming (pool)');
    expect(lines[0]).toContain('30:00');
    expect(lines).toContain('  distance: 1,450 m in 3 records');
    expect(lines).toContain('  heart rate: 361 readings, about every 5 s, average 140, highest 160');
    expect(lines).toContain('  speed: 2 readings, average 2.5 km/h');
    expect(lines).toContain('  elevation: none');
    expect(lines).toContain('  calories: 312 kcal');
    expect(lines).toContain('  from: com.sec.android.app.shealth (samsung SM-R960)');
  });

  it('shows everything as none for a bare session', () => {
    const lines = describeSession(summariseSession(swim({ distances: [], heartRates: [], speeds: [], calories: [] })));
    expect(lines).toContain('  distance: none');
    expect(lines).toContain('  heart rate: none');
    expect(lines).toContain('  speed: none');
    expect(lines).toContain('  calories: none');
  });
});

describe('overviewOf', () => {
  it('counts records, finds the first and last and lists the apps that wrote them', () => {
    const o = overviewOf('Sleep', [
      { startTime: '2026-11-14T10:00:00Z', metadata: { dataOrigin: 'com.sec.android.app.shealth' } },
      { startTime: '2026-11-12T10:00:00Z', metadata: { dataOrigin: 'com.sec.android.app.shealth' } },
      { time: '2026-11-15T10:00:00Z', metadata: { dataOrigin: 'com.example.other' } },
    ]);
    expect(o.count).toBe(3);
    expect(o.first).toBe('2026-11-12T10:00:00Z');
    expect(o.last).toBe('2026-11-15T10:00:00Z');
    expect(o.origins).toEqual(['com.sec.android.app.shealth', 'com.example.other']);
  });

  it('says none when there is nothing', () => {
    expect(describeOverview(overviewOf('Resting heart rate', []))).toBe('Resting heart rate: none');
  });

  it('describes a type with a count and the apps', () => {
    const text = describeOverview(overviewOf('Exercise', [{ startTime: '2026-11-12T10:00:00Z', metadata: { dataOrigin: 'com.sec.android.app.shealth' } }]));
    expect(text).toContain('Exercise: 1 record');
    expect(text).toContain('from com.sec.android.app.shealth');
  });
});

describe('describeSleep', () => {
  it('shows minutes in each stage', () => {
    const text = describeSleep({
      startTime: '2026-11-15T10:00:00Z',
      endTime: '2026-11-15T17:00:00Z',
      stages: [
        { startTime: '2026-11-15T10:00:00Z', endTime: '2026-11-15T12:00:00Z', stage: 4 },
        { startTime: '2026-11-15T12:00:00Z', endTime: '2026-11-15T13:30:00Z', stage: 5 },
        { startTime: '2026-11-15T13:30:00Z', endTime: '2026-11-15T14:30:00Z', stage: 6 },
        { startTime: '2026-11-15T14:30:00Z', endTime: '2026-11-15T15:00:00Z', stage: 1 },
        { startTime: '2026-11-15T15:00:00Z', endTime: '2026-11-15T17:00:00Z', stage: 4 },
      ],
    });
    expect(text).toContain('7:00:00 in bed');
    expect(text).toContain('Awake 30 min, Light 240 min, Deep 90 min, REM 60 min');
  });

  it('says so when a night has no stages', () => {
    expect(describeSleep({ startTime: '2026-11-15T10:00:00Z', endTime: '2026-11-15T16:00:00Z' })).toContain('6:00:00 asleep, no stages');
  });
});
