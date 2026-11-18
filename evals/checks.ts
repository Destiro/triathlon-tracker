import { Proposal } from '../src/coach/tools';

/** Everything that happened in one scenario, for the checks and the judge to look at. */
export interface Transcript {
  /** Each athlete message, and what came back for it. */
  turns: {
    user: string;
    /** What the coach said, in order. */
    replies: string[];
    /** Each lookup or change Claude asked for, with what the app sent back. */
    toolCalls: { name: string; input: Record<string, unknown>; result?: string }[];
    proposals: Proposal[];
    errors: string[];
  }[];
}

export interface CheckResult {
  name: string;
  pass: boolean;
  detail?: string;
}

/** A check looks at the whole transcript, or at the last turn when that is what matters. */
export type Check = (t: Transcript) => CheckResult;

const last = (t: Transcript) => t.turns[t.turns.length - 1];
const replyOf = (turn: Transcript['turns'][number]) => turn.replies.join('\n\n');
const allCalls = (t: Transcript) => t.turns.flatMap((turn) => turn.toolCalls);

/** True when every key in `want` matches `got`: equal values, or a RegExp that matches a string. */
export function matches(got: Record<string, unknown>, want: Record<string, unknown>): boolean {
  return Object.entries(want).every(([k, v]) => {
    const g = got[k];
    if (v instanceof RegExp) return typeof g === 'string' && v.test(g);
    if (v && typeof v === 'object' && g && typeof g === 'object') return matches(g as Record<string, unknown>, v as Record<string, unknown>);
    return g === v;
  });
}

export const calls = (tool: string, input: Record<string, unknown> = {}): Check => (t) => {
  const found = allCalls(t).some((c) => c.name === tool && matches(c.input, input));
  return { name: `calls ${tool}${Object.keys(input).length ? ` with ${JSON.stringify(input)}` : ''}`, pass: found };
};

export const callsOneOf = (...tools: string[]): Check => (t) => ({
  name: `calls one of ${tools.join(', ')}`,
  pass: allCalls(t).some((c) => tools.includes(c.name)),
});

export const neverCalls = (tool: string): Check => (t) => ({ name: `never calls ${tool}`, pass: !allCalls(t).some((c) => c.name === tool) });

/** The last turn ended with exactly this kind of change on a card, matching `fields`. */
export const proposes = (kind: Proposal['kind'], fields: Record<string, unknown> = {}): Check => (t) => {
  const ps = last(t).proposals;
  const hit = ps.find((p) => p.kind === kind && matches(p as unknown as Record<string, unknown>, fields));
  return {
    name: `proposes ${kind}${Object.keys(fields).length ? ` ${JSON.stringify(fields, (_k, v) => (v instanceof RegExp ? String(v) : v))}` : ''}`,
    pass: Boolean(hit),
    detail: hit ? undefined : `got ${JSON.stringify(ps)}`,
  };
};

export const proposesNothing: Check = (t) => {
  const ps = t.turns.flatMap((turn) => turn.proposals);
  return { name: 'proposes no change', pass: ps.length === 0, detail: ps.length ? `got ${JSON.stringify(ps)}` : undefined };
};

export const says = (pattern: RegExp, label = String(pattern)): Check => (t) => ({ name: `says ${label}`, pass: pattern.test(replyOf(last(t))), detail: replyOf(last(t)).slice(0, 200) });

export const neverSays = (pattern: RegExp, label = String(pattern)): Check => (t) => ({
  name: `never says ${label}`,
  pass: !t.turns.some((turn) => pattern.test(replyOf(turn))),
});

/** Short enough to read on a phone. */
export const atMostWords = (n: number): Check => (t) => {
  const words = replyOf(last(t)).split(/\s+/).filter(Boolean).length;
  return { name: `answers in ${n} words or fewer`, pass: words > 0 && words <= n, detail: `${words} words` };
};

export const noErrors: Check = (t) => {
  const errors = t.turns.flatMap((turn) => turn.errors);
  return { name: 'no errors', pass: errors.length === 0, detail: errors.join(' | ') || undefined };
};

/** With a change on a card and not yet applied, the coach must not talk as if it has happened. */
export const doesNotClaimDone: Check = (t) => {
  const turn = last(t);
  const claims = /\b(i'?ve|i have|it'?s been|has been|is now|all set|done[.!]|moved it|added it|logged it|saved it)\b/i;
  const pending = turn.proposals.length > 0;
  return { name: 'does not claim a pending change is done', pass: !pending || !claims.test(replyOf(turn)), detail: pending ? replyOf(turn).slice(0, 200) : undefined };
};

export function runChecks(t: Transcript, checks: Check[]): CheckResult[] {
  return checks.map((check) => {
    try {
      return check(t);
    } catch (e) {
      return { name: 'check crashed', pass: false, detail: String(e) };
    }
  });
}
