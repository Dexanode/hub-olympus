import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatHandler } from './chat.js';
import { createRoomHandler } from './room.js';
import { hadesEvents, MAX_TOOL_ROUNDS } from './hades.js';
import { personas } from './personas.js';

const ADDRESS = `0x${'11'.repeat(20)}`;
const ONE_ETH = '0xde0b6b3a7640000';

function rpcResult(result) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 });
}

function balanceRpc() {
  const methods = [];
  return {
    methods,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      methods.push(body.method);
      if (body.method === 'eth_blockNumber') return rpcResult('0x10');
      if (body.method === 'eth_getBalance') return rpcResult(ONE_ETH);
      return rpcResult(null);
    },
  };
}

test('Hades is enabled and the prompt forbids invented chain data', () => {
  assert.equal(personas.hades.enabled, true);
  assert.match(personas.hades.system, /precise, calm, and data-driven/);
  assert.match(personas.hades.system, /Indonesian or English/);
  assert.match(personas.hades.system, /Never invent numbers, addresses, or transaction data/);
  assert.match(personas.hades.system, /Cite the chain/);
  assert.match(personas.hades.system, /unavailable/);
  assert.match(personas.hades.system, /financial advice/);
  assert.match(personas.hades.system, /private key/);
});

test('mock Hades cites the mocked balance and does not invent one', async () => {
  const rpc = balanceRpc();
  const handle = createChatHandler({
    env: { LLM_PROVIDER: 'mock' },
    chainFetch: rpc.fetchImpl,
  });
  const result = await handle({
    body: {
      agent: 'hades',
      messages: [{ role: 'user', content: `What is the balance of ${ADDRESS} on ethereum?` }],
      stream: false,
    },
    ip: '10.4.0.1',
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.lookups[0].tool, 'get_native_balance');
  assert.equal(result.json.lookups[0].args.address, ADDRESS);
  assert.equal(result.json.lookups[0].args.chain, 'ethereum');
  assert.match(result.json.reply, /Cited tool result/);
  assert.match(result.json.reply, /"balance":"1"/);
  assert.match(result.json.reply, /"blockNumber":"16"/);
  assert.match(result.json.reply, /"source":"rpc"/);
  assert.equal(result.json.reply.includes('2.84'), false);
  assert.equal(result.json.turns[0].lookup.tool, 'get_native_balance');
  assert.equal(result.json.turns[1].speaker, 'hades');
  assert.deepEqual(rpc.methods, ['eth_blockNumber', 'eth_getBalance']);
});

test('Hades says data is unavailable when the question has nothing to look up', async () => {
  let calls = 0;
  const handle = createChatHandler({
    env: { LLM_PROVIDER: 'mock' },
    chainFetch: async () => {
      calls += 1;
      return rpcResult('0x0');
    },
  });
  const result = await handle({
    body: { agent: 'hades', messages: [{ role: 'user', content: 'How is the weather?' }], stream: false },
    ip: '10.4.0.2',
  });
  assert.match(result.json.reply, /No tool result is available/);
  assert.equal(result.json.reply.includes('0x'), false);
  assert.equal(calls, 0);
  assert.equal(result.json.lookups.length, 0);
});

test('a wallet connection issue does not ask Hades, and a balance does', async () => {
  let calls = 0;
  const handle = createChatHandler({
    env: { LLM_PROVIDER: 'mock' },
    chainFetch: async () => {
      calls += 1;
      return rpcResult('0x1');
    },
  });
  const wallet = await handle({
    body: { agent: 'demeter', messages: [{ role: 'user', content: 'My wallet will not connect.' }], stream: false },
    ip: '10.4.0.3',
  });
  assert.equal(wallet.status, 200);
  assert.match(wallet.json.reply, /I am Demeter/);
  assert.equal(wallet.json.turns, undefined);
  assert.equal(calls, 0);

  const rpc = balanceRpc();
  const onchain = await createChatHandler({
    env: { LLM_PROVIDER: 'mock' },
    chainFetch: rpc.fetchImpl,
  })({
    body: {
      agent: 'demeter',
      messages: [{ role: 'user', content: `What is the balance of ${ADDRESS}?` }],
      stream: false,
    },
    ip: '10.4.0.4',
  });
  assert.equal(onchain.status, 200);
  assert.equal(onchain.json.turns[0].lookup.tool, 'get_native_balance');
  assert.equal(onchain.json.turns[1].speaker, 'hades');
  assert.match(onchain.json.turns[1].content, /"balance":"1"/);
  assert.equal(onchain.json.turns[2].speaker, 'demeter');
  assert.match(onchain.json.reply, /I am Demeter/);
  assert.match(onchain.json.reply, /Hades checked/);
  assert.equal(onchain.json.reply.includes('1000000000000000000'), false);
  assert.match(onchain.json.reply, /seed phrase/);
});

test('tool rounds stop at four, then a final answer without tools', async () => {
  const seen = [];
  let executes = 0;
  const provider = {
    async complete({ tools }) {
      seen.push(Boolean(tools?.length));
      if (seen.length <= MAX_TOOL_ROUNDS) {
        return {
          content: '',
          toolCalls: [{ id: `c${seen.length}`, name: 'get_network', arguments: '{"chain":"ethereum"}' }],
        };
      }
      return { content: 'Lookup limit reached. No further chain facts.', toolCalls: [] };
    },
  };
  const client = {
    async execute() {
      executes += 1;
      return { source: 'rpc', chain: 'ethereum', blockNumber: '1', gasPriceWei: '1', gasPriceGwei: '0.000000001' };
    },
  };
  let text = '';
  const lookups = [];
  for await (const event of hadesEvents({
    provider,
    system: personas.hades.system,
    messages: [{ role: 'user', content: 'block number' }],
    client,
  })) {
    if (event.lookup) lookups.push(event.lookup);
    if (event.delta) text += event.delta;
  }
  assert.equal(executes, MAX_TOOL_ROUNDS);
  assert.equal(lookups.length, MAX_TOOL_ROUNDS);
  assert.equal(seen.length, MAX_TOOL_ROUNDS + 1);
  assert.equal(seen.at(-1), false);
  assert.match(text, /Lookup limit reached/);
});

test('an OpenAI-compatible tool call is executed and the key stays off the reply', async () => {
  const llmBodies = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    llmBodies.push(body);
    if (llmBodies.length === 1) {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: '',
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: {
                name: 'get_native_balance',
                arguments: JSON.stringify({ chain: 'ethereum', address: ADDRESS }),
              },
            }],
          },
        }],
      }), { status: 200 });
    }
    const tool = body.messages.find((message) => message.role === 'tool');
    assert.match(tool.content, /"balance":"1"/);
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'Balance is 1 ETH at block 16 on ethereum. Source: rpc.' } }],
    }), { status: 200 });
  };
  const rpc = balanceRpc();
  const handle = createChatHandler({
    env: {
      LLM_PROVIDER: 'deepseek',
      DEEPSEEK_API_KEY: 'test-key-not-real',
      DEEPSEEK_MODEL: 'deepseek-chat',
    },
    fetchImpl,
    chainFetch: rpc.fetchImpl,
  });
  const result = await handle({
    body: {
      agent: 'hades',
      messages: [{ role: 'user', content: `balance ${ADDRESS}` }],
      stream: false,
    },
    ip: '10.4.0.5',
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.reply, 'Balance is 1 ETH at block 16 on ethereum. Source: rpc.');
  assert.equal(llmBodies[0].stream, false);
  assert.equal(llmBodies[0].tools.some((tool) => tool.function.name === 'get_native_balance'), true);
  assert.equal(llmBodies[0].tools.some((tool) => /send|sign/i.test(tool.function.name)), false);
  assert.equal(llmBodies[1].messages.some((message) => message.role === 'tool' && message.tool_call_id === 'call_1'), true);
  assert.equal(JSON.stringify(result.json).includes('test-key-not-real'), false);
  assert.deepEqual(rpc.methods, ['eth_blockNumber', 'eth_getBalance']);
});

test('the throne room consults Hades for an onchain balance', async () => {
  const rpc = balanceRpc();
  const handle = createRoomHandler({
    env: { LLM_PROVIDER: 'mock' },
    chainFetch: rpc.fetchImpl,
    allow: () => true,
  });
  const result = await handle({
    body: {
      messages: [{ role: 'user', speaker: 'owner', content: `Check the onchain balance of ${ADDRESS}` }],
      stream: false,
    },
    ip: '10.4.0.6',
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.json.consult, ['hades']);
  assert.equal(result.json.turns[0].lookup.tool, 'get_native_balance');
  assert.equal(result.json.turns[1].speaker, 'hades');
  assert.match(result.json.turns[1].content, /"balance":"1"/);
  assert.equal(result.json.turns[2].speaker, 'zeus');
  assert.match(result.json.turns[2].content, /I asked Hades/);
});

test('framed Hades stream emits the lookup before the cited text', async () => {
  const rpc = balanceRpc();
  const handle = createChatHandler({
    env: { LLM_PROVIDER: 'mock' },
    chainFetch: rpc.fetchImpl,
  });
  const result = await handle({
    body: {
      agent: 'hades',
      messages: [{ role: 'user', content: `balance of ${ADDRESS}` }],
      stream: true,
    },
    ip: '10.4.0.7',
  });
  assert.equal(result.framed, true);
  const events = [];
  for await (const event of result.stream) events.push(event);
  assert.equal(events[0].lookup.tool, 'get_native_balance');
  assert.equal(events.at(-1).done, true);
  const text = events.filter((event) => event.delta).map((event) => event.delta).join('');
  assert.match(text, /Cited tool result/);
});
