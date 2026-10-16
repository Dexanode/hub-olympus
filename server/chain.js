// Read-only chain lookups for Hades. No signing, no private keys, no write methods.

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH = /^0x[a-fA-F0-9]{64}$/;
const HEX_RESULT = /^0x[a-fA-F0-9]*$/;

export const MAX_RPC_CHARS = 65_536;
export const MAX_TOOL_RESULT_CHARS = 4_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_MS = 60_000;

const EVM_METHODS = new Set([
  'eth_blockNumber',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getCode',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_call',
]);

const SOLANA_METHODS = new Set([
  'getBalance',
  'getTokenAccountsByOwner',
  'getTokenSupply',
  'getAccountInfo',
  'getTransaction',
  'getSignatureStatuses',
  'getSignaturesForAddress',
  'getSlot',
  'getBlockHeight',
]);

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const CHAINS = {
  ethereum: { kind: 'evm', chainId: 1, nativeSymbol: 'ETH', env: 'ETH_RPC_URL', defaultUrl: 'https://ethereum.publicnode.com' },
  base: { kind: 'evm', chainId: 8453, nativeSymbol: 'ETH', env: 'BASE_RPC_URL', defaultUrl: 'https://mainnet.base.org' },
  arbitrum: { kind: 'evm', chainId: 42161, nativeSymbol: 'ETH', env: 'ARBITRUM_RPC_URL', defaultUrl: 'https://arb1.arbitrum.io/rpc' },
  bsc: { kind: 'evm', chainId: 56, nativeSymbol: 'BNB', env: 'BSC_RPC_URL', defaultUrl: 'https://bsc-dataseed.binance.org' },
  polygon: { kind: 'evm', chainId: 137, nativeSymbol: 'POL', env: 'POLYGON_RPC_URL', defaultUrl: 'https://polygon-rpc.com' },
  solana: { kind: 'solana', nativeSymbol: 'SOL', env: 'SOLANA_RPC_URL', defaultUrl: 'https://api.mainnet-beta.solana.com' },
};

const ALIASES = {
  eth: 'ethereum',
  ethereum: 'ethereum',
  mainnet: 'ethereum',
  sol: 'solana',
  solana: 'solana',
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
  'solana',
  'sol',
  'spl',
  'signature',
  'pump.fun',
  'phantom',
  'lamport',
  'lamports',
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
  description: 'ethereum, base, arbitrum, bsc, polygon, or solana',
};
const addressProp = { type: 'string', description: 'EVM 0x address, or a Solana base58 address when chain is solana' };
const hashProp = { type: 'string', description: 'EVM 0x transaction hash, or a Solana transaction signature when chain is solana' };

export const HADES_TOOLS = [
  fn('get_native_balance', 'Read the native coin balance. EVM returns wei at a block. Solana getBalance returns lamports at a slot. Cite chain, block or slot, and source.', {
    chain: chainProp,
    address: addressProp,
  }, ['chain', 'address']),
  fn('get_token', 'EVM: ERC-20 name, symbol, decimals, and an optional holder balance. Solana: pass a mint as token for supply and decimals; pass a wallet as address for that mint balance. Pass a wallet as token to list its SPL token accounts. Cite slot and source. Missing mint data is a risk flag.', {
    chain: chainProp,
    token: { type: 'string', description: 'ERC-20 contract, or a Solana mint or wallet address' },
    address: { type: 'string', description: 'Holder address. Omit on Solana when token is the wallet whose SPL accounts you want.' },
  }, ['chain', 'token']),
  fn('get_transaction', 'Read a transaction and its status. EVM uses the 0x hash. Solana uses the base58 signature with getTransaction and getSignatureStatuses. Cite the hash or signature, chain, block or slot, and source.', {
    chain: chainProp,
    hash: hashProp,
  }, ['chain', 'hash']),
  fn('get_network', 'EVM: latest block number and gas price. Solana: current slot and block height.', {
    chain: chainProp,
  }, ['chain']),
  fn('is_contract', 'EVM: whether the address has contract code. Byte length only, never bytecode. Solana: whether the account is an executable program.', {
    chain: chainProp,
    address: addressProp,
  }, ['chain', 'address']),
  fn('get_tx_history', 'EVM: recent transactions from an Etherscan-style explorer. Unavailable without an explorer API key. Solana: recent signatures from getSignaturesForAddress. No explorer key required.', {
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
  if (solanaSignatureIn(value)) return true;
  if (ONCHAIN_PHRASES.some((phrase) => textIncludesPhrase(value, phrase))) return true;
  if (/0x[a-fA-F0-9]{40}/.test(value) && /\b(check|cek|lookup|berapa)\b/i.test(value)) return true;
  if (solanaAddressIn(value) && /\b(check|cek|lookup|berapa)\b/i.test(value)) return true;
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
  const allowed = CHAINS[chain]?.kind === 'solana' ? SOLANA_METHODS : EVM_METHODS;
  if (!allowed.has(method)) return fail('That chain method is not allowed.', { source: 'rpc', chain });
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

function decodeBase58(text) {
  const valueText = String(text || '');
  if (!valueText || valueText.length > 90) return null;
  let value = 0n;
  for (const char of valueText) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) return null;
    value = (value * 58n) + BigInt(digit);
  }
  let bytes = Buffer.alloc(0);
  if (value > 0n) {
    let hex = value.toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    bytes = Buffer.from(hex, 'hex');
  }
  let zeros = 0;
  for (const char of valueText) {
    if (char !== '1') break;
    zeros += 1;
  }
  if (zeros) bytes = Buffer.concat([Buffer.alloc(zeros), bytes]);
  return bytes;
}

function asSolanaAddress(value) {
  const text = String(value || '').trim();
  if (text.length < 32 || text.length > 44) return '';
  const bytes = decodeBase58(text);
  return bytes && bytes.length === 32 ? text : '';
}

function asSolanaSignature(value) {
  const text = String(value || '').trim();
  if (text.length < 64 || text.length > 90) return '';
  const bytes = decodeBase58(text);
  return bytes && bytes.length === 64 ? text : '';
}

function base58Tokens(text) {
  return String(text || '').match(/[1-9A-HJ-NP-Za-km-z]{32,90}/g) || [];
}

function solanaSignatureIn(text) {
  return base58Tokens(text).find((token) => asSolanaSignature(token)) || '';
}

function solanaAddressIn(text) {
  return base58Tokens(text).find((token) => asSolanaAddress(token)) || '';
}

function asCount(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  return null;
}

function asLamports(value) {
  const text = asCount(value);
  return text === null ? null : BigInt(text);
}

function slotOf(result) {
  return asCount(result?.context?.slot);
}

function splBalance(info) {
  const tokenAmount = info?.tokenAmount || {};
  const amount = typeof tokenAmount.amount === 'string' && /^\d+$/.test(tokenAmount.amount) ? tokenAmount.amount : null;
  const decimals = Number.isInteger(tokenAmount.decimals) && tokenAmount.decimals >= 0 && tokenAmount.decimals <= 36
    ? tokenAmount.decimals
    : null;
  return {
    mint: asSolanaAddress(info?.mint) || null,
    owner: asSolanaAddress(info?.owner) || null,
    amount,
    decimals,
    balance: amount !== null && decimals !== null ? formatUnits(BigInt(amount), decimals) : null,
  };
}

async function solanaTokenAccounts(owner, filter, ctx) {
  const listed = await rpcCall('solana', 'getTokenAccountsByOwner', [
    owner,
    filter,
    { encoding: 'jsonParsed' },
  ], ctx);
  if (listed.error) return listed;
  const rows = Array.isArray(listed.result?.value) ? listed.result.value : [];
  return {
    slot: slotOf(listed.result),
    accounts: rows.slice(0, 5).map((row) => ({
      account: asSolanaAddress(row?.pubkey) || null,
      ...splBalance(row?.account?.data?.parsed?.info),
    })),
    truncated: rows.length > 5,
  };
}

async function executeSolana(name, args, ctx) {
  if (name === 'get_network') {
    const slot = await rpcCall('solana', 'getSlot', [], ctx);
    if (slot.error) return slot;
    const height = await rpcCall('solana', 'getBlockHeight', [], ctx);
    if (height.error) return height;
    const slotNumber = asCount(slot.result);
    const blockHeight = asCount(height.result);
    if (slotNumber === null || blockHeight === null) {
      return fail('The Solana RPC did not return a slot or block height.', { source: 'rpc', chain: 'solana' });
    }
    return { source: 'rpc', chain: 'solana', slot: slotNumber, blockHeight };
  }

  if (name === 'get_native_balance') {
    const address = asSolanaAddress(args.address);
    if (!address) return fail('Address must be a Solana base58 address (32 bytes).', { chain: 'solana' });
    const balance = await rpcCall('solana', 'getBalance', [address], ctx);
    if (balance.error) return balance;
    const lamports = asLamports(balance.result?.value);
    const slot = slotOf(balance.result);
    if (lamports === null || slot === null) {
      return fail('The Solana RPC did not return a balance.', { source: 'rpc', chain: 'solana' });
    }
    return {
      source: 'rpc',
      chain: 'solana',
      slot,
      address,
      nativeSymbol: 'SOL',
      lamports: lamports.toString(),
      balance: formatUnits(lamports, 9),
    };
  }

  if (name === 'is_contract') {
    const address = asSolanaAddress(args.address);
    if (!address) return fail('Address must be a Solana base58 address (32 bytes).', { chain: 'solana' });
    const info = await rpcCall('solana', 'getAccountInfo', [address, { encoding: 'jsonParsed' }], ctx);
    if (info.error) return info;
    const value = info.result?.value;
    if (!value) {
      return {
        source: 'rpc',
        chain: 'solana',
        slot: slotOf(info.result),
        address,
        exists: false,
        executable: false,
        risk: 'no account at this address',
      };
    }
    const executable = value.executable === true;
    return {
      source: 'rpc',
      chain: 'solana',
      slot: slotOf(info.result),
      address,
      exists: true,
      executable,
      owner: asSolanaAddress(value.owner) || null,
      space: asCount(value.space),
      risk: executable ? null : 'account is not an executable program',
    };
  }

  if (name === 'get_transaction') {
    const signature = asSolanaSignature(args.hash);
    if (!signature) return fail('Transaction signature must be a Solana base58 signature (64 bytes).', { chain: 'solana' });
    const tx = await rpcCall('solana', 'getTransaction', [
      signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
    ], ctx);
    if (tx.error) return tx;
    const status = await rpcCall('solana', 'getSignatureStatuses', [
      [signature],
      { searchTransactionHistory: true },
    ], ctx);
    if (status.error) return status;
    const row = tx.result;
    const sig = status.result?.value?.[0] || null;
    if (!row && !sig) {
      return { source: 'rpc', chain: 'solana', signature, status: 'not_found' };
    }
    const err = row?.meta?.err ?? sig?.err ?? null;
    const fee = asLamports(row?.meta?.fee);
    return {
      source: 'rpc',
      chain: 'solana',
      signature,
      status: err ? 'failed' : 'success',
      slot: asCount(row?.slot) || asCount(sig?.slot),
      blockTime: asCount(row?.blockTime),
      confirmationStatus: typeof sig?.confirmationStatus === 'string' ? clipText(sig.confirmationStatus, 40) : null,
      feeLamports: fee === null ? null : fee.toString(),
      fee: fee === null ? null : formatUnits(fee, 9),
      transactionError: err ? clipText(JSON.stringify(err), 180) : null,
    };
  }

  if (name === 'get_tx_history') {
    const address = asSolanaAddress(args.address);
    if (!address) return fail('Address must be a Solana base58 address (32 bytes).', { chain: 'solana' });
    const history = await rpcCall('solana', 'getSignaturesForAddress', [address, { limit: 5 }], ctx);
    if (history.error) return history;
    const rows = Array.isArray(history.result) ? history.result.slice(0, 5) : [];
    return {
      available: true,
      source: 'rpc',
      chain: 'solana',
      address,
      signatures: rows.map((row) => ({
        signature: asSolanaSignature(row?.signature) || null,
        slot: asCount(row?.slot),
        blockTime: asCount(row?.blockTime),
        confirmationStatus: typeof row?.confirmationStatus === 'string' ? clipText(row.confirmationStatus, 40) : null,
        status: row?.err ? 'failed' : 'success',
      })),
    };
  }

  if (name === 'get_token') {
    const token = asSolanaAddress(args.token);
    if (!token) return fail('Token address must be a Solana base58 address (32 bytes).', { chain: 'solana' });
    const holder = args.address == null || args.address === '' ? '' : asSolanaAddress(args.address);
    if (args.address && !holder) return fail('Holder address must be a Solana base58 address (32 bytes).', { chain: 'solana' });
    const info = await rpcCall('solana', 'getAccountInfo', [token, { encoding: 'jsonParsed' }], ctx);
    if (info.error) return info;
    const parsed = info.result?.value?.data?.parsed;
    const isMint = parsed?.type === 'mint';
    if (!isMint) {
      const classic = await solanaTokenAccounts(token, { programId: TOKEN_PROGRAM }, ctx);
      if (classic.error) return classic;
      const next = await solanaTokenAccounts(token, { programId: TOKEN_2022 }, ctx);
      if (next.error) return next;
      return {
        source: 'rpc',
        chain: 'solana',
        slot: classic.slot || next.slot || slotOf(info.result),
        owner: token,
        tokenAccounts: [...classic.accounts, ...next.accounts].slice(0, 5),
        truncated: classic.truncated || next.truncated || classic.accounts.length + next.accounts.length > 5,
        risk: info.result?.value ? null : 'no account at this address',
      };
    }
    const supply = await rpcCall('solana', 'getTokenSupply', [token], ctx);
    if (supply.error) return supply;
    const supplyValue = supply.result?.value || {};
    const amount = typeof supplyValue.amount === 'string' && /^\d+$/.test(supplyValue.amount) ? supplyValue.amount : null;
    const decimals = Number.isInteger(supplyValue.decimals) && supplyValue.decimals >= 0 && supplyValue.decimals <= 36
      ? supplyValue.decimals
      : null;
    const mintDecimals = Number.isInteger(parsed?.info?.decimals) ? parsed.info.decimals : null;
    const risks = [];
    if (amount === null || decimals === null) risks.push('token mint supply or decimals unavailable');
    if (mintDecimals !== null && decimals !== null && mintDecimals !== decimals) {
      risks.push('mint account decimals do not match getTokenSupply');
    }
    const report = {
      source: 'rpc',
      chain: 'solana',
      slot: slotOf(supply.result) || slotOf(info.result),
      mint: token,
      decimals,
      supply: amount,
      supplyUi: amount !== null && decimals !== null ? formatUnits(BigInt(amount), decimals) : null,
      executable: info.result?.value?.executable === true,
      risk: risks.length ? risks : null,
    };
    if (holder) {
      const accounts = await solanaTokenAccounts(holder, { mint: token }, ctx);
      if (accounts.error) return accounts;
      report.holder = holder;
      report.tokenAccounts = accounts.accounts;
      report.truncated = accounts.truncated;
    }
    return report;
  }

  return fail('Unknown lookup.');
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
    return fail('Chain is not allowed. Use ethereum, base, arbitrum, bsc, polygon, or solana.');
  }
  const ctx = { env, fetchImpl, signal, allow: gate };
  if (chain === 'solana') {
    const report = await executeSolana(name, args, ctx);
    if (report?.error) return report;
    return redact(report, env);
  }

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
  const address = asAddress(src.address) || asSolanaAddress(src.address);
  if (address) out.address = address;
  const token = asAddress(src.token) || asSolanaAddress(src.token);
  if (token) out.token = token;
  const hash = asHash(src.hash) || asSolanaSignature(src.hash);
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
