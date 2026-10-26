import { generatePlan, MAX_WEEKS, phasesFor, planProgress, plannedMinutes, sessionStatus, sessionsOn, weekContaining } from '../lib/plan';
import { Race } from '../types';
import { multi, workout } from './fixtures';

const race = (date: string, distance: Race['distance'] = 'olympic'): Race => ({ id: 'r1', name: 'Test Tri', date, distance });
const wednesday = new Date(2026, 9, 28, 9); // Wed 28 Oct 2026

describe('phasesFor', () => {
  it('works backwards from race week', () => {
    expect(phasesFor(12, 1)).toEqual(['base', 'base', 'base', 'base', 'base', 'build', 'build', 'build', 'peak', 'peak', 'taper', 'race']);
    expect(phasesFor(3, 2)).toEqual(['taper', 'taper', 'race']);
    expect(phasesFor(1, 1)).toEqual(['race']);
    expect(phasesFor(0, 1)).toEqual([]);
  });
});

describe('generatePlan', () => {
  it('runs from this week to race week, ending on race day', () => {
    const plan = generatePlan({ race: race('2027-01-23'), weeklyHours: 8, today: wednesday })!;
    expect(plan.weeks[0].startDate).toBe('2026-10-26');
    expect(plan.weeks).toHaveLength(13);
    const last = plan.weeks[plan.weeks.length - 1];
    expect(last.phase).toBe('race');
    const raceDay = last.sessions[last.sessions.length - 1];
    expect(raceDay).toMatchObject({ date: '2027-01-23', sport: 'race' });
    // Nothing is planned after the race.
    expect(last.sessions.every((s) => s.date <= '2027-01-23')).toBe(true);
  });

  it('starts next week when this week is mostly over', () => {
    const plan = generatePlan({ race: race('2027-01-23'), weeklyHours: 8, today: new Date(2026, 9, 30) })!; // Friday
    expect(plan.weeks[0].startDate).toBe('2026-11-02');
  });

  it('builds volume, eases off every fourth week and tapers before the race', () => {
    const plan = generatePlan({ race: race('2027-03-27', 'half'), weeklyHours: 10, today: wednesday })!;
    const minutes = plan.weeks.map(plannedMinutes);
    const firstBase = minutes[0];
    const peak = Math.max(...plan.weeks.map((w, i) => (w.phase === 'peak' ? minutes[i] : 0)));
    expect(peak).toBeGreaterThan(firstBase);
    expect(peak).toBeLessThanOrEqual(10 * 60 * 1.1);
    expect(plan.weeks[3].recovery).toBe(true);
    expect(minutes[3]).toBeLessThan(minutes[2]);
    const tapers = plan.weeks.filter((w) => w.phase === 'taper');
    expect(tapers).toHaveLength(2);
    for (const t of tapers) expect(plannedMinutes(t)).toBeLessThan(peak);
  });

  it('plans a rest day, bricks in build, and strength when there is time for it', () => {
    const plan = generatePlan({ race: race('2027-03-27', 'half'), weeklyHours: 10, today: wednesday })!;
    for (const week of plan.weeks.filter((w) => w.phase !== 'race')) {
      expect(week.sessions.some((s) => s.sport === 'rest')).toBe(true);
    }
    const build = plan.weeks.find((w) => w.phase === 'build' && !w.recovery)!;
    expect(build.sessions.some((s) => s.sport === 'brick')).toBe(true);
    expect(build.sessions.some((s) => s.sport === 'strength')).toBe(true);
    const light = generatePlan({ race: race('2027-03-27', 'sprint'), weeklyHours: 4, today: wednesday })!;
    expect(light.weeks.flatMap((w) => w.sessions).some((s) => s.sport === 'strength')).toBe(false);
  });

  it('shares time sensibly between the three sports', () => {
    const plan = generatePlan({ race: race('2027-01-23'), weeklyHours: 8, today: wednesday, strength: false })!;
    const peak = plan.weeks.find((w) => w.phase === 'peak')!;
    const by = (sport: string) => peak.sessions.filter((s) => s.sport === sport).reduce((t, s) => t + s.durationMin, 0);
    expect(by('brick') + by('bike')).toBeGreaterThan(by('run'));
    expect(by('run')).toBeGreaterThan(by('swim'));
  });

  it('tapers longer for longer races', () => {
    const taper = (d: Race['distance']) => generatePlan({ race: race('2027-06-26', d), weeklyHours: 10, today: wednesday })!.weeks.filter((w) => w.phase === 'taper').length;
    expect([taper('sprint'), taper('olympic'), taper('half'), taper('full')]).toEqual([1, 1, 2, 3]);
  });

  it('caps very long plans and refuses a race in the past', () => {
    const far = generatePlan({ race: race('2028-06-01'), weeklyHours: 8, today: wednesday })!;
    expect(far.weeks).toHaveLength(MAX_WEEKS);
    expect(generatePlan({ race: race('2026-10-01'), weeklyHours: 8, today: wednesday })).toBeNull();
  });

  it('handles a race this week with just race week', () => {
    const plan = generatePlan({ race: race('2026-11-01'), weeklyHours: 8, today: wednesday })!;
    expect(plan.weeks).toHaveLength(1);
    expect(plan.weeks[0].phase).toBe('race');
  });
});

describe('progress against the plan', () => {
  const plan = generatePlan({ race: race('2027-01-23'), weeklyHours: 8, today: new Date(2026, 9, 26) })!;
  const monday = new Date(2026, 9, 26);
  const tuesdaySwim = sessionsOn(plan, new Date(2026, 9, 27)).find((s) => s.sport === 'swim')!;
  const wednesdayBike = sessionsOn(plan, new Date(2026, 9, 28)).find((s) => s.sport === 'bike')!;

  it('marks sessions done, missed, today or upcoming', () => {
    const swam = [workout('2026-10-27', 'swim', 40, 2)];
    expect(sessionStatus(tuesdaySwim, swam, wednesday)).toBe('done');
    expect(sessionStatus(tuesdaySwim, [], wednesday)).toBe('missed');
    expect(sessionStatus(wednesdayBike, [], wednesday)).toBe('today');
    expect(sessionStatus(wednesdayBike, [], monday)).toBe('upcoming');
    expect(sessionStatus(sessionsOn(plan, monday)[0], [], wednesday)).toBe('rest');
  });

  it('lets a brick or multisport workout count for a bike session', () => {
    const brick = multi('2026-10-28', [
      { sport: 'bike', durationSec: 3600, distanceM: 30_000 },
      { sport: 'run', durationSec: 600, distanceM: 2000 },
    ]);
    expect(sessionStatus(wednesdayBike, [brick], wednesday)).toBe('done');
  });

  it('counts sessions done against those due', () => {
    const progress = planProgress(plan, [workout('2026-10-27', 'swim', 40, 2)], wednesday);
    expect(progress).toMatchObject({ done: 1, due: 2 });
    expect(progress.total).toBeGreaterThan(30);
    expect(weekContaining(plan, wednesday)?.index).toBe(0);
    expect(weekContaining(null, wednesday)).toBeUndefined();
  });
});
