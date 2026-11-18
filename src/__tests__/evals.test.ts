/**
 * The eval harness itself, with no model: the scenarios are well formed, the checks catch what they are meant to,
 * applying a card changes what the next turn sees, and the judge's answer is read safely.
 */
import { Block, Reply, Send } from '../coach/api';
import { TOOLS } from '../coach/tools';
import { atMostWords, doesNotClaimDone, matches, neverSays, proposes, runChecks, Transcript } from '../../evals/checks';
import { makeWorld } from '../../evals/fixtures';
import { judge, playScenario, runScenario } from '../../evals/harness';
import { Scenario, SCENARIOS } from '../../evals/scenarios';

const text = (t: string): Block => ({ type: 'text', text: t });
const call = (id: string, name: string, input: Record<string, unknown> = {}): Block => ({ type: 'tool_use', id, name, input });
const scripted = (...replies: Reply[]): Send => async () => {
  const next = replies.shift();
  if (!next) throw new Error('No more scripted replies');
  return next;
};
const scenario = (name: string): Scenario => SCENARIOS.find((s) => s.name === name)!;

test('every scenario has a unique name, at least one turn and check, and a setup that keeps the world whole', () => {
  expect(new Set(SCENARIOS.map((s) => s.name)).size).toBe(SCENARIOS.length);
  for (const s of SCENARIOS) {
    expect(s.turns.length).toBeGreaterThan(0);
    expect(s.checks.length).toBeGreaterThan(0);
    if (s.setup) expect(Object.keys(s.setup(makeWorld())).sort()).toEqual(Object.keys(makeWorld()).sort());
  }
});

test('the checks only name tools the coach has', () => {
  const names = new Set(TOOLS.map((t) => t.name));
  const named = SCENARIOS.flatMap((s) => s.checks.map((c) => c({ turns: [{ user: '', replies: [], toolCalls: [], proposals: [], errors: [] }] }).name));
  for (const n of named) {
    const tool = n.match(/^(?:never )?calls (?!one of)(\w+)/)?.[1];
    if (tool) expect(names).toContain(tool);
  }
});

test('matches compares nested fields and patterns', () => {
  expect(matches({ a: 1, b: { c: 'Left calf', d: 2 } }, { b: { c: /calf/i } })).toBe(true);
  expect(matches({ a: 1 }, { a: 2 })).toBe(false);
  expect(matches({ a: 1 }, { b: /x/ })).toBe(false);
});

describe('a good answer passes and a bad one fails', () => {
  test('move-run: the card alone passes; saying it is done before Apply fails', async () => {
    const good = await runScenario(
      scenario('move-run'),
      scripted(
        { content: [call('t1', 'move_workout', { workout_id: '3.4.1', to_date: '2026-11-07' })], stop_reason: 'tool_use' },
        { content: [text('Tap Apply to move your Foundation Run to Saturday.')], stop_reason: 'end_turn' },
      ),
    );
    expect(good.checks.filter((c) => !c.pass)).toEqual([]);
    expect(good.pass).toBe(true);

    const bad = await runScenario(
      scenario('move-run'),
      scripted(
        { content: [call('t1', 'move_workout', { workout_id: '3.4.1', to_date: '2026-11-08' })], stop_reason: 'tool_use' },
        { content: [text("Done! I've moved it to Sunday.")], stop_reason: 'end_turn' },
      ),
    );
    expect(bad.pass).toBe(false);
    expect(bad.checks.filter((c) => !c.pass).map((c) => c.name)).toEqual([expect.stringMatching(/^proposes move/), 'does not claim a pending change is done']);
  });

  test('no-made-up-numbers: an invented power figure fails', () => {
    const t: Transcript = { turns: [{ user: 'Power?', replies: ['About 210 W average.'], toolCalls: [], proposals: [], errors: [] }] };
    expect(runChecks(t, [neverSays(/\b\d{2,3}\s?(w|watts)\b/i)])[0].pass).toBe(false);
  });

  test('a long answer fails the phone length check', () => {
    const t: Transcript = { turns: [{ user: 'Hi', replies: [Array(130).fill('word').join(' ')], toolCalls: [], proposals: [], errors: [] }] };
    expect(runChecks(t, [atMostWords(120)])[0]).toMatchObject({ pass: false, detail: '130 words' });
  });

  test('claiming done is fine once nothing is pending', () => {
    const t: Transcript = { turns: [{ user: 'Thanks', replies: ['It is now on Saturday.'], toolCalls: [], proposals: [], errors: [] }] };
    expect(runChecks(t, [doesNotClaimDone])[0].pass).toBe(true);
    expect(runChecks(t, [proposes('move')])[0].pass).toBe(false);
  });
});

test('applying a card changes the world the next turn sees', async () => {
  const seen: string[] = [];
  const send: Send = async (req) => {
    const lastMsg = req.messages[req.messages.length - 1];
    for (const b of lastMsg.content) if (b.type === 'tool_result') seen.push((b as { content: string }).content);
    for (const b of lastMsg.content) if (b.type === 'text') seen.push((b as { text: string }).text);
    return replies.shift()!;
  };
  const replies: Reply[] = [
    { content: [call('t1', 'move_workout', { workout_id: '3.4.1', to_date: '2026-11-07' })], stop_reason: 'tool_use' },
    { content: [text('Tap Apply.')], stop_reason: 'end_turn' },
    { content: [call('t2', 'get_plan', { from: '2026-11-07', to: '2026-11-07' })], stop_reason: 'tool_use' },
    { content: [text('Tomorrow: Foundation Bike and the Foundation Run.')], stop_reason: 'end_turn' },
  ];
  const t = await playScenario(scenario('move-then-ask'), send);
  // Claude is told the athlete applied it...
  expect(seen).toContain('[Message from the app, not typed by the athlete] The athlete applied: Move Foundation Run from Fri, 6 Nov to Sat, 7 Nov.');
  // ...and the plan it looks up has the run on Saturday, marked as moved.
  const saturday = JSON.parse(t.turns[1].toolCalls[0].result!)[0];
  expect(saturday.workouts.map((w: { title: string; movedFrom?: string }) => [w.title, w.movedFrom])).toEqual([
    ['Foundation Bike', undefined],
    ['Foundation Run', '2026-11-06'],
  ]);
  expect(runChecks(t, scenario('move-then-ask').checks).every((c) => c.pass)).toBe(true);
});

test('a turn that should leave a card to apply, but does not, is reported', async () => {
  const t = await playScenario(scenario('move-then-ask'), scripted({ content: [text('Sure.')], stop_reason: 'end_turn' }, { content: [text('Nothing changed.')], stop_reason: 'end_turn' }));
  expect(t.turns[0].errors).toEqual(['Expected a card to apply, but there was none.']);
});

describe('the judge', () => {
  const t: Transcript = { turns: [{ user: 'Hi', replies: ['Hello'], toolCalls: [], proposals: [], errors: [] }] };

  test('reads a score and a reason, even with words around the JSON', async () => {
    const send = scripted({ content: [text('Here you go: {"score": 4, "reason": "Small gap."}')], stop_reason: 'end_turn' });
    expect(await judge(scenario('week-review'), t, send)).toEqual({ score: 4, reason: 'Small gap.' });
  });

  test('an unreadable or out of range verdict scores 0, so it fails rather than passes', async () => {
    expect((await judge(scenario('week-review'), t, scripted({ content: [text('Looks fine to me')], stop_reason: 'end_turn' }))).score).toBe(0);
    expect((await judge(scenario('week-review'), t, scripted({ content: [text('{"score": 9}')], stop_reason: 'end_turn' }))).score).toBe(0);
  });

  test('a low judge score fails a scenario whose checks all pass', async () => {
    const coach = scripted(
      { content: [call('t1', 'get_week_summary', { week: 3 })], stop_reason: 'tool_use' },
      { content: [text('Your week is going fine.')], stop_reason: 'end_turn' },
    );
    const result = await runScenario(scenario('week-review'), coach, scripted({ content: [text('{"score": 2, "reason": "Vague."}')], stop_reason: 'end_turn' }));
    expect(result.checks.every((c) => c.pass)).toBe(true);
    expect(result).toMatchObject({ pass: false, judge: { score: 2 } });
  });
});
