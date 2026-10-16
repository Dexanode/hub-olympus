import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoomHandler, planDelegation } from './room.js';
import { createMockProvider } from './providers.js';

const owner = (content) => ({ role: 'user', content, speaker: 'owner' });

function handler(env, fetchImpl) {
  return createRoomHandler({ env, fetchImpl });
}

test('routing consults at most two gods and skips disabled ones', () => {
  const wallet = planDelegation('My wallet will not connect.');
  assert.deepEqual(wallet.consult.map((persona) => persona.id), ['demeter']);
  assert.deepEqual(wallet.offline, []);

  const liquidity = planDelegation('Please review the liquidity yield.');
  assert.deepEqual(liquidity.consult, []);
  assert.deepEqual(liquidity.offline.map((persona) => persona.id), ['athena']);

  const many = planDelegation('liquidity wallet applicant konten bug whale');
  assert.deepEqual(many.consult.map((persona) => persona.id), ['demeter', 'hades']);
  assert.equal(many.offline.length, 2);
  assert.deepEqual(many.offline.map((persona) => persona.id), ['athena', 'aphrodite']);

  const sol = planDelegation('Did this Phantom signature land on Solana?');
  assert.deepEqual(sol.consult.map((persona) => persona.id), ['hades']);

  const hash = `0x${'ab'.repeat(32)}`;
  const tx = planDelegation(`What is the status of ${hash}?`);
  assert.deepEqual(tx.consult.map((persona) => persona.id), ['hades']);
  assert.deepEqual(tx.offline, []);

  const capped = planDelegation('liquidity wallet bug', {
    athena: { id: 'athena', name: 'Athena', enabled: true },
    demeter: { id: 'demeter', name: 'Demeter', enabled: true },
    ares: { id: 'ares', name: 'Ares', enabled: true },
  });
  assert.deepEqual(capped.consult.map((persona) => persona.id), ['athena', 'demeter']);
  assert.deepEqual(capped.offline, []);
});

function countingMock() {
  const real = createMockProvider();
  const systems = [];
  return {
    systems,
    provider: {
      name: real.name,
      model: real.model,
      stream(args) {
        systems.push(args.system);
        return real.stream(args);
      },
    },
  };
}

test('a wallet question consults Demeter, then Zeus summarizes', async () => {
  const mock = countingMock();
  const handle = createRoomHandler({ provider: mock.provider, allow: () => true });
  const result = await handle({
    body: { messages: [owner('My wallet will not connect.')], stream: false },
    ip: '10.2.0.1',
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.json.consult, ['demeter']);
  assert.deepEqual(result.json.offline, []);
  assert.equal(mock.systems.length, 2);
  assert.match(mock.systems[0], /You are Demeter/);
  assert.match(mock.systems[1], /throne-room channel/);
  assert.equal(result.json.turns[0].speaker, 'demeter');
  assert.match(result.json.turns[0].content, /seed phrase/);
  assert.equal(result.json.turns[1].speaker, 'zeus');
  assert.match(result.json.turns[1].content, /I asked Demeter/);
});

test('a disabled god is named offline and is not called', async () => {
  const mock = countingMock();
  const handle = createRoomHandler({ provider: mock.provider, allow: () => true });
  const result = await handle({
    body: { messages: [owner('Please review the liquidity yield.')], stream: false },
    ip: '10.2.0.2',
  });
  assert.equal(result.status, 200);
  assert.equal(mock.systems.length, 1);
  assert.match(mock.systems[0], /You are Zeus/);
  assert.equal(mock.systems[0].includes('You are Athena'), false);
  assert.deepEqual(result.json.consult, []);
  assert.deepEqual(result.json.offline, ['athena']);
  assert.equal(result.json.turns.length, 1);
  assert.equal(result.json.turns[0].speaker, 'zeus');
  assert.match(result.json.turns[0].content, /Athena is not yet online/);
  assert.equal(result.json.turns[0].content.includes('18.42'), false);
});

test('the room streams the consulted god before Zeus', async () => {
  const handle = handler({ LLM_PROVIDER: 'mock' });
  const result = await handle({
    body: { messages: [owner('My wallet will not connect.')], stream: true },
    ip: '10.2.0.3',
  });
  const speakers = [];
  let demeter = '';
  let zeus = '';
  for await (const event of result.stream) {
    if (event.done) break;
    assert.equal(event.error, undefined);
    if (speakers.at(-1) !== event.speaker) speakers.push(event.speaker);
    if (event.speaker === 'demeter') demeter += event.delta;
    if (event.speaker === 'zeus') zeus += event.delta;
  }
  assert.deepEqual(speakers, ['demeter', 'zeus']);
  assert.match(demeter, /private key/);
  assert.match(zeus, /Demeter/);
});

test('DeepSeek is asked as Demeter and then as Zeus, not as offline Athena', async () => {
  const seen = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    seen.push(body.messages[0].content);
    const text = seen.length < 3 ? `Note ${seen.length}.` : 'Summary.';
    return new Response(`data: {"choices":[{"delta":{"content":"${text}"}}]}\n\ndata: [DONE]\n\n`, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  };
  const handle = handler({
    LLM_PROVIDER: 'deepseek',
    DEEPSEEK_API_KEY: 'test-key-not-real',
  }, fetchImpl);
  const result = await handle({
    body: { messages: [owner('My wallet will not connect and the yield looks odd.')], stream: false },
    ip: '10.2.0.4',
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.json.consult, ['demeter']);
  assert.deepEqual(result.json.offline, ['athena']);
  assert.equal(seen.length, 2);
  assert.match(seen[0], /customer-support lead/);
  assert.match(seen[1], /throne-room channel/);
  assert.match(seen[1], /Demeter said:/);
  assert.match(seen[1], /Athena/);
  assert.match(seen[1], /not yet online/);
  assert.equal(result.json.turns.map((turn) => turn.speaker).join(','), 'demeter,zeus');
  assert.match(result.json.turns[1].content, /Athena is not yet online|not yet online/);
});
