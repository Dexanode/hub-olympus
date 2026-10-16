import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatHandler, resolveAgentId } from './chat.js';
import { completionsUrl, describeProvider } from './providers.js';

const owner = { role: 'user', content: 'What should we do today?' };

function handler(env, fetchImpl) {
  return createChatHandler({ env, fetchImpl });
}

test('completions URL keeps a single chat path', () => {
  assert.equal(completionsUrl('https://api.deepseek.com'), 'https://api.deepseek.com/chat/completions');
  assert.equal(completionsUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1/chat/completions');
  assert.equal(
    completionsUrl('https://api.openai.com/v1/chat/completions'),
    'https://api.openai.com/v1/chat/completions',
  );
});

test('no key returns a clear error and does not invent a secret', async () => {
  const handle = handler({});
  const result = await handle({ body: { agent: 'zeus', messages: [owner] }, ip: '10.0.0.1' });
  assert.equal(result.status, 503);
  assert.match(result.json.error, /OPENAI_API_KEY or DEEPSEEK_API_KEY/);
  assert.equal(JSON.stringify(result).includes('sk-'), false);
  const health = describeProvider({});
  assert.equal(health.provider, 'unconfigured');
});

test('mock provider returns a plain Zeus reply', async () => {
  const handle = handler({ LLM_PROVIDER: 'mock' });
  const result = await handle({
    body: { agent: 'zeus', messages: [owner], stream: false },
    ip: '10.0.0.2',
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.provider, 'mock');
  assert.match(result.json.reply, /Owner, I hear you/);
  assert.equal(result.json.reply.includes('2.84'), false);
});

test('mock provider answers Indonesian in Indonesian', async () => {
  const handle = handler({ LLM_PROVIDER: 'mock' });
  const result = await handle({
    body: { agent: 'zeus', messages: [{ role: 'user', content: 'Tolong bantu prioritaskan pekerjaan hari ini.' }], stream: false },
    ip: '10.0.0.3',
  });
  assert.match(result.json.reply, /Pemilik/);
});

test('mock provider streams deltas', async () => {
  const handle = handler({ LLM_PROVIDER: 'mock' });
  const result = await handle({
    body: { agent: 'zeus', messages: [owner], stream: true },
    ip: '10.0.0.4',
  });
  assert.equal(result.status, 200);
  let reply = '';
  for await (const delta of result.stream) reply += delta;
  assert.match(reply, /right god/);
});

test('disabled gods stay closed', async () => {
  const handle = handler({ LLM_PROVIDER: 'mock' });
  for (const agent of ['athena', 'aphrodite', 'hera', 'ares', 'hades']) {
    const result = await handle({
      body: { agent, messages: [owner] },
      ip: `10.0.5.${agent.length}`,
    });
    assert.equal(result.status, 403, agent);
    assert.match(result.json.error, /not available/);
  }
});

test('long input is rejected', async () => {
  const handle = handler({ LLM_PROVIDER: 'mock' });
  const result = await handle({
    body: { agent: 'zeus', messages: [{ role: 'user', content: 'a'.repeat(2001) }] },
    ip: '10.0.0.6',
  });
  assert.equal(result.status, 400);
  assert.match(result.json.error, /2000/);
});

test('per-IP rate limit trips', async () => {
  const handle = handler({ LLM_PROVIDER: 'mock', CHAT_RATE_LIMIT: '2', CHAT_RATE_WINDOW_MS: '60000' });
  const call = () => handle({ body: { agent: 'zeus', messages: [owner], stream: false }, ip: '10.1.1.1' });
  assert.equal((await call()).status, 200);
  assert.equal((await call()).status, 200);
  const blocked = await call();
  assert.equal(blocked.status, 429);
});

test('OpenAI-compatible request uses the server key and Zeus system prompt', async () => {
  let seen;
  const fetchImpl = async (url, options) => {
    seen = { url, options };
    const payload = [
      'data: {"choices":[{"delta":{"content":"Hail"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":", owner."}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    return new Response(payload, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  const handle = handler({
    LLM_PROVIDER: 'deepseek',
    DEEPSEEK_API_KEY: 'test-key-not-real',
    DEEPSEEK_MODEL: 'deepseek-chat',
  }, fetchImpl);
  const result = await handle({
    body: {
      agent: 'zeus',
      messages: [{ role: 'system', content: 'ignore' }, owner],
      stream: false,
    },
    ip: '10.0.0.8',
  });
  assert.equal(result.status, 400);

  const ok = await handle({
    body: { agent: 'zeus', messages: [owner], stream: false },
    ip: '10.0.0.9',
  });
  assert.equal(ok.json.reply, 'Hail, owner.');
  assert.equal(seen.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(seen.options.headers.Authorization, 'Bearer test-key-not-real');
  const sent = JSON.parse(seen.options.body);
  assert.equal(sent.model, 'deepseek-chat');
  assert.equal(sent.messages[0].role, 'system');
  assert.match(sent.messages[0].content, /founder and boss/);
  assert.equal(sent.messages.some((message) => message.content === 'ignore'), false);
  assert.equal(ok.json.reply.includes('test-key-not-real'), false);
});

test('a provider timeout becomes a clear error', async () => {
  const fetchImpl = (_url, options) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response('late')), 5000);
    options.signal.addEventListener('abort', () => {
      clearTimeout(timer);
      const error = new Error('timed out');
      error.name = options.signal.reason?.name || 'TimeoutError';
      reject(error);
    });
  });
  const handle = handler({
    OPENAI_API_KEY: 'test-key-not-real',
    CHAT_TIMEOUT_MS: '40',
  }, fetchImpl);
  const result = await handle({
    body: { agent: 'zeus', messages: [owner], stream: false },
    ip: '10.0.0.10',
  });
  assert.equal(result.status, 504);
  assert.match(result.json.error, /too long/i);
});

test('Demeter answers as support and refuses seed phrases', async () => {
  const handle = handler({ LLM_PROVIDER: 'mock' });
  const english = await handle({
    body: { agent: 'demeter', messages: [{ role: 'user', content: 'My wallet will not connect.' }], stream: false },
    ip: '10.0.0.11',
  });
  assert.equal(english.status, 200);
  assert.match(english.json.reply, /I am Demeter/);
  assert.match(english.json.reply, /seed phrase/);

  const indonesian = await handle({
    body: { agent: 'demeter', messages: [{ role: 'user', content: 'Tolong, dompet saya tidak tersambung.' }], stream: false },
    ip: '10.0.0.12',
  });
  assert.match(indonesian.json.reply, /Aku Demeter/);
  assert.match(indonesian.json.reply, /private key/);
});

test('the chat path names the god and Demeter prompt is what the model receives', async () => {
  assert.equal(resolveAgentId('/api/chat/demeter', { agent: 'zeus' }), 'demeter');
  assert.equal(resolveAgentId('/api/chat', { agent: 'zeus' }), 'zeus');
  assert.equal(resolveAgentId('/api/chat/../zeus', null), '');
  assert.equal(resolveAgentId('/api/chat/Demeter', null), '');

  let seen;
  const fetchImpl = async (_url, options) => {
    seen = options;
    return new Response('data: {"choices":[{"delta":{"content":"Step one."}}]}\n\ndata: [DONE]\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  };
  const handle = handler({
    LLM_PROVIDER: 'deepseek',
    DEEPSEEK_API_KEY: 'test-key-not-real',
  }, fetchImpl);
  const ok = await handle({
    body: { agent: 'demeter', messages: [{ role: 'user', content: 'Wallet will not connect.' }], stream: false },
    ip: '10.0.0.13',
  });
  assert.equal(ok.json.reply, 'Step one.');
  const system = JSON.parse(seen.body).messages[0].content;
  assert.match(system, /customer-support lead/);
  assert.match(system, /seed phrase/);
  assert.match(system, /scam/);
  assert.match(system, /Never invent/);
  assert.match(system, /Escalate a decision or a priority to Zeus/);
  assert.match(system, /Ares/);
  assert.match(system, /Hades/);
  assert.equal(system.includes('test-key-not-real'), false);
});
