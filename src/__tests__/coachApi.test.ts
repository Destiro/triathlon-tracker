/** The Claude client: what it sends, and the plain messages it gives when something goes wrong. */
import { claudeSender, CoachError } from '../coach/api';

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
const status = (code: number, body: unknown = {}) => Promise.resolve({ ok: false, status: code, json: () => Promise.resolve(body) } as Response);

const request = { system: 'You are the coach.', messages: [{ role: 'user' as const, content: [{ type: 'text', text: 'Hi' }] }], tools: [] };

test('sends the key, the API version and the chosen model, thinking only between tool calls on Sonnet', async () => {
  const fetchImpl = jest.fn(() => ok({ content: [{ type: 'text', text: 'Hello' }], stop_reason: 'end_turn' }));
  const reply = await claudeSender('sk-ant-test', 'sonnet', fetchImpl as unknown as typeof fetch)(request);
  expect(reply).toEqual({ content: [{ type: 'text', text: 'Hello' }], stop_reason: 'end_turn' });

  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://api.anthropic.com/v1/messages');
  expect(init.headers).toMatchObject({ 'x-api-key': 'sk-ant-test', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });
  const body = JSON.parse(init.body as string);
  expect(body).toMatchObject({ model: 'claude-sonnet-5-5', system: 'You are the coach.', thinking: { type: 'between_tools' } });
  // Sonnet 5.5 rejects forced tool use and non-default sampling, so neither is ever sent.
  expect(body).not.toHaveProperty('tool_choice');
  expect(body).not.toHaveProperty('temperature');
});

test('leaves thinking to the model on Haiku and Opus', async () => {
  for (const model of ['haiku', 'opus'] as const) {
    const fetchImpl = jest.fn(() => ok({ content: [], stop_reason: 'end_turn' }));
    await claudeSender('sk-ant-test', model, fetchImpl as unknown as typeof fetch)(request);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model).toBe(`claude-${model}-5-5`);
    expect(body).not.toHaveProperty('thinking');
  }
});

test.each([
  [401, /API key was not accepted/],
  [429, /out of credit/],
  [529, /busy/],
])('a %i reads as a message the athlete can act on', async (code, message) => {
  const send = claudeSender('sk-ant-test', 'sonnet', (() => status(code)) as unknown as typeof fetch);
  await expect(send(request)).rejects.toThrow(CoachError);
  await expect(send(request)).rejects.toThrow(message);
});

test('a bad request passes on what the API said', async () => {
  const send = claudeSender('sk-ant-test', 'sonnet', (() => status(400, { error: { message: 'messages: too long' } })) as unknown as typeof fetch);
  await expect(send(request)).rejects.toThrow('Claude could not answer: messages: too long');
});

test('no connection and an unreadable reply fail quietly with a message, not a crash', async () => {
  const offline = claudeSender('sk-ant-test', 'sonnet', (() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch);
  await expect(offline(request)).rejects.toThrow("Couldn't reach Claude");
  const garbled = claudeSender('sk-ant-test', 'sonnet', (() => ok({ nope: true })) as unknown as typeof fetch);
  await expect(garbled(request)).rejects.toThrow('could not read');
});
