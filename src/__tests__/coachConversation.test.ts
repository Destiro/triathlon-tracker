/** The chat loop against a scripted Claude: lookups, proposals, what Claude is told, and what happens on errors. */
import { Block, CoachError, Reply, Request, Send } from '../coach/api';
import { MAX_STEPS, newConversation, sendMessage, settleProposal } from '../coach/conversation';
import { coachData } from './helpers';

/** A fake Claude that gives these replies in order and keeps what it was sent. */
function scripted(...replies: (Reply | Error)[]): Send & { requests: Request[] } {
  const requests: Request[] = [];
  const send = (async (req: Request) => {
    // Copy, because the loop keeps adding to the same list.
    requests.push(JSON.parse(JSON.stringify(req)));
    const next = replies.shift();
    if (!next) throw new Error('No more scripted replies');
    if (next instanceof Error) throw next;
    return next;
  }) as Send & { requests: Request[] };
  send.requests = requests;
  return send;
}

const text = (t: string): Block => ({ type: 'text', text: t });
const call = (id: string, name: string, input: Record<string, unknown> = {}): Block => ({ type: 'tool_use', id, name, input });
const ids = () => {
  let n = 0;
  return () => `i${n++}`;
};

test('runs a lookup, sends the result back with its id, and shows only what Claude says', async () => {
  const thinking: Block = { type: 'thinking', thinking: '', signature: 'abc' };
  const send = scripted(
    { content: [thinking, call('t1', 'get_overview')], stop_reason: 'tool_use' },
    { content: [text('You have the Foundation Run left today.')], stop_reason: 'end_turn' },
  );
  const conv = await sendMessage(newConversation('system'), 'What is left today?', coachData(), send, ids());

  expect(conv.items.map((i) => [i.kind, 'text' in i ? i.text : ''])).toEqual([
    ['user', 'What is left today?'],
    ['coach', 'You have the Foundation Run left today.'],
  ]);
  const second = send.requests[1];
  expect(second.system).toBe('system');
  // Claude's turn goes back exactly as it came, thinking included, then the tool result answering it.
  expect(second.messages[1]).toEqual({ role: 'assistant', content: [thinking, call('t1', 'get_overview')] });
  const result = second.messages[2].content[0] as { type: string; tool_use_id: string; content: string };
  expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
  expect(JSON.parse(result.content).today).toBe('2026-11-06');
  expect(conv.messages).toHaveLength(4);
});

test('a change becomes a card, and Claude hears whether it was applied with the next message', async () => {
  const send = scripted(
    { content: [text('I can move it.'), call('t1', 'move_workout', { workout_id: '3.4.1', to_date: '2026-11-07' })], stop_reason: 'tool_use' },
    { content: [text('Tap Apply to move it to Saturday.')], stop_reason: 'end_turn' },
    { content: [text('Done, it is on Saturday now.')], stop_reason: 'end_turn' },
  );
  let conv = await sendMessage(newConversation('system'), 'Move my run to tomorrow', coachData(), send, ids());
  const card = conv.items.find((i) => i.kind === 'proposal');
  expect(card).toMatchObject({ kind: 'proposal', state: 'pending', proposal: { kind: 'move', workoutId: '3.4.1', to: '2026-11-07' } });
  expect((send.requests[1].messages[2].content[0] as { content: string }).content).toMatch(/Nothing is saved yet/);

  conv = settleProposal(conv, card!.id, true);
  expect(conv.items.find((i) => i.id === card!.id)).toMatchObject({ state: 'applied' });
  // Settling twice does nothing.
  expect(settleProposal(conv, card!.id, false)).toBe(conv);

  conv = await sendMessage(conv, 'Thanks', coachData(), send, ids());
  const lastUser = send.requests[2].messages[send.requests[2].messages.length - 1];
  expect(lastUser.content).toEqual([
    text('[Message from the app, not typed by the athlete] The athlete applied: Move Foundation Run from Fri, 6 Nov to Sat, 7 Nov.'),
    text('Thanks'),
  ]);
  expect(conv.appNotes).toEqual([]);
});

test('a cancelled change is reported as not made', () => {
  const conv = {
    ...newConversation('system'),
    items: [{ id: 'p', kind: 'proposal' as const, state: 'pending' as const, proposal: { kind: 'add' as const, session: { date: '2026-11-10', title: 'Gym', minutes: 30, repeatWeekly: false } } }],
  };
  expect(settleProposal(conv, 'p', false).appNotes).toEqual(['The athlete cancelled: Add Gym (30 min) on Tue, 10 Nov. It was not changed.']);
});

test('a bad tool call goes back to Claude as an error so it can correct itself', async () => {
  const send = scripted(
    { content: [call('t1', 'get_plan', { from: '2026-11-01', to: '2027-02-01' })], stop_reason: 'tool_use' },
    { content: [text('Here is the next fortnight.')], stop_reason: 'end_turn' },
  );
  await sendMessage(newConversation('system'), 'Show me my plan', coachData(), send, ids());
  expect(send.requests[1].messages[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1', is_error: true });
});

test('an error shows a message and leaves the conversation as it was, so the next try starts clean', async () => {
  const before = newConversation('system');
  const conv = await sendMessage(before, 'Hi', coachData(), scripted(new CoachError('Your Anthropic API key was not accepted. Check it in Settings.')), ids());
  expect(conv.messages).toEqual([]);
  expect(conv.items.map((i) => i.kind)).toEqual(['user', 'error']);
  expect(conv.items[1]).toMatchObject({ text: 'Your Anthropic API key was not accepted. Check it in Settings.' });

  const unexpected = await sendMessage(before, 'Hi', coachData(), scripted(new Error('boom')), ids());
  expect(unexpected.items[1]).toMatchObject({ kind: 'error', text: 'Something went wrong talking to Claude. Try again.' });
});

test('a model that keeps looking things up is stopped after a few steps', async () => {
  const loops = Array.from({ length: MAX_STEPS + 2 }, (_, i): Reply => ({ content: [call(`t${i}`, 'get_overview')], stop_reason: 'tool_use' }));
  const send = scripted(...loops);
  const conv = await sendMessage(newConversation('system'), 'Hi', coachData(), send, ids());
  expect(send.requests).toHaveLength(MAX_STEPS);
  expect(conv.items[conv.items.length - 1]).toMatchObject({ kind: 'error', text: expect.stringMatching(/too many lookups/) });
  expect(conv.messages).toEqual([]);
});

test('a refusal says so', async () => {
  const conv = await sendMessage(newConversation('system'), 'Hi', coachData(), scripted({ content: [], stop_reason: 'refusal' }), ids());
  expect(conv.items[conv.items.length - 1]).toMatchObject({ kind: 'error', text: expect.stringMatching(/declined/) });
});
