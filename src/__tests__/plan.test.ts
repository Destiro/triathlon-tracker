import { PLAN } from '../plan/data';
import { Sport } from '../plan/types';

const minutes = (week: number, sport: Sport) =>
  PLAN[week - 1].days
    .flat()
    .flatMap((w) => w.legs ?? [{ sport: w.kind as Sport, minutes: w.minutes, metres: w.metres }])
    .filter((l) => l.sport === sport)
    .reduce((sum, l) => sum + (l.minutes ?? 0), 0);

const swimMetres = (week: number) =>
  PLAN[week - 1].days
    .flat()
    .filter((w) => w.kind === 'swim')
    .reduce((sum, w) => sum + (w.metres ?? 0), 0);

describe('the 20 week plan', () => {
  it('has 20 numbered weeks of 7 days, with Monday off and race day last', () => {
    expect(PLAN.map((w) => w.week)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (const w of PLAN) expect(w.days).toHaveLength(7);
    for (const w of PLAN) expect(w.days[0]).toEqual([]);
    expect(PLAN[19].days[6][0].kind).toBe('race');
  });

  it('follows the phases described on the page: 8 base, 6 build, 6 peak, taper from week 19', () => {
    const phase = (w: number) => PLAN[w - 1].phase;
    expect([phase(1), phase(8)]).toEqual(['base', 'base']);
    expect([phase(9), phase(14)]).toEqual(['build', 'build']);
    expect([phase(15), phase(18)]).toEqual(['peak', 'peak']);
    expect([phase(19), phase(20)]).toEqual(['taper', 'race']);
  });

  it('makes every fourth week a recovery week', () => {
    expect(PLAN.filter((w) => w.recovery).map((w) => w.week)).toEqual([4, 8, 12, 16]);
  });

  it('puts the optional tune-up races in weeks 12 and 16', () => {
    expect(PLAN[11].days[6][0]).toMatchObject({ kind: 'race', title: 'Sprint Triathlon' });
    expect(PLAN[15].days[6][0]).toMatchObject({ kind: 'race', title: 'Olympic-Distance Triathlon' });
  });

  it('matches the page week 1 totals for riding and running', () => {
    expect(minutes(1, 'bike')).toBe(2 * 60 + 45);
    expect(minutes(1, 'run')).toBe(60 + 45);
  });

  it('matches the page week 17 swim total (yards written as the same number of metres)', () => {
    expect(swimMetres(17)).toBe(6700);
  });

  it('adds up a swim from its warm-up, main set and cool-down', () => {
    // Week 2 Sunday: WU 300, MS 1,000, CD 300.
    const sunday = PLAN[1].days[6].find((w) => w.kind === 'swim');
    expect(sunday?.metres).toBe(1600);
  });

  it('gives every workout at least one step to read', () => {
    for (const w of PLAN.flatMap((week) => week.days.flat())) expect(w.steps.length).toBeGreaterThan(0);
  });
});
