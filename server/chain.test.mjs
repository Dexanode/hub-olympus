import assert from 'node:assert/strict';
import test from 'node:test';
import { executeTool, needsOnchain, createChainLimiter } from './chain.js';

const ADDRESS = `0x${'11'.repeat(20)}`;
const TOKEN = `0x${'22'.repeat(20)}`;
const HASH = `0x${'ab'.repeat(32)}`;
const ALLOWED = new Set([
  'eth_blockNumber',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getCode',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_call',
]);

function rpcResult(result) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function abiString(value) {
  const data = Buffer.from(value, 'utf8');
  const offset = (32).toString(16).padStart(64, '0');
  const length = data.length.toString(16).padStart(64, '0');
  const padded = data.toString('hex').padEnd(64, '0');
  return `0x${offset}${length}${padded}`;
}

function abiUint(value) {
  return `0x${BigInt(value).toString(16).padStart(64, '0')}`;
}

test('onchain routing ignores a wallet that will not connect', () => {
  assert.equal(needsOnchain('My wallet will not connect.'), false);
  assert.equal(needsOnchain('Tolong, dompet saya tidak tersambung.'), false);
  assert.equal(needsOnchain(`What is the balance of ${ADDRESS} on ethereum?`), true);
  assert.equal(needsOnchain(`status transaksi ${HASH}`), true);
  assert.equal(needsOnchain(`cek token ${TOKEN}`), true);
  assert.equal(needsOnchain('How is the weather?'), false);
});

test('lookups reject bad input and never send a write method', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return rpcResult('0x0');
  };
  const badChain = await executeTool('get_native_balance', { chain: 'solana', address: ADDRESS }, { fetchImpl });
  assert.match(badChain.error, /not allowed/);
  const badAddress = await executeTool('get_native_balance', { chain: 'ethereum', address: '0x123' }, { fetchImpl });
  assert.match(badAddress.error, /40 hex/);
  const badHash = await executeTool('get_transaction', { chain: 'base', hash: ADDRESS }, { fetchImpl });
  assert.match(badHash.error, /64 hex/);
  const unknown = await executeTool('eth_sendTransaction', { chain: 'ethereum', address: ADDRESS }, { fetchImpl });
  assert.match(unknown.error, /Unknown lookup/);
  assert.equal(calls, 0);
});

test('native balance, code, and transaction come only from the mocked RPC', async () => {
  const methods = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    methods.push(body.method);
    assert.equal(ALLOWED.has(body.method), true);
    assert.equal(JSON.stringify(body).includes('eth_send'), false);
    if (body.method === 'eth_blockNumber') return rpcResult('0x10');
    if (body.method === 'eth_getBalance') return rpcResult('0xde0b6b3a7640000');
    if (body.method === 'eth_getCode') return rpcResult('0x60016002');
    if (body.method === 'eth_getTransactionByHash') {
      return rpcResult({
        hash: HASH,
        from: ADDRESS,
        to: TOKEN,
        value: '0xde0b6b3a7640000',
        input: `0xa9059cbb${'0'.repeat(120)}`,
        blockNumber: '0x10',
      });
    }
    if (body.method === 'eth_getTransactionReceipt') {
      return rpcResult({ status: '0x1', blockNumber: '0x10', gasUsed: '0x5208' });
    }
    return rpcResult(null);
  };

  const balance = await executeTool('get_native_balance', { chain: 'ethereum', address: ADDRESS }, { fetchImpl });
  assert.equal(balance.balance, '1');
  assert.equal(balance.wei, '1000000000000000000');
  assert.equal(balance.blockNumber, '16');
  assert.equal(balance.source, 'rpc');
  assert.equal(balance.chain, 'ethereum');
  assert.equal(JSON.stringify(balance).includes('6001'), false);

  const code = await executeTool('is_contract', { chain: 'base', address: ADDRESS }, { fetchImpl });
  assert.equal(code.isContract, true);
  assert.equal(code.codeBytes, 4);
  assert.equal(JSON.stringify(code).includes('6001'), false);

  const empty = await executeTool('is_contract', {
    chain: 'arbitrum',
    address: ADDRESS,
  }, {
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.method, 'eth_getCode');
      return rpcResult('0x');
    },
  });
  assert.equal(empty.isContract, false);
  assert.equal(empty.risk, 'no contract code at this address');

  const tx = await executeTool('get_transaction', { chain: 'bsc', hash: HASH }, { fetchImpl });
  assert.equal(tx.status, 'success');
  assert.equal(tx.blockNumber, '16');
  assert.equal(tx.value, '1');
  assert.equal(tx.inputSelector, '0xa9059cbb');
  assert.equal(JSON.stringify(tx).includes('0'.repeat(40)), false);

  const missing = await executeTool('get_transaction', { chain: 'polygon', hash: HASH }, {
    fetchImpl: async () => rpcResult(null),
  });
  assert.equal(missing.status, 'not_found');
  assert.equal(methods.includes('eth_sendTransaction'), false);
});

test('ERC-20 metadata and balance are decoded from eth_call', async () => {
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === 'eth_blockNumber') return rpcResult('0x20');
    if (body.method === 'eth_getCode') return rpcResult('0x6001');
    if (body.method === 'eth_call') {
      const data = body.params[0].data;
      if (data === '0x06fdde03') return rpcResult(abiString('Demo'));
      if (data === '0x95d89b41') return rpcResult(`0x${Buffer.from('DMO').toString('hex').padEnd(64, '0')}`);
      if (data === '0x313ce567') return rpcResult(abiUint(18));
      if (data.startsWith('0x70a08231')) return rpcResult(abiUint(1500000000000000000n));
    }
    throw new Error(`unexpected ${body.method}`);
  };
  const token = await executeTool('get_token', {
    chain: 'ethereum',
    token: TOKEN,
    address: ADDRESS,
  }, { fetchImpl });
  assert.equal(token.name, 'Demo');
  assert.equal(token.symbol, 'DMO');
  assert.equal(token.decimals, 18);
  assert.equal(token.balance, '1.5');
  assert.equal(token.blockNumber, '32');
  assert.equal(token.verification, 'not checked');
  assert.equal(token.risk, null);
  assert.equal(JSON.stringify(token).includes('6001'), false);
});

test('explorer history is optional and never echoes the API key', async () => {
  let calls = 0;
  const missing = await executeTool('get_tx_history', { chain: 'ethereum', address: ADDRESS }, {
    env: {},
    fetchImpl: async () => {
      calls += 1;
      return new Response('no');
    },
  });
  assert.equal(missing.available, false);
  assert.match(missing.reason, /No explorer API key/);
  assert.equal(calls, 0);

  let seen = '';
  const found = await executeTool('get_tx_history', { chain: 'base', address: ADDRESS }, {
    env: { ETHERSCAN_API_KEY: 'secret-explorer-key' },
    fetchImpl: async (url) => {
      seen = String(url);
      return new Response(JSON.stringify({
        status: '1',
        result: [{
          hash: HASH,
          blockNumber: '16',
          timeStamp: '1700000000',
          from: ADDRESS,
          to: TOKEN,
          value: '1000',
          isError: '0',
          input: `0x${'ff'.repeat(200)}`,
        }],
      }), { status: 200 });
    },
  });
  assert.equal(found.available, true);
  assert.equal(found.transactions.length, 1);
  assert.equal(found.transactions[0].hash, HASH);
  assert.equal(JSON.stringify(found).includes('secret-explorer-key'), false);
  assert.equal(JSON.stringify(found).includes('ff'.repeat(40)), false);
  assert.match(seen, /secret-explorer-key/);
  assert.match(seen, /chainid=8453/);
});

test('RPC replies are size-capped, timed out, and rate limited', async () => {
  const huge = await executeTool('get_network', { chain: 'ethereum' }, {
    fetchImpl: async () => rpcResult(`0x${'ab'.repeat(40_000)}`),
  });
  assert.match(huge.error, /too large/);
  assert.equal(JSON.stringify(huge).includes('abababab'), false);

  const slow = await executeTool('get_network', { chain: 'ethereum' }, {
    env: { CHAIN_RPC_TIMEOUT_MS: '20' },
    fetchImpl: (_url, options) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(rpcResult('0x1')), 1000);
      options.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        const error = new Error('timed out');
        error.name = 'TimeoutError';
        reject(error);
      });
    }),
  });
  assert.match(slow.error, /too long/);

  const allow = createChainLimiter({ limit: 1, windowMs: 60_000 });
  const limited = await executeTool('get_native_balance', { chain: 'ethereum', address: ADDRESS }, {
    allow,
    fetchImpl: async () => rpcResult('0x1'),
  });
  assert.match(limited.error, /rate limited/);
});
