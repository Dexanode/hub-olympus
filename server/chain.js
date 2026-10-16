// Read-only chain lookups for Hades. No signing, no private keys, no write methods.

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH = /^0x[a-fA-F0-9]{64}$/;
const HEX_RESULT = /^0x[a-fA-F0-9]*$/;

export const MAX_RPC_CHARS = 65_536;
export const MAX_TOOL_RESULT_CHARS = 4_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_MS = 60_000;

const READ_METHODS = new Set([
  'eth_blockNumber',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getCode',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_call',
]);

const CHAINS = {
  ethereum: { chainId: 1, nativeSymbol: 'ETH', env: 'ETH_RPC_URL', defaultUrl: 'https://ethereum.publicnode.com' },
  base: { chainId: 8453, nativeSymbol: 'ETH', env: 'BASE_RPC_URL', defaultUrl: 'https://mainnet.base.org' },
  arbitrum: { chainId: 42161, nativeSymbol: 'ETH', env: 'ARBITRUM_RPC_URL', defaultUrl: 'https://arb1.arbitrum.io/rpc' },
  bsc: { chainId: 56, nativeSymbol: 'BNB', env: 'BSC_RPC_URL', defaultUrl: 'https://bsc-dataseed.binance.org' },
  polygon: { chainId: 137, nativeSymbol: 'POL', env: 'POLYGON_RPC_URL', defaultUrl: 'https://polygon-rpc.com' },
};

const ALIASES = {
  eth: 'ethereum',
  ethereum: 'ethereum',
  mainnet: 'ethereum',
  base: 'base',
  arb: 'arbitrum',
  arbitrum: 'arbitrum',
  bsc: 'bsc',
  bnb: 'bsc',
  polygon: 'polygon',
  matic: 'polygon',
};

export const ONCHAIN_PHRASES = [
  'balance',
  'saldo',
  'erc-20',
  'erc20',
  'token',
  'gas price',
  'harga gas',
  'contract',
  'kontrak',
  'tx status',
  'transaction status',
  'status transaksi',
  'tx history',
  'transaction history',
  'riwayat transaksi',
  'on-chain',
  'onchain',
  'on chain',
  'whale',
  'block number',
  'nomor blok',
];

const TOOL_NAMES = new Set([
  'get_native_balance',
  'get_token',
  'get_transaction',
  'get_network',
  'is_contract',
  'get_tx_history',
]);

function fn(name, description, properties, required) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

const chainProp = {
  type: 'string',
  enum: Object.keys(CHAINS),
  description: 'ethereum, base, arbitrum, bsc, or polygon',
};
const addressProp = { type: 'string', description: '0x address with 40 hex characters' };
const hashProp = { type: 'string', description: '0x transaction hash with 64 hex characters' };

export const HADES_TOOLS = [
  fn('get_native_balance', 'Read the native coin balance of an address from the chain RPC. Cite chain, block, and source.', {
    chain: chainProp,
    address: addressProp,
  }, ['chain', 'address']),
  fn('get_token', 'Read ERC-20 name, symbol, decimals, and an optional holder balance. Cite chain, block, and source. Missing code or metadata is a risk flag.', {
    chain: chainProp,
    token: { type: 'string', description: 'ERC-20 contract address' },
    address: { type: 'string', description: 'Holder address. Omit to skip the balance.' },
  }, ['chain', 'token']),
  fn('get_transaction', 'Read a transaction and its receipt status from the chain RPC. Cite the hash, chain, block, and source.', {
    chain: chainProp,
    hash: hashProp,
  }, ['chain', 'hash']),
  fn('get_network', 'Read the latest block number and gas price from the chain RPC.', {
    chain: chainProp,
  }, ['chain']),
  fn('is_contract', 'Check whether an address has contract code. Returns byte length only, never bytecode.', {
    chain: chainProp,
    address: addressProp,
  }, ['chain', 'address']),
  fn('get_tx_history', 'Read recent transactions from an Etherscan-style explorer. Unavailable when no explorer API key is configured.', {
    chain: chainProp,
    address: addressProp,
  }, ['chain', 'address']),
];

export function textIncludesPhrase(text, phrase) {
  const haystack = String(text || '');
  const needle = String(phrase || '').toLowerCase();
  if (!needle) return false;
  if (needle.length >= 5) return haystack.toLowerCase().includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(haystack);
}

export function needsOnchain(text) {
  const value = String(text || '');
  if (/0x[a-fA-F0-9]{64}/.test(value)) return true;
  if (ONCHAIN_PHRASES.some((phrase) => textIncludesPhrase(value, phrase))) return true;
  if (/0x[a-fA-F0-9]{40}/.test(value) && /\b(check|cek|lookup|berapa)\b/i.test(value)) return true;
  return false;
}

export function createChainLimiter({ limit = DEFAULT_LIMIT, windowMs = DEFAULT_WINDOW_MS } = {}) {
  const hits = [];
  return function allow(now = Date.now()) {
    while (hits.length && now - hits[0] >= windowMs) hits.shift();
    if (hits.length >= limit) return false;
    hits.push(now);
    return true;
  };
}

export function createChainClient({ env = process.env, fetchImpl = fetch, allow } = {}) {
  const limit = Number(env.CHAIN_RATE_LIMIT || DEFAULT_LIMIT);
  const windowMs = Number(env.CHAIN_RATE_WINDOW_MS || DEFAULT_WINDOW_MS);
  const gate = allow || createChainLimiter({ limit, windowMs });
  return {
    execute(name, args, signal) {
      return executeTool(name, args, { env, fetchImpl, signal, allow: gate });
    },
  };
}

function normalizeChain(value) {
  const key = ALIASES[String(value || '').trim().toLowerCase()];
  return key && CHAINS[key] ? key : '';
}

function asAddress(value) {
  const text = String(value || '').trim();
  return ADDRESS.test(text) ? text : '';
}

function asHash(value) {
  const text = String(value || '').trim();
  return TX_HASH.test(text) ? text : '';
}

function fail(error, extra = {}) {
  return { error, ...extra };
}

function isHardRpcFailure(error) {
  return /rate limited|took too long|could not be reached|too large|did not return JSON/.test(error || '');
}

async function readCapped(response, max) {
  if (!response?.body?.getReader) {
    const text = await response.text();
    return text.length > max ? { error: 'too large' } : { text };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.length > max) {
      await reader.cancel().catch(() => {});
      return { error: 'too large' };
    }
  }
  return { text: text + decoder.decode() };
}

function clipText(value, max = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function redact(value, env) {
  const secret = String(env.ETHERSCAN_API_KEY || '').trim();
  let text = JSON.stringify(value);
  if (secret) text = text.split(secret).join('[redacted]');
  for (const chain of Object.values(CHAINS)) {
    const url = String(env[chain.env] || '').trim();
    if (url) text = text.split(url).join('[redacted]');
  }
  return JSON.parse(text);
}

function rpcUrl(chain, env) {
  const config = CHAINS[chain];
  const override = String(env[config.env] || '').trim();
  return override || config.defaultUrl;
}

async function rpcCall(chain, method, params, { env, fetchImpl, signal, allow }) {
  if (!READ_METHODS.has(method)) return fail('That chain method is not allowed.', { source: 'rpc', chain });
  if (!allow()) return fail('Onchain lookups are rate limited. Try again in a moment.', { source: 'rpc', chain });
  const timeoutMs = Number(env.CHAIN_RPC_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetchImpl(rpcUrl(chain, env), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: combined,
    });
  } catch (error) {
    if (signal?.aborted && error?.name === 'AbortError') throw error;
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return fail('The chain RPC took too long.', { source: 'rpc', chain });
    }
    return fail('The chain RPC could not be reached.', { source: 'rpc', chain });
  }
  if (!response.ok) {
    await readCapped(response, 2_000);
    return fail('The chain RPC rejected the read.', { source: 'rpc', chain });
  }
  const read = await readCapped(response, MAX_RPC_CHARS);
  if (read.error) return fail('The chain RPC response was too large.', { source: 'rpc', chain });
  const text = read.text;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return fail('The chain RPC did not return JSON.', { source: 'rpc', chain });
  }
  if (json.error) {
    return fail('The chain RPC rejected the read.', {
      source: 'rpc',
      chain,
      detail: clipText(json.error.message || ''),
    });
  }
  return { result: json.result };
}

function hexToBigInt(hex) {
  if (typeof hex !== 'string' || !HEX_RESULT.test(hex) || hex === '0x') return null;
  try {
    return BigInt(hex);
  } catch {
    return null;
  }
}

function formatUnits(value, decimals) {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;
  if (frac === 0n) return whole.toString();
  const digits = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${digits}`;
}

function decodeUint(hex) {
  const value = hexToBigInt(hex);
  return value === null ? null : value.toString();
}

function decodeString(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('0x')) return null;
  const raw = hex.slice(2);
  if (!raw || /[^a-fA-F0-9]/.test(raw)) return null;
  let bytes;
  if (raw.length === 64) {
    bytes = Buffer.from(raw, 'hex');
  } else if (raw.length >= 192 && raw.length % 2 === 0) {
    const length = Number(BigInt(`0x${raw.slice(64, 128)}`));
    if (!Number.isInteger(length) || length < 0 || length > 128) return null;
    bytes = Buffer.from(raw.slice(128, 128 + length * 2), 'hex');
  } else {
    return null;
  }
  const text = bytes.toString('utf8').replace(/\u0000/g, '').replace(/[\u0001-\u001f\u007f]/g, '').trim();
  if (!text || text.length > 64) return null;
  return text;
}

function codeBytes(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('0x')) return null;
  const body = hex.slice(2);
  if (body.length % 2 !== 0 || /[^a-fA-F0-9]/.test(body)) return null;
  if (/^0*$/.test(body)) return 0;
  return body.length / 2;
}

function selectorData(selector, address) {
  const clean = address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  return `${selector}${clean}`;
}

async function readCode(chain, address, ctx) {
  const coded = await rpcCall(chain, 'eth_getCode', [address, 'latest'], ctx);
  if (coded.error) return coded;
  const bytes = codeBytes(coded.result);
  if (bytes === null) return fail('The chain RPC did not return code.', { source: 'rpc', chain });
  return { source: 'rpc', chain, address, isContract: bytes > 0, codeBytes: bytes };
}

export async function executeTool(name, rawArgs, { env = process.env, fetchImpl = fetch, signal, allow } = {}) {
  const gate = allow || (() => true);
  const args = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? rawArgs : {};
  if (!TOOL_NAMES.has(name)) return fail('Unknown lookup.');
  const chain = normalizeChain(args.chain);
  if (!chain) {
    return fail('Chain is not allowed. Use ethereum, base, arbitrum, bsc, or polygon.');
  }
  const ctx = { env, fetchImpl, signal, allow: gate };

  if (name === 'get_network') {
    const block = await rpcCall(chain, 'eth_blockNumber', [], ctx);
    if (block.error) return block;
    const gas = await rpcCall(chain, 'eth_gasPrice', [], ctx);
    if (gas.error) return gas;
    const blockNumber = decodeUint(block.result);
    const gasWei = hexToBigInt(gas.result);
    if (blockNumber === null || gasWei === null) return fail('The chain RPC did not return a block or gas price.', { source: 'rpc', chain });
    return redact({
      source: 'rpc',
      chain,
      blockNumber,
      gasPriceWei: gasWei.toString(),
      gasPriceGwei: formatUnits(gasWei, 9),
    }, env);
  }

  if (name === 'get_native_balance') {
    const address = asAddress(args.address);
    if (!address) return fail('Address must be a 0x-prefixed 40 hex character string.', { chain });
    const block = await rpcCall(chain, 'eth_blockNumber', [], ctx);
    if (block.error) return block;
    const balance = await rpcCall(chain, 'eth_getBalance', [address, 'latest'], ctx);
    if (balance.error) return balance;
    const wei = hexToBigInt(balance.result === '0x' ? '0x0' : balance.result);
    const blockNumber = decodeUint(block.result);
    if (wei === null || blockNumber === null) return fail('The chain RPC did not return a balance.', { source: 'rpc', chain });
    return redact({
      source: 'rpc',
      chain,
      blockNumber,
      address,
      nativeSymbol: CHAINS[chain].nativeSymbol,
      wei: wei.toString(),
      balance: formatUnits(wei, 18),
    }, env);
  }

  if (name === 'is_contract') {
    const address = asAddress(args.address);
    if (!address) return fail('Address must be a 0x-prefixed 40 hex character string.', { chain });
    const coded = await readCode(chain, address, ctx);
    if (coded.error) return coded;
    return redact({
      ...coded,
      risk: coded.isContract ? null : 'no contract code at this address',
    }, env);
  }

  if (name === 'get_transaction') {
    const hash = asHash(args.hash);
    if (!hash) return fail('Transaction hash must be a 0x-prefixed 64 hex character string.', { chain });
    const tx = await rpcCall(chain, 'eth_getTransactionByHash', [hash], ctx);
    if (tx.error) return tx;
    if (!tx.result) {
      return redact({ source: 'rpc', chain, hash, status: 'not_found' }, env);
    }
    const receipt = await rpcCall(chain, 'eth_getTransactionReceipt', [hash], ctx);
    if (receipt.error) return receipt;
    const row = tx.result || {};
    const rec = receipt.result;
    let status = 'pending';
    if (rec?.status === '0x1') status = 'success';
    else if (rec?.status === '0x0') status = 'reverted';
    else if (rec) status = 'unknown';
    const value = hexToBigInt(row.value || '0x0') || 0n;
    const input = typeof row.input === 'string' ? row.input : '';
    return redact({
      source: 'rpc',
      chain,
      hash,
      status,
      blockNumber: rec?.blockNumber ? decodeUint(rec.blockNumber) : (row.blockNumber ? decodeUint(row.blockNumber) : null),
      from: asAddress(row.from) || null,
      to: asAddress(row.to) || null,
      valueWei: value.toString(),
      value: formatUnits(value, 18),
      nativeSymbol: CHAINS[chain].nativeSymbol,
      gasUsed: rec?.gasUsed ? decodeUint(rec.gasUsed) : null,
      inputSelector: input.length >= 10 ? input.slice(0, 10) : null,
    }, env);
  }

  if (name === 'get_token') {
    const token = asAddress(args.token);
    if (!token) return fail('Token address must be a 0x-prefixed 40 hex character string.', { chain });
    const holder = args.address == null || args.address === '' ? '' : asAddress(args.address);
    if (args.address && !holder) return fail('Holder address must be a 0x-prefixed 40 hex character string.', { chain });
    const block = await rpcCall(chain, 'eth_blockNumber', [], ctx);
    if (block.error) return block;
    const coded = await readCode(chain, token, ctx);
    if (coded.error) return coded;
    const call = async (data) => {
      const result = await rpcCall(chain, 'eth_call', [{ to: token, data }, 'latest'], ctx);
      if (result.error) return result;
      return { value: result.result };
    };
    const nameCall = coded.isContract ? await call('0x06fdde03') : { value: null };
    if (nameCall.error && isHardRpcFailure(nameCall.error)) return nameCall;
    const symbolCall = coded.isContract ? await call('0x95d89b41') : { value: null };
    if (symbolCall.error && isHardRpcFailure(symbolCall.error)) return symbolCall;
    const decimalsCall = coded.isContract ? await call('0x313ce567') : { value: null };
    if (decimalsCall.error && isHardRpcFailure(decimalsCall.error)) return decimalsCall;
    const name = decodeString(nameCall.value);
    const symbol = decodeString(symbolCall.value);
    const decimalsHex = decimalsCall.value;
    const decimalsNum = decimalsHex ? Number(decodeUint(decimalsHex)) : NaN;
    const decimals = Number.isInteger(decimalsNum) && decimalsNum >= 0 && decimalsNum <= 36 ? decimalsNum : null;
    const risks = [];
    if (!coded.isContract) risks.push('no contract code at token address');
    if (coded.isContract && !name && !symbol) risks.push('token metadata unavailable; contract is not verified by this lookup');
    const report = {
      source: 'rpc',
      chain,
      blockNumber: decodeUint(block.result),
      token,
      isContract: coded.isContract,
      codeBytes: coded.codeBytes,
      name,
      symbol,
      decimals,
      verified: null,
      verification: 'not checked',
      risk: risks.length ? risks : null,
    };
    if (holder) {
      const balanceCall = coded.isContract ? await call(selectorData('0x70a08231', holder)) : { value: null };
      if (balanceCall.error && isHardRpcFailure(balanceCall.error)) return balanceCall;
      const rawHex = balanceCall.value;
      const raw = rawHex ? hexToBigInt(rawHex === '0x' ? '0x0' : rawHex) : null;
      report.holder = holder;
      report.balanceRaw = raw === null ? null : raw.toString();
      report.balance = raw !== null && decimals !== null ? formatUnits(raw, decimals) : null;
    }
    return redact(report, env);
  }

  if (name === 'get_tx_history') {
    const address = asAddress(args.address);
    if (!address) return fail('Address must be a 0x-prefixed 40 hex character string.', { chain });
    const key = String(env.ETHERSCAN_API_KEY || '').trim();
    if (!key) {
      return {
        available: false,
        source: 'explorer',
        chain,
        address,
        reason: 'No explorer API key is configured.',
      };
    }
    if (!gate()) return fail('Onchain lookups are rate limited. Try again in a moment.', { source: 'explorer', chain });
    const url = new URL('https://api.etherscan.io/v2/api');
    url.searchParams.set('chainid', String(CHAINS[chain].chainId));
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'txlist');
    url.searchParams.set('address', address);
    url.searchParams.set('page', '1');
    url.searchParams.set('offset', '5');
    url.searchParams.set('sort', 'desc');
    url.searchParams.set('apikey', key);
    const timeoutMs = Number(env.CHAIN_RPC_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response;
    try {
      response = await fetchImpl(url, { signal: combined });
    } catch (error) {
      if (signal?.aborted && error?.name === 'AbortError') throw error;
      return fail('The explorer could not be reached.', { source: 'explorer', chain, available: false });
    }
    const read = await readCapped(response, MAX_RPC_CHARS);
    if (read.error) return fail('The explorer response was too large.', { source: 'explorer', chain, available: false });
    const text = read.text;
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return fail('The explorer did not return JSON.', { source: 'explorer', chain, available: false });
    }
    const rows = Array.isArray(json.result) ? json.result.slice(0, 5) : [];
    if (!response.ok || (json.status === '0' && !rows.length)) {
      return redact({
        available: false,
        source: 'explorer',
        chain,
        address,
        reason: clipText(json.message || 'Explorer history is unavailable.') || 'Explorer history is unavailable.',
      }, env);
    }
    return redact({
      available: true,
      source: 'explorer',
      chain,
      address,
      transactions: rows.map((row) => ({
        hash: asHash(row.hash) || null,
        blockNumber: clipText(row.blockNumber, 40) || null,
        timeStamp: clipText(row.timeStamp, 40) || null,
        from: asAddress(row.from) || null,
        to: asAddress(row.to) || null,
        value: clipText(row.value, 80) || null,
        isError: row.isError === '1' ? '1' : '0',
      })),
    }, env);
  }

  return fail('Unknown lookup.');
}

export function publicArgs(args) {
  const src = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const out = {};
  const chain = normalizeChain(src.chain);
  if (chain) out.chain = chain;
  const address = asAddress(src.address);
  if (address) out.address = address;
  const token = asAddress(src.token);
  if (token) out.token = token;
  const hash = asHash(src.hash);
  if (hash) out.hash = hash;
  return out;
}

export function clipToolResult(value) {
  const text = JSON.stringify(value);
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return JSON.stringify({
    error: 'Tool result was too large to keep.',
    source: value?.source || null,
    chain: value?.chain || null,
  });
}
