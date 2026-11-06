import { PlannedWorkout } from './types';

export interface StepBlock {
  label: 'WU' | 'Main' | 'CD';
  /** Minutes for rides and runs, metres for swims. */
  amount: number;
}

// "WU: 10 min @ …" for rides and runs, "WU: 300 @ …" for swims.
const END = /^(WU|CD): (\d+)( min)? @/;

/**
 * Warm-up, main set and cool-down as three blocks that add up to the whole workout, for drawing as a bar.
 * The main set is whatever the warm-up and cool-down leave, because the plan often writes it as reps
 * ("8 × 30 sec … easy running between to fill the time") rather than as one amount. Null when the steps
 * don't start and end with a plain warm-up and cool-down, as in bricks, races and some swims.
 */
export function stepBlocks(w: PlannedWorkout): StepBlock[] | null {
  const total = w.kind === 'swim' ? w.metres : w.kind === 'bike' || w.kind === 'run' ? w.minutes : undefined;
  if (!total || w.steps.length < 3) return null;
  const parse = (line: string, want: 'WU' | 'CD') => {
    const m = END.exec(line);
    if (!m || m[1] !== want || (w.kind === 'swim') === Boolean(m[3])) return null;
    return Number(m[2]);
  };
  const wu = parse(w.steps[0], 'WU');
  const cd = parse(w.steps[w.steps.length - 1], 'CD');
  if (wu === null || cd === null || wu + cd >= total) return null;
  return [
    { label: 'WU', amount: wu },
    { label: 'Main', amount: total - wu - cd },
    { label: 'CD', amount: cd },
  ];
}
