import { Block, CoachError, isText, isToolUse, Message, Send, ToolResultBlock } from './api';
import { CoachData, describeProposal, Proposal, runTool, TOOLS } from './tools';

/** What the chat screen draws, in order. */
export type ChatItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'coach'; text: string }
  | { id: string; kind: 'proposal'; proposal: Proposal; state: 'pending' | 'applied' | 'cancelled' }
  | { id: string; kind: 'error'; text: string };

export interface Conversation {
  system: string;
  /** Exactly what Claude has been sent and has said, only ever added to. */
  messages: Message[];
  items: ChatItem[];
  /** What the athlete did with proposals since the last message, told to Claude with the next one. */
  appNotes: string[];
}

export const newConversation = (system: string): Conversation => ({ system, messages: [], items: [], appNotes: [] });

// A question that needs more lookups than this is stopped, so a confused model can't loop and run up the bill.
export const MAX_STEPS = 8;

const appNote = (text: string): Block => ({ type: 'text', text: `[Message from the app, not typed by the athlete] ${text}` });

/**
 * Sends the athlete's message and runs Claude's lookups until it answers. Resolves to the conversation with the
 * new items; never rejects. On an error the messages go back to how they were, so the next try starts clean.
 */
export async function sendMessage(conv: Conversation, text: string, data: CoachData, send: Send, makeId: () => string): Promise<Conversation> {
  const userItem: ChatItem = { id: makeId(), kind: 'user', text };
  const items: ChatItem[] = [...conv.items, userItem];
  const messages: Message[] = [...conv.messages, { role: 'user', content: [...conv.appNotes.map(appNote), { type: 'text', text }] }];

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const reply = await send({ system: conv.system, messages, tools: TOOLS });
      messages.push({ role: 'assistant', content: reply.content });
      const said = reply.content
        .filter(isText)
        .map((b) => b.text.trim())
        .filter(Boolean)
        .join('\n\n');
      if (said) items.push({ id: makeId(), kind: 'coach', text: said });
      if (reply.stop_reason === 'refusal') {
        items.push({ id: makeId(), kind: 'error', text: 'Claude declined to answer that. Try asking another way.' });
        break;
      }
      const calls = reply.content.filter(isToolUse);
      if (calls.length === 0) {
        if (!said) items.push({ id: makeId(), kind: 'error', text: 'Claude sent an empty reply. Try again.' });
        return { ...conv, messages, items, appNotes: [] };
      }
      const results: ToolResultBlock[] = calls.map((call) => {
        const outcome = runTool(call.name, call.input ?? {}, data);
        if (outcome.proposal) items.push({ id: makeId(), kind: 'proposal', proposal: outcome.proposal, state: 'pending' });
        return { type: 'tool_result', tool_use_id: call.id, content: outcome.result, ...(outcome.isError ? { is_error: true } : {}) };
      });
      messages.push({ role: 'user', content: results });
    }
    // Out of steps (a refusal ends on Claude's own message and is kept). Claude never answered, so this turn is
    // dropped from what it is sent next time, as after an error; what it showed stays on screen.
    if (messages[messages.length - 1].role === 'user') {
      items.push({ id: makeId(), kind: 'error', text: 'That took too many lookups. Try a narrower question.' });
      return { ...conv, messages: messages.slice(0, conv.messages.length), items, appNotes: conv.appNotes };
    }
    return { ...conv, messages, items, appNotes: [] };
  } catch (e) {
    const message = e instanceof CoachError ? e.message : 'Something went wrong talking to Claude. Try again.';
    // Proposals made before the error stay on screen and can still be applied.
    return { ...conv, items: [...items, { id: makeId(), kind: 'error', text: message }] };
  }
}

/** Marks a proposal applied or cancelled, and queues a note so Claude hears about it with the next message. */
export function settleProposal(conv: Conversation, itemId: string, applied: boolean): Conversation {
  const item = conv.items.find((i) => i.id === itemId);
  if (!item || item.kind !== 'proposal' || item.state !== 'pending') return conv;
  const done = describeProposal(item.proposal);
  return {
    ...conv,
    items: conv.items.map((i) => (i.id === itemId ? { ...item, state: applied ? 'applied' : 'cancelled' } : i)),
    appNotes: [...conv.appNotes, applied ? `The athlete applied: ${done}.` : `The athlete cancelled: ${done}. It was not changed.`],
  };
}
