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
  confidenceNote: 'The page is readable, but the sender details are not visible.',
  securityStatus: 'caution',
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
    const url = typeof input === 'string' ? input : input.url || input.href;
    if (url.startsWith('https://generativelanguage.googleapis.com/') || url.startsWith('https://checkurl.phishtank.com/') || url === GROQ_URL || url === OPENROUTER_URL) {
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

test('Gemini reads a screenshot and returns guidance in one provider call', async (t) => {
  providerConfig(t, { gemini: 'unit-test-gemini-key' });
  const calls = [];
  mockProviderFetch(t, async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    assert.equal(url, GEMINI_URL);
    assert.equal(init.headers['x-goog-api-key'], 'unit-test-gemini-key');
    assert.equal(body.contents[0].parts[1].inlineData.data, 'aGVsbG8=');
    assert.deepEqual(body.generationConfig, { maxOutputTokens: 900, mediaResolution: 'MEDIA_RESOLUTION_HIGH', responseMimeType: 'application/json' });
    const systemPrompt = body.systemInstruction.parts[0].text;
    assert.match(systemPrompt, /full sender address/);
    assert.match(systemPrompt, /do not stop after identifying the app/i);
    assert.match(systemPrompt, /Confidence means certainty in the specific observations and advice/i);
    assert.match(systemPrompt, /Set securityStatus separately from reading confidence/i);
    assert.match(systemPrompt, /This is not a claim that the content is safe/i);
    assert.match(systemPrompt, /Never mention an internal image description or analysis step/i);
    assert.match(systemPrompt, /Each steps item must be a plain action sentence without a number or bullet/i);
    const context = JSON.parse(body.contents[0].parts[0].text);
    assert.match(context.recentConversation, /I opened the account security page/);
    assert.equal(context.currentTurn.currentScreenDescription, 'Read the attached screenshot directly; do not rely on a prior visual description.');
    assert.equal(context.currentTurn.userMessage, 'Where do I review the sign-in?');
    assert.equal(context.currentTurn.sessionState.goal, 'Investigate a sign-in alert');
    assert.equal(context.currentTurn.sessionState.currentStep, 'Open account activity');
    return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(replyFixture) }] } }] });
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
  assert.deepEqual(calls.map((call) => call.url), [GEMINI_URL]);
  assert.equal(body.reply.explanation, replyFixture.explanation);
  assert.equal(body.reply.nextStep, replyFixture.nextStep);
  assert.equal(body.reply.confidence, 'medium');
  assert.equal(body.reply.confidenceNote, replyFixture.confidenceNote);
  assert.equal(body.reply.securityStatus, 'caution');
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
      assert.equal(body.max_completion_tokens, 900);
      assert.equal(body.reasoning_effort, 'low');
      assert.deepEqual(body.response_format, { type: 'json_object' });
      const prompt = body.messages[0].content;
      assert.match(prompt, /untrusted content/i);
      assert.match(prompt, /do not stop after identifying the app/i);
      assert.match(prompt, /For an email, read the open message's subject/i);
      const currentTurn = body.messages.at(-1).content;
      assert.equal(currentTurn[0].type, 'text');
      assert.equal(JSON.parse(currentTurn[0].text).userMessage, 'Where should I review this?');
      assert.equal(currentTurn[1].image_url.url, IMAGE);
      return jsonResponse({ choices: [{ message: { content: JSON.stringify(replyFixture) } }] });
    }

    assert.equal(init.headers.Authorization, 'Bearer unit-test-openrouter-chat-key');
    assert.equal(body.model, OPENROUTER_CHAT_MODEL);
    assert.equal(body.max_completion_tokens, 900);
    assert.equal(body.reasoning_effort, 'low');
    assert.deepEqual(body.response_format, { type: 'json_object' });
    const context = JSON.parse(body.messages.at(-1).content);
    assert.match(context.currentScreenDescription, /fake Flash Player update/i);
    assert.equal(context.userMessage, 'How do I close the tab?');
    assert.equal(context.sessionState.securityStatus, 'strong_warning');
    assert.equal(context.monitoringStatus, 'off');
    const priorAssistant = body.messages.find((message) => message.role === 'assistant');
    assert.match(priorAssistant.content, /Recommended next step: Close the browser tab/);
    const system = body.messages.find((message) => message.role === 'system').content;
    assert.match(system, /answer that exact question first/i);
    assert.match(system, /Do not repeat the alert explanation/i);
    assert.match(system, /live, frame-based monitoring/i);
    assert.match(system, /does not create or save a continuous video recording/i);
    return groqReplyResponse();
  });

  const base = await withServer(t);
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.deepEqual(health.configured, { gemini: false, groq: false, openrouter: true, openrouterVision: true, openrouterChat: true });

  const response = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Where should I review this?', frameData: IMAGE, state: {}, history: [] }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.reply.explanation, replyFixture.explanation);

  const chatResponse = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'How do I close the tab?',
      state: {
        screenSummary: 'A fake Flash Player update page asks to download software.',
        securityStatus: 'strong_warning',
        readingConfidence: 'high',
      },
      history: [
        { role: 'assistant', text: 'Screenwise explained: This page is using a fake Flash Player update to get you to download software.\nRecommended next step: Close the browser tab without clicking anything on the page.' },
      ],
    }),
  });
  assert.equal(chatResponse.status, 200);
  assert.equal((await chatResponse.json()).reply.explanation, replyFixture.explanation);
  assert.equal(calls.length, 2);
});

test('one shared OpenRouter key supports one-call screenshot replies and chat', async (t) => {
  providerConfig(t, { groq: '', openrouter: 'unit-test-openrouter-shared-key' });
  let calls = 0;
  mockProviderFetch(t, async (url, init) => {
    assert.equal(url, OPENROUTER_URL);
    assert.equal(init.headers.Authorization, 'Bearer unit-test-openrouter-shared-key');
    const body = JSON.parse(init.body);
    calls += 1;
    if (calls === 1) {
      assert.equal(body.model, OPENROUTER_VISION_MODEL);
      assert.equal(body.messages.at(-1).content[1].image_url.url, IMAGE);
      return jsonResponse({ choices: [{ message: { content: JSON.stringify(replyFixture) } }] });
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
  assert.equal((await response.json()).reply.explanation, replyFixture.explanation);

  const chatResponse = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Explain simply.', state: {}, history: [] }),
  });
  assert.equal(chatResponse.status, 200);
  assert.equal(calls, 2);
});

test('Gemini failure falls back to one-call Groq visual guidance', async (t) => {
  providerConfig(t, { gemini: 'unit-test-gemini-key' });
  const calls = [];
  mockProviderFetch(t, async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url === GEMINI_URL) return jsonResponse({ error: { message: 'Gemini billing unavailable' } }, 403);
    assert.equal(body.model, GROQ_MODEL);
    assert.equal(body.messages.at(-1).content[1].image_url.url, IMAGE);
    assert.equal(body.max_completion_tokens, 900);
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.reasoning_format, 'hidden');
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
  assert.deepEqual(calls.map((call) => call.url), [GEMINI_URL, GROQ_URL]);
  assert.equal(body.reply.explanation, replyFixture.explanation);
});

test('an empty OpenRouter chat reply falls back to configured Gemini with saved guidance', async (t) => {
  providerConfig(t, { gemini: 'unit-test-gemini-key', groq: '', openrouter: 'unit-test-openrouter-key' });
  const calls = [];
  mockProviderFetch(t, async (url, init) => {
    calls.push(url);
    if (url === OPENROUTER_URL) {
      const body = JSON.parse(init.body);
      assert.equal(body.reasoning_effort, 'low');
      return jsonResponse({ choices: [{ finish_reason: 'length', message: { content: '' } }] });
    }

    assert.equal(url, GEMINI_URL);
    assert.equal(init.headers['x-goog-api-key'], 'unit-test-gemini-key');
    const body = JSON.parse(init.body);
    const context = JSON.parse(body.contents[0].parts[0].text);
    assert.match(context.recentConversation, /Close the browser tab without clicking/);
    assert.equal(context.currentTurn.userMessage, 'How do I close the tab?');
    assert.equal(context.currentTurn.sessionState.securityStatus, 'strong_warning');
    return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      ...replyFixture,
      explanation: 'Try Ctrl+W to close the current tab. If it stays open, press Alt+F4 to close the browser window.',
      background: '',
      nextStep: '',
      steps: ['Press Ctrl+W.', 'If the tab stays open, press Alt+F4.'],
      securityStatus: 'strong_warning',
    }) }] } }] });
  });

  const base = await withServer(t);
  const response = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'How do I close the tab?',
      state: { screenSummary: 'A fake Flash Player update asks to download software.', securityStatus: 'strong_warning' },
      history: [{ role: 'assistant', text: 'Recommended next step: Close the browser tab without clicking anything on the page.' }],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [OPENROUTER_URL, GEMINI_URL]);
  assert.match(body.reply.explanation, /Ctrl\+W/);
  assert.deepEqual(body.reply.steps, ['Press Ctrl+W.', 'If the tab stays open, press Alt+F4.']);
  assert.equal(body.reply.securityStatus, 'strong_warning');
});

test('Screenwise capability answers receive the actual monitoring state', async (t) => {
  providerConfig(t, { gemini: '', groq: '', openrouter: 'unit-test-openrouter-key' });
  let requestBody;
  mockProviderFetch(t, async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return jsonResponse({ choices: [{ message: { content: JSON.stringify({
      ...replyFixture,
      explanation: 'Screenwise can monitor a selected screen while it is active, but it does not save a video.',
      securityStatus: 'not_security_related',
    }) } }] });
  });

  const base = await withServer(t);
  const response = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Can you screen record?',
      monitoringStatus: 'off',
      state: {},
      history: [],
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  const context = JSON.parse(requestBody.messages.at(-1).content);
  assert.equal(context.monitoringStatus, 'off');
  assert.match(requestBody.messages[0].content, /does not create or save a continuous video recording/i);
  assert.match(requestBody.messages[0].content, /receives no fresh frames/i);
  assert.match(body.reply.explanation, /monitor a selected screen/i);
});

test('screen-change events update guidance without requiring a user chat message', async (t) => {
  providerConfig(t, { gemini: '' });
  const calls = [];
  mockProviderFetch(t, async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const context = JSON.parse(body.messages.at(-1).content[0].text);
    assert.equal(context.responseMode, 'automatic-screen-change-update');
    assert.match(context.userMessage, /screen change was detected/i);
    assert.equal(context.sessionState.currentStep, 'Review the notification title');
    assert.equal(body.messages.at(-1).content[1].image_url.url, IMAGE);
    const systemMessage = body.messages.find((message) => message.role === 'system');
    assert.match(systemMessage.content, /A scroll, animation, cursor movement, or different page layout is not important by itself/i);
    assert.match(systemMessage.content, /Do not repeat the earlier explanation or steps/i);
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
  assert.equal(calls.length, 1);
  assert.equal(body.reply.shouldInterrupt, false);
  assert.equal(body.reply.screenSummary, 'A security notification appeared.');
});

test('automatic screen updates stay quiet unless the AI clearly flags new information', async (t) => {
  providerConfig(t, { gemini: '' });
  let calls = 0;
  mockProviderFetch(t, async (_url, init) => {
    calls += 1;
    const body = JSON.parse(init.body);
    assert.equal(body.messages.at(-1).content[1].image_url.url, IMAGE);
    return groqReplyResponse({ ...replyFixture, shouldInterrupt: undefined });
  });

  const base = await withServer(t);
  const response = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '', frameData: IMAGE, eventOnly: true, state: {}, history: [] }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(body.reply.shouldInterrupt, false);
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
  assert.deepEqual(health, { ok: true, configured: { gemini: false, groq: true, openrouter: false, openrouterVision: false, openrouterChat: false } });

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

test('a truncated JSON reply recovers readable guidance instead of showing raw JSON', async (t) => {
  providerConfig(t, { gemini: '' });
  const truncatedReply = '{"explanation":"I can see a Codex window with the error Could not reach the local companion API at http://127.0.0.1:8788: fetch failed.","background":"The Companion API did not respond.","nextStep":"Start the Companion with npm run dev in the project folder.","steps":["Leave the terminal running.","Retry the evaluation."],"currentStep":"Start the local API","goal":"Run the evaluation","screenSummary":"Codex shows a local API connection error.';
  mockProviderFetch(t, async (url) => {
    assert.equal(url, GROQ_URL);
    return jsonResponse({ choices: [{ message: { content: truncatedReply } }] });
  });

  const base = await withServer(t);
  const response = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What does my current screen show?', state: {}, history: [] }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(body.reply.explanation, /Codex window with the error/);
  assert.match(body.reply.nextStep, /npm run dev/);
  assert.deepEqual(body.reply.steps, ['Leave the terminal running.', 'Retry the evaluation.']);
  assert.equal(body.reply.confidence, 'low');
  assert.match(body.reply.confidenceNote, /AI response was incomplete/i);
  assert.doesNotMatch(body.reply.explanation, /^\s*\{/);
});

test('a complete but wrong-shaped JSON reply does not leak raw JSON into the chat', async (t) => {
  providerConfig(t, { gemini: '' });
  mockProviderFetch(t, async (url) => {
    assert.equal(url, GROQ_URL);
    return jsonResponse({ choices: [{ message: { content: '{"unexpected":"provider payload"}' } }] });
  });

  const base = await withServer(t);
  const response = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What is happening?', state: {}, history: [] }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(body.reply.explanation, /did not include a readable explanation/i);
  assert.match(body.reply.confidenceNote, /not in the expected format/i);
  assert.equal(body.reply.confidence, 'low');
  assert.doesNotMatch(body.reply.explanation, /provider payload/);
});

test('security status is separate from reading confidence and invalid values become unclear', async (t) => {
  providerConfig(t, { gemini: '' });
  mockProviderFetch(t, async () => groqReplyResponse({
    ...replyFixture,
    confidence: 'high',
    securityStatus: 'high',
  }));

  const base = await withServer(t);
  const response = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What does this screen show?', frameData: IMAGE, state: {}, history: [] }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.reply.confidence, 'high');
  assert.equal(body.reply.securityStatus, 'unclear');
});
