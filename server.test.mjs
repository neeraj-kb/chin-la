import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

process.env.GEMINI_MODEL = 'test-gemini-model';
process.env.OPENROUTER_VISION_MODEL = 'test-openrouter-vision-model';
process.env.OPENROUTER_CHAT_MODEL = 'test-openrouter-chat-model';
// Simulate an existing .env copied from the old example; the server must upgrade it.
process.env.GROQ_MODEL = 'qwen/qwen3.6-27b';
for (const name of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'OPENROUTER_VISION_API_KEY', 'OPENROUTER_CHAT_API_KEY', 'api1', 'api2']) {
  process.env[name] = 'unit-test-disabled-key';
}
const { createApp } = await import('./server/index.mjs');

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/test-gemini-model:generateContent';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_VISION_MODEL = 'test-openrouter-vision-model';
const OPENROUTER_CHAT_MODEL = 'test-openrouter-chat-model';
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const IMAGE = 'data:image/png;base64,aGVsbG8=';

const replyFixture = {
  explanation: 'This page shows a sign-in alert. Check it before responding.',
  background: 'Unexpected sign-in prompts can be a sign that someone is trying to access an account.',
  nextStep: 'Open your organization’s known sign-in page directly and review recent activity.',
  steps: ['Do not use the email link.', 'Contact your administrator if the sign-in is unfamiliar.'],
  currentStep: 'Review the sign-in details',
  goal: 'Check an unexpected sign-in alert',
  screenSummary: 'A sign-in alert is open.',
  lastIssue: 'Unexpected sign-in alert',
  completedSteps: [],
  confidence: 'medium',
  shouldInterrupt: true,
};

function providerConfig(t, {
  gemini = '',
  groq = 'unit-test-groq-key',
  openrouter = '',
  openrouterVision = '',
  openrouterChat = '',
  api1 = '',
  api2 = '',
} = {}) {
  const names = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'OPENROUTER_VISION_API_KEY', 'OPENROUTER_CHAT_API_KEY', 'api1', 'api2'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    GEMINI_API_KEY: gemini,
    GROQ_API_KEY: groq,
    OPENROUTER_API_KEY: openrouter,
    OPENROUTER_VISION_API_KEY: openrouterVision,
    OPENROUTER_CHAT_API_KEY: openrouterChat,
    api1,
    api2,
  });
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

async function withServer(t) {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    const closed = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await closed;
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function mockProviderFetch(t, handler) {
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://generativelanguage.googleapis.com/') || url === GROQ_URL || url === OPENROUTER_URL) {
      return handler(url, init);
    }
    return realFetch(input, init);
  });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function groqReplyResponse(reply = replyFixture) {
  return jsonResponse({ choices: [{ message: { content: JSON.stringify(reply) } }] });
}

test('screen analysis → Groq guidance keeps the visible context and session progress', async (t) => {
  providerConfig(t, { gemini: 'unit-test-gemini-key' });
  const calls = [];
  mockProviderFetch(t, async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    if (url === GEMINI_URL) {
      assert.equal(init.headers['x-goog-api-key'], 'unit-test-gemini-key');
      assert.equal(body.contents[0].parts[1].inlineData.data, 'aGVsbG8=');
      assert.deepEqual(body.generationConfig, { maxOutputTokens: 600 });
      return jsonResponse({ candidates: [{ content: { parts: [{ text: 'A sign-in alert is open on the account page.' }] } }] });
    }

    assert.equal(init.headers.Authorization, 'Bearer unit-test-groq-key');
    assert.equal(body.model, GROQ_MODEL);
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.reasoning_format, 'hidden');
    assert.equal(body.max_completion_tokens, 900);
    const systemMessage = body.messages.find((message) => message.role === 'system');
    assert.match(systemMessage.content, /untrusted data/i);
    const context = JSON.parse(body.messages.at(-1).content);
    assert.equal(context.currentScreenDescription, 'A sign-in alert is open on the account page.');
    assert.equal(context.userMessage, 'Where do I review the sign-in?');
    assert.equal(context.sessionState.goal, 'Investigate a sign-in alert');
    assert.equal(context.sessionState.currentStep, 'Open account activity');
    assert.equal(body.messages[1].content, 'I opened the account security page.');
    return groqReplyResponse();
  });

  const base = await withServer(t);
  const response = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5187' },
    body: JSON.stringify({
      message: 'Where do I review the sign-in?',
      frameData: IMAGE,
      eventOnly: false,
      state: { goal: 'Investigate a sign-in alert', currentStep: 'Open account activity' },
      history: [{ role: 'assistant', text: 'I opened the account security page.' }],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5187');
  assert.deepEqual(calls.map((call) => call.url), [GEMINI_URL, GROQ_URL]);
  assert.equal(body.reply.explanation, replyFixture.explanation);
  assert.equal(body.reply.nextStep, replyFixture.nextStep);
  assert.equal(body.reply.confidence, 'medium');
  assert.equal(body.reply.screenSummary, replyFixture.screenSummary);
});

test('OpenRouter uses separate api1/api2 keys for vision and chat', async (t) => {
  providerConfig(t, { groq: '', api1: 'unit-test-openrouter-vision-key', api2: 'unit-test-openrouter-chat-key' });
  const calls = [];
  mockProviderFetch(t, async (url, init) => {
    assert.equal(url, OPENROUTER_URL);
    const body = JSON.parse(init.body);
    calls.push({ init, body });
    if (calls.length === 1) {
      assert.equal(init.headers.Authorization, 'Bearer unit-test-openrouter-vision-key');
      assert.equal(body.model, OPENROUTER_VISION_MODEL);
      assert.equal(body.max_completion_tokens, 600);
      assert.equal(body.messages[0].content[1].image_url.url, IMAGE);
      assert.match(body.messages[0].content[0].text, /untrusted user content/i);
      return jsonResponse({ choices: [{ message: { content: 'A sign-in alert is open on the account page.' } }] });
    }

    assert.equal(init.headers.Authorization, 'Bearer unit-test-openrouter-chat-key');
    assert.equal(body.model, OPENROUTER_CHAT_MODEL);
    assert.equal(body.max_completion_tokens, 900);
    assert.deepEqual(body.response_format, { type: 'json_object' });
    const context = JSON.parse(body.messages.at(-1).content);
    assert.equal(context.currentScreenDescription, 'A sign-in alert is open on the account page.');
    assert.equal(context.userMessage, 'Where should I review this?');
    return groqReplyResponse();
  });

  const base = await withServer(t);
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.deepEqual(health.configured, { gemini: false, groq: false, openrouter: true, openrouterChat: true });

  const response = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Where should I review this?', frameData: IMAGE, state: {}, history: [] }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(body.reply.explanation, replyFixture.explanation);
});

test('one shared OpenRouter key supports vision and chat', async (t) => {
  providerConfig(t, { groq: '', openrouter: 'unit-test-openrouter-shared-key' });
  let calls = 0;
  mockProviderFetch(t, async (url, init) => {
    assert.equal(url, OPENROUTER_URL);
    assert.equal(init.headers.Authorization, 'Bearer unit-test-openrouter-shared-key');
    const body = JSON.parse(init.body);
    calls += 1;
    if (calls === 1) {
      assert.equal(body.model, OPENROUTER_VISION_MODEL);
      assert.equal(body.messages[0].content[1].image_url.url, IMAGE);
      return jsonResponse({ choices: [{ message: { content: 'A blank one-pixel test image.' } }] });
    }
    assert.equal(body.model, OPENROUTER_CHAT_MODEL);
    return groqReplyResponse();
  });

  const base = await withServer(t);
  const response = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What does this image show?', frameData: IMAGE, state: {}, history: [] }),
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.equal((await response.json()).reply.explanation, replyFixture.explanation);
});

test('Gemini failure falls back to Groq vision, then returns plain-language guidance', async (t) => {
  providerConfig(t, { gemini: 'unit-test-gemini-key' });
  const calls = [];
  mockProviderFetch(t, async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url === GEMINI_URL) return jsonResponse({ error: { message: 'Gemini billing unavailable' } }, 403);
    if (calls.length === 2) {
      assert.equal(body.model, GROQ_MODEL);
      assert.equal(body.messages[0].content[1].image_url.url, IMAGE);
      assert.equal(body.max_completion_tokens, 500);
      assert.equal(body.reasoning_format, 'hidden');
      return jsonResponse({ choices: [{ message: { content: 'A browser warning says the connection is not private.' } }] });
    }
    const context = JSON.parse(body.messages.at(-1).content);
    assert.equal(context.currentScreenDescription, 'A browser warning says the connection is not private.');
    return groqReplyResponse();
  });

  const base = await withServer(t);
  const response = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What should I do?', frameData: IMAGE }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(calls.map((call) => call.url), [GEMINI_URL, GROQ_URL, GROQ_URL]);
  assert.equal(body.reply.explanation, replyFixture.explanation);
});

test('screen-change events update guidance without requiring a user chat message', async (t) => {
  providerConfig(t, { gemini: '' });
  const calls = [];
  mockProviderFetch(t, async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (calls.length === 1) {
      assert.equal(body.messages[0].content[1].image_url.url, IMAGE);
      return jsonResponse({ choices: [{ message: { content: 'A new security notification appeared.' } }] });
    }
    const context = JSON.parse(body.messages.at(-1).content);
    assert.match(context.userMessage, /meaningful screen change/i);
    assert.equal(context.sessionState.currentStep, 'Review the notification title');
    return groqReplyResponse({ ...replyFixture, shouldInterrupt: false, screenSummary: 'A security notification appeared.' });
  });

  const base = await withServer(t);
  const response = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '',
      frameData: IMAGE,
      eventOnly: true,
      state: { goal: 'Check an alert', currentStep: 'Review the notification title' },
      history: [],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(body.reply.shouldInterrupt, false);
  assert.equal(body.reply.screenSummary, 'A security notification appeared.');
});

test('Groq alone supports chat and vision, and health reports key presence accurately', async (t) => {
  providerConfig(t, { gemini: '' });
  let providerCalls = 0;
  mockProviderFetch(t, async (_url, init) => {
    providerCalls += 1;
    const body = JSON.parse(init.body);
    const context = JSON.parse(body.messages.at(-1).content);
    assert.equal(context.userMessage, 'Where is the report button?');
    assert.match(context.currentScreenDescription, /No current screen is available/);
    return groqReplyResponse();
  });

  const base = await withServer(t);
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.deepEqual(health, { ok: true, configured: { gemini: false, groq: true, openrouter: false, openrouterChat: false } });

  const response = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Where is the report button?', state: {}, history: [] }),
  });
  assert.equal(response.status, 200);
  assert.equal(providerCalls, 1);
});

test('invalid images and empty turns stop before provider calls', async (t) => {
  providerConfig(t);
  mockProviderFetch(t, async () => assert.fail('Provider must not be called for invalid input.'));
  const base = await withServer(t);

  const invalidImage = await fetch(`${base}/api/turn`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Check this', frameData: 'not-an-image' }),
  });
  assert.equal(invalidImage.status, 400);
  assert.match((await invalidImage.json()).error, /supported format/i);

  const emptyTurn = await fetch(`${base}/api/turn`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '', eventOnly: false }),
  });
  assert.equal(emptyTurn.status, 400);
});

test('provider failures return a recoverable response and never include configured keys', async (t) => {
  providerConfig(t, { gemini: 'unit-test-gemini-key' });
  mockProviderFetch(t, async (url) => {
    if (url === GEMINI_URL) return jsonResponse({ error: { message: 'Gemini test outage' } }, 503);
    return jsonResponse({ error: { message: 'Groq test outage' } }, 503);
  });
  const base = await withServer(t);
  const response = await fetch(`${base}/api/turn`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What is happening?', frameData: IMAGE }),
  });
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.match(body.error, /Gemini test outage/);
  assert.match(body.error, /Groq test outage/);
  assert.doesNotMatch(body.error, /unit-test-(?:gemini|groq)-key/);
});
