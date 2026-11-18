import { isText, isToolUse, Send, ToolResultBlock } from '../src/coach/api';
import { newConversation, sendMessage, settleProposal } from '../src/coach/conversation';
import { systemPrompt } from '../src/coach/prompt';
import { CheckResult, runChecks, Transcript } from './checks';
import { applyInWorld, dataOf, makeWorld } from './fixtures';
import { Scenario } from './scenarios';

export interface Verdict {
  score: number;
  reason: string;
}

export interface ScenarioResult {
  name: string;
  transcript: Transcript;
  checks: CheckResult[];
  judge?: Verdict;
  /** Every check passed and, when judged, the judge gave 4 or 5. */
  pass: boolean;
}

/** The judge's pass mark, out of 5. */
export const JUDGE_PASS = 4;

/**
 * Plays a scenario through the real chat loop and tools: only the model is swapped in. Applying a card changes the
 * world the same way the store would, so a later turn sees the change.
 */
export async function playScenario(scenario: Scenario, send: Send): Promise<Transcript> {
  let world = (scenario.setup ?? ((w) => w))(makeWorld());
  let conv = newConversation(systemPrompt(world.settings, world.todayKey));
  let n = 0;
  const makeId = () => `${scenario.name}-${n++}`;
  const transcript: Transcript = { turns: [] };

  for (const turn of scenario.turns) {
    const record: Transcript['turns'][number] = { user: turn.user, replies: [], toolCalls: [], proposals: [], errors: [] };
    const byId = new Map<string, Transcript['turns'][number]['toolCalls'][number]>();
    const recording: Send = async (request) => {
      // The tool results Claude is being sent answer the calls it made last time.
      const lastMessage = request.messages[request.messages.length - 1];
      for (const block of lastMessage?.content ?? []) {
        if (block.type === 'tool_result') {
          const r = block as ToolResultBlock;
          const call = byId.get(r.tool_use_id);
          if (call) call.result = r.content;
        }
      }
      const reply = await send(request);
      for (const block of reply.content.filter(isToolUse)) {
        const call = { name: block.name, input: block.input ?? {} };
        byId.set(block.id, call);
        record.toolCalls.push(call);
      }
      return reply;
    };

    const before = conv.items.length;
    conv = await sendMessage(conv, turn.user, dataOf(world), recording, makeId);
    for (const item of conv.items.slice(before)) {
      if (item.kind === 'coach') record.replies.push(item.text);
      if (item.kind === 'proposal') record.proposals.push(item.proposal);
      if (item.kind === 'error') record.errors.push(item.text);
    }
    transcript.turns.push(record);

    if (turn.then) {
      const card = [...conv.items].reverse().find((i) => i.kind === 'proposal' && i.state === 'pending');
      if (!card || card.kind !== 'proposal') {
        record.errors.push(`Expected a card to ${turn.then}, but there was none.`);
        continue;
      }
      if (turn.then === 'apply') world = applyInWorld(world, card.proposal);
      conv = settleProposal(conv, card.id, turn.then === 'apply');
    }
  }
  return transcript;
}

/** A transcript written out for the judge: what was asked, what was looked up or proposed, what was said. */
export function describeTranscript(t: Transcript): string {
  return t.turns
    .map((turn, i) =>
      [
        `## Turn ${i + 1}`,
        `Athlete: ${turn.user}`,
        ...turn.toolCalls.map((c) => `Tool ${c.name} ${JSON.stringify(c.input)} -> ${(c.result ?? '').slice(0, 1500)}`),
        ...turn.proposals.map((p) => `Card shown (not applied unless a later app message says so): ${JSON.stringify(p)}`),
        ...turn.errors.map((e) => `App error: ${e}`),
        `Coach: ${turn.replies.join('\n\n') || '(nothing)'}`,
      ].join('\n'),
    )
    .join('\n\n');
}

const JUDGE_SYSTEM = `You grade a triathlon coaching chatbot inside a phone app. You get a conversation (with the data lookups the coach made and their results) and a rubric. Judge only the coach's replies against the rubric and the data it looked up. Penalise any number or fact that is not in the lookup results, advice that ignores the data, unsafe medical advice, and replies too long to read on a phone. Answer with JSON only: {"score": 1-5, "reason": "one or two sentences"}. 5 = meets every point of the rubric; 4 = small gaps; 3 = a real gap; 2 = mostly misses; 1 = wrong or unsafe.`;

/** Asks a model to grade a transcript against the scenario's rubric. */
export async function judge(scenario: Scenario, t: Transcript, send: Send): Promise<Verdict> {
  const reply = await send({
    system: JUDGE_SYSTEM,
    messages: [{ role: 'user', content: [{ type: 'text', text: `# Rubric\n${scenario.rubric}\n\n# Conversation\n${describeTranscript(t)}` }] }],
    tools: [],
  });
  const text = reply.content.filter(isText).map((b) => b.text).join('');
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  try {
    const v = JSON.parse(json ?? '');
    if (typeof v.score === 'number' && v.score >= 1 && v.score <= 5) return { score: v.score, reason: String(v.reason ?? '') };
  } catch {
    // Falls through to the unreadable verdict below.
  }
  return { score: 0, reason: `The judge's answer could not be read: ${text.slice(0, 200)}` };
}

export async function runScenario(scenario: Scenario, coach: Send, judgeSend?: Send): Promise<ScenarioResult> {
  let transcript: Transcript;
  try {
    transcript = await playScenario(scenario, coach);
  } catch (e) {
    transcript = { turns: [{ user: scenario.turns[0]?.user ?? '', replies: [], toolCalls: [], proposals: [], errors: [`Harness error: ${String(e)}`] }] };
  }
  const checks = runChecks(transcript, scenario.checks);
  const verdict = scenario.rubric && judgeSend ? await judge(scenario, transcript, judgeSend).catch((e) => ({ score: 0, reason: `Judge failed: ${String(e)}` })) : undefined;
  const pass = checks.every((c) => c.pass) && (!verdict || verdict.score >= JUDGE_PASS);
  return { name: scenario.name, transcript, checks, judge: verdict, pass };
}
