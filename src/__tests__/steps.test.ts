import { PLAN } from '../plan/data';
import { stepBlocks } from '../plan/steps';

const week3 = PLAN[2].days;

describe('stepBlocks', () => {
  it('splits a run into warm-up, main set and cool-down minutes', () => {
    const run = week3[4][1]; // Friday: Foundation Run, 40 min
    expect(run.title).toBe('Foundation Run');
    expect(stepBlocks(run)).toEqual([
      { label: 'WU', amount: 10 },
      { label: 'Main', amount: 20 },
      { label: 'CD', amount: 10 },
    ]);
  });

  it('gives the main set whatever is left when it is written as reps', () => {
    const fartlek = week3[2][1]; // Wednesday: Fartlek Run, 35 min, 8 × 30 sec
    expect(stepBlocks(fartlek)?.map((b) => b.amount)).toEqual([5, 25, 5]);
  });

  it('works in metres for swims', () => {
    const swim = week3[4][0]; // Friday: 1,400 m with 300 either end
    expect(stepBlocks(swim)?.map((b) => b.amount)).toEqual([300, 800, 300]);
  });

  it('adds up to the planned amount for every ride, run and swim it can split', () => {
    for (const w of PLAN.flatMap((week) => week.days.flat())) {
      const blocks = stepBlocks(w);
      if (!blocks) continue;
      expect(blocks.reduce((sum, b) => sum + b.amount, 0)).toBe(w.kind === 'swim' ? w.metres : w.minutes);
      expect(blocks.every((b) => b.amount > 0)).toBe(true);
    }
  });

  it('leaves bricks and the race alone', () => {
    const all = PLAN.flatMap((week) => week.days.flat());
    for (const w of all.filter((x) => x.kind === 'brick' || x.kind === 'race')) expect(stepBlocks(w)).toBeNull();
  });
});
