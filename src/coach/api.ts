// The coach talks to Claude through Anthropic's Messages API, straight from the phone with your own key: the app has
// no server to hold one. Only what a request needs is typed here; anything else in a reply is passed back as it came.

export const COACH_MODELS = {
  sonnet: { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', note: 'Balanced. A few cents a chat.' },
  haiku: { id: 'claude-haiku-5-5', label: 'Haiku 5.5', note: 'Cheapest and quickest; weaker at plan changes.' },
  opus: { id: 'claude-opus-5-5', label: 'Opus 5.5', note: 'Strongest, and several times the cost.' },
} as const;

export type CoachModel = keyof typeof COACH_MODELS;
export const DEFAULT_COACH_MODEL: CoachModel = 'sonnet';

const URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
// Room for thinking as well as the answer; replies are kept short by the prompt, not by this.
const MAX_TOKENS = 16000;

export interface TextBlock {
  type: 'text';
  text: string;
}
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
/** Thinking and any other block types: never changed, only sent back as they came. */
export interface OtherBlock {
  type: string;
  [key: string]: unknown;
}
export type Block = TextBlock | ToolUseBlock | ToolResultBlock | OtherBlock;

export interface Message {
  role: 'user' | 'assistant';
  content: Block[];
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface Request {
  system: string;
  messages: Message[];
  tools: ToolDef[];
}

export interface Reply {
  content: Block[];
  stop_reason: string;
}

/** One request to Claude. A function so the tests and the evals can swap in a scripted or recorded model. */
export type Send = (request: Request) => Promise<Reply>;

/** Something went wrong talking to Claude. The message is written for the person using the app. */
export class CoachError extends Error {}

export const isText = (b: Block): b is TextBlock => b.type === 'text' && typeof (b as TextBlock).text === 'string';
export const isToolUse = (b: Block): b is ToolUseBlock => b.type === 'tool_use';

function errorFor(status: number, body: unknown): CoachError {
  const detail = (body as { error?: { message?: string } } | null)?.error?.message;
  if (status === 401 || status === 403) return new CoachError('Your Anthropic API key was not accepted. Check it in Settings.');
  if (status === 429) return new CoachError('Too many requests, or the account is out of credit. Try again in a minute.');
  if (status >= 500) return new CoachError('Claude is busy right now. Try again in a minute.');
  return new CoachError(detail ? `Claude could not answer: ${detail}` : 'Claude could not answer that. Try again.');
}

/** Sends requests to Claude with your key and the chosen model. */
export function claudeSender(apiKey: string, model: CoachModel, fetchImpl: typeof fetch = fetch): Send {
  const modelId = COACH_MODELS[model].id;
  return async ({ system, messages, tools }) => {
    const body: Record<string, unknown> = { model: modelId, max_tokens: MAX_TOKENS, system, messages, tools };
    // Sonnet 5.5 thinks up front by default; for a chat on a phone, thinking only between tool calls answers sooner.
    if (model === 'sonnet') body.thinking = { type: 'between_tools' };
    let response: Response;
    try {
      response = await fetchImpl(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION },
        body: JSON.stringify(body),
      });
    } catch {
      throw new CoachError("Couldn't reach Claude. Check your connection and try again.");
    }
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) throw errorFor(response.status, json);
    const reply = json as Partial<Reply> | null;
    if (!reply || !Array.isArray(reply.content)) throw new CoachError('Claude sent back something the app could not read. Try again.');
    return { content: reply.content, stop_reason: reply.stop_reason ?? 'end_turn' };
  };
}
