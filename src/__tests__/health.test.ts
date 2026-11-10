import { baseline, combine, HealthByDate, healthSeries, latest, mergeHealth, perDay, recovery, STAGE, summarizeSleep } from '../health/summary';

/** A local time on a day in November 2026, as Health Connect hands it over (ISO, UTC). */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();

describe('summarizeSleep', () => {
  it('files a night under the day you woke up and adds up the stages', () => {
    const nights = summarizeSleep([
      {
        startTime: at(9, 22, 30),
        endTime: at(10, 6, 30),
        stages: [
          { startTime: at(9, 22, 30), endTime: at(10, 0, 30), stage: STAGE.LIGHT },
          { startTime: at(10, 0, 30), endTime: at(10, 2, 0), stage: STAGE.DEEP },
          { startTime: at(10, 2, 0), endTime: at(10, 2, 20), stage: STAGE.AWAKE },
          { startTime: at(10, 2, 20), endTime: at(10, 4, 20), stage: STAGE.REM },
          { startTime: at(10, 4, 20), endTime: at(10, 6, 30), stage: STAGE.LIGHT },
        ],
      },
    ]);
    expect(Object.keys(nights)).toEqual(['2026-11-10']);
    expect(nights['2026-11-10']).toMatchObject({ asleepMin: 460, awakeMin: 20, deepMin: 90, remMin: 120, lightMin: 250 });
  });

  it('counts the whole session when the watch gave no stages', () => {
    const nights = summarizeSleep([{ startTime: at(9, 23), endTime: at(10, 7) }]);
    expect(nights['2026-11-10']).toMatchObject({ asleepMin: 480, deepMin: 0, remMin: 0 });
  });

  it('joins a night split by getting up, and leaves naps out', () => {
    const nights = summarizeSleep([
      { startTime: at(9, 23), endTime: at(10, 3) },
      { startTime: at(10, 3, 30), endTime: at(10, 7) },
      { startTime: at(10, 14), endTime: at(10, 14, 45) },
    ]);
    expect(Object.keys(nights)).toEqual(['2026-11-10']);
    expect(nights['2026-11-10']).toMatchObject({ start: at(9, 23), end: at(10, 7), asleepMin: 450 });
  });
});

describe('perDay', () => {
  const readings = [
    { time: at(10, 7), value: 52 },
    { time: at(10, 15), value: 48 },
    { time: at(11, 8), value: 0 },
  ];
  it('keeps the latest, lowest or average reading of each day and skips empty ones', () => {
    expect(perDay(readings, 'latest')).toEqual({ '2026-11-10': 48 });
    expect(perDay(readings, 'lowest')).toEqual({ '2026-11-10': 48 });
    expect(perDay(readings, 'average')).toEqual({ '2026-11-10': 50 });
  });
});

describe('mergeHealth', () => {
  it('keeps what a fresh read did not include', () => {
    const saved: HealthByDate = { '2026-11-10': { date: '2026-11-10', vo2Max: 48.2, hrv: 60 } };
    const merged = mergeHealth(saved, combine({ hrv: { '2026-11-10': 64.4 }, restingHr: { '2026-11-11': 50 } }));
    expect(merged['2026-11-10']).toEqual({ date: '2026-11-10', vo2Max: 48.2, hrv: 64 });
    expect(merged['2026-11-11']).toEqual({ date: '2026-11-11', restingHr: 50 });
  });
});

/** Thirty steady nights before 10 November, then whatever `today` says. */
function history(today: Partial<{ hr: number; hrv: number; asleep: number }> = {}): HealthByDate {
  const health: HealthByDate = {};
  for (const day of healthSeries({}, '2026-10-11', '2026-11-09')) {
    health[day.date] = { date: day.date, hrv: 60, sleep: { start: '', end: '', asleepMin: 450, awakeMin: 0, deepMin: 0, remMin: 0, lightMin: 0, sleepingHr: 50 } };
  }
  health['2026-11-10'] = {
    date: '2026-11-10',
    hrv: today.hrv ?? 60,
    sleep: { start: '', end: '', asleepMin: today.asleep ?? 450, awakeMin: 0, deepMin: 0, remMin: 0, lightMin: 0, sleepingHr: today.hr ?? 50 },
  };
  return health;
}

describe('recovery', () => {
  it('compares this morning with your own 30-day normal', () => {
    expect(baseline(history(), 'sleepingHr', '2026-11-10')).toBe(50);
    expect(recovery(history(), '2026-11-10')?.tone).toBe('good');
    expect(recovery(history({ hr: 56 }), '2026-11-10')).toEqual({ tone: 'ok', text: 'Mostly recovered, but heart rate 6 bpm above normal.' });
    expect(recovery(history({ hr: 57, hrv: 45, asleep: 330 }), '2026-11-10')?.text).toBe(
      'Under-recovered: heart rate 7 bpm above normal, HRV 25% below normal, under 6 hours of sleep. Keep today easy if you can.',
    );
  });

  it('says nothing until there is a week of history', () => {
    const health: HealthByDate = { '2026-11-10': { date: '2026-11-10', hrv: 40, restingHr: 60 } };
    expect(recovery(health, '2026-11-10')).toBeNull();
  });
});

describe('latest', () => {
  it('finds the most recent value up to a day', () => {
    const health = combine({ vo2Max: { '2026-11-01': 47.94, '2026-11-08': 48.5, '2026-11-20': 49 } });
    expect(latest(health, 'vo2Max', '2026-11-10')).toEqual({ date: '2026-11-08', value: 48.5 });
    expect(latest(health, 'hrv', '2026-11-10')).toBeNull();
  });
});
