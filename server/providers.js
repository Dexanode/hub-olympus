const DEFAULTS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
};

export class ProviderError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

export function completionsUrl(baseUrl) {
  const trimmed = String(baseUrl || '').replace(/\/$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

function safeProviderMessage(status) {
  if (status === 401 || status === 403) return 'The language-model key was rejected.';
  if (status === 429) return 'The language model is busy. Try again in a moment.';
  if (status >= 500) return 'The language model failed. Try again.';
  return 'The language model rejected the request.';
}

export async function* readOpenAIDeltas(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') return;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error?.message) throw new ProviderError(502, safeProviderMessage(502));
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}

async function postCompletion({ url, apiKey, body, fetchImpl, signal }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new ProviderError(504, 'The reply took too long.');
    }
    throw new ProviderError(502, 'The language model could not be reached.');
  }
  if (!response.ok) {
    await response.text().catch(() => '');
    throw new ProviderError(response.status >= 500 ? 502 : response.status, safeProviderMessage(response.status));
  }
  return response;
}

export function createCompatibleProvider({ name, apiKey, baseUrl, model, fetchImpl = fetch }) {
  const url = completionsUrl(baseUrl);
  return {
    name,
    model,
    async *stream({ system, messages, signal }) {
      const response = await postCompletion({
        url,
        apiKey,
        fetchImpl,
        signal,
        body: {
          model,
          stream: true,
          temperature: 0.4,
          messages: [{ role: 'system', content: system }, ...messages],
        },
      });
      yield* readOpenAIDeltas(response);
    },
    async complete({ system, messages, tools, signal }) {
      const body = {
        model,
        stream: false,
        temperature: tools?.length ? 0.2 : 0.4,
        messages: [{ role: 'system', content: system }, ...messages],
      };
      if (tools?.length) body.tools = tools;
      const response = await postCompletion({ url, apiKey, body, fetchImpl, signal });
      const text = await response.text();
      if (text.length > 1_000_000) throw new ProviderError(502, 'The language model rejected the request.');
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ProviderError(502, 'The language model rejected the request.');
      }
      if (json.error?.message) throw new ProviderError(502, safeProviderMessage(502));
      const message = json.choices?.[0]?.message || {};
      const toolCalls = [];
      for (const call of (message.tool_calls || []).slice(0, 4)) {
        const toolName = call?.function?.name;
        if (typeof toolName !== 'string' || !toolName) continue;
        let args = call.function?.arguments;
        if (args && typeof args !== 'string') args = JSON.stringify(args);
        if (typeof args === 'string' && args.length > 4_000) args = '{}';
        toolCalls.push({
          id: String(call.id || `call_${toolCalls.length}`),
          name: toolName,
          arguments: typeof args === 'string' ? args : '{}',
        });
      }
      return {
        content: typeof message.content === 'string' ? message.content : '',
        toolCalls,
      };
    },
  };
}

function mockHadesCall(messages) {
  const last = [...(messages || [])].reverse().find((message) => message.role === 'user');
  const text = last?.content || '';
  const chain = /\bbase\b/i.test(text) ? 'base'
    : /\barbitrum\b|\barb\b/i.test(text) ? 'arbitrum'
      : /\bbsc\b|\bbnb\b/i.test(text) ? 'bsc'
        : /\bpolygon\b|\bmatic\b/i.test(text) ? 'polygon'
          : 'ethereum';
  const hash = text.match(/0x[a-fA-F0-9]{64}/);
  const addresses = text.match(/0x[a-fA-F0-9]{40}/g) || [];
  if (hash) return { id: 'call_tx', name: 'get_transaction', arguments: JSON.stringify({ chain, hash: hash[0] }) };
  if (/\b(gas price|harga gas|block number|nomor blok)\b/i.test(text)) {
    return { id: 'call_net', name: 'get_network', arguments: JSON.stringify({ chain }) };
  }
  if (addresses.length && /\b(token|erc-?20)\b/i.test(text)) {
    const args = { chain, token: addresses[0] };
    if (addresses[1]) args.address = addresses[1];
    return { id: 'call_token', name: 'get_token', arguments: JSON.stringify(args) };
  }
  if (addresses.length && /\b(history|riwayat)\b/i.test(text)) {
    return { id: 'call_hist', name: 'get_tx_history', arguments: JSON.stringify({ chain, address: addresses[0] }) };
  }
  if (addresses.length && /\b(contract|kontrak)\b/i.test(text)) {
    return { id: 'call_code', name: 'is_contract', arguments: JSON.stringify({ chain, address: addresses[0] }) };
  }
  if (addresses.length) {
    return { id: 'call_bal', name: 'get_native_balance', arguments: JSON.stringify({ chain, address: addresses[0] }) };
  }
  return null;
}

function mockReply(text, system = '') {
  const indonesian = /[^\u0000-\u007f]/u.test(text) || /\b(saya|aku|kamu|apa|tolong|bagaimana|yang|tidak|bantu)\b/i.test(text);
  if (/You are Demeter/.test(system)) {
    if (/Hades said:/.test(system)) {
      return indonesian
        ? 'Aku Demeter. Hades sudah memeriksa data onchain di atas. Aku tidak menambah angka di luar hasil itu. Jangan kirim seed phrase atau private key.'
        : 'I am Demeter. Hades checked the onchain data above. I will not add numbers beyond that result. Do not send a seed phrase or private key.';
    }
    return indonesian
      ? 'Aku Demeter. Ceritakan langkah yang sudah kamu coba. Jangan kirim seed phrase atau private key.'
      : 'I am Demeter. Tell me the step you already tried. Do not send a seed phrase or private key.';
  }
  if (/throne-room channel/.test(system)) {
    const offline = system.match(/These agents are not yet online: ([^\n.]+)/);
    const offlineNote = offline
      ? (indonesian
        ? ` ${offline[1]} belum online.`
        : ` ${offline[1]} is not yet online.`)
      : '';
    const consulted = [...system.matchAll(/\n([A-Z][a-z]+) said:/g)].map((match) => match[1]);
    if (consulted.length) {
      const names = consulted.join(', ');
      return indonesian
        ? `Pemilik, aku bertanya pada ${names}. Jangan kirim seed phrase atau private key.${offlineNote}`
        : `Owner, I asked ${names}. Do not send a seed phrase or private key.${offlineNote}`;
    }
    if (offline) {
      return indonesian
        ? `Pemilik, ${offline[1]} belum online. Aku tidak mengarang jawabannya.`
        : `Owner, ${offline[1]} is not yet online. I will not invent their answer.`;
    }
  }
  if (indonesian) {
    return 'Pemilik, aku mendengar. Aku yang menetapkan prioritasnya, lalu aku serahkan ke dewa yang tepat. Aku tidak punya angka langsung untuk itu.';
  }
  return 'Owner, I hear you. I will set the priority and hand the work to the right god. I do not have a live figure for that.';
}

export function createMockProvider(env = {}) {
  const delay = Number(env.MOCK_STREAM_DELAY_MS || 0);
  return {
    name: 'mock',
    model: 'mock',
    async *stream({ system, messages, signal }) {
      const last = [...messages].reverse().find((message) => message.role === 'user');
      const reply = mockReply(last?.content || '', system);
      const parts = reply.split(/(\s+)/);
      for (const part of parts) {
        if (signal?.aborted) throw new ProviderError(504, 'The reply took too long.');
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        yield part;
      }
    },
    async complete({ system, messages, tools }) {
      const toolMsgs = (messages || []).filter((message) => message.role === 'tool');
      if (/You are Hades/.test(system || '')) {
        if (toolMsgs.length) {
          return { content: `Cited tool result: ${toolMsgs.map((message) => message.content).join(' | ')}`, toolCalls: [] };
        }
        if (tools?.length) {
          const call = mockHadesCall(messages);
          if (call) return { content: '', toolCalls: [call] };
        }
        return {
          content: 'No tool result is available. I will not invent a balance, an address, or a transaction.',
          toolCalls: [],
        };
      }
      const last = [...(messages || [])].reverse().find((message) => message.role === 'user');
      return { content: mockReply(last?.content || '', system), toolCalls: [] };
    },
  };
}

export function resolveProvider(env = process.env, fetchImpl = fetch) {
  const choice = String(env.LLM_PROVIDER || '').trim().toLowerCase();
  const openAiKey = String(env.OPENAI_API_KEY || '').trim();
  const deepSeekKey = String(env.DEEPSEEK_API_KEY || '').trim();

  if (choice === 'mock') return createMockProvider(env);
  if (choice && choice !== 'openai' && choice !== 'deepseek') {
    return { error: `Unknown LLM_PROVIDER "${choice}". Use openai, deepseek, or mock.` };
  }

  const wantOpenAI = choice === 'openai' || (!choice && openAiKey);
  const wantDeepSeek = choice === 'deepseek' || (!choice && !openAiKey && deepSeekKey);

  if (wantOpenAI) {
    if (!openAiKey) return { error: 'OPENAI_API_KEY is not set on the server.' };
    return createCompatibleProvider({
      name: 'openai',
      apiKey: openAiKey,
      baseUrl: env.OPENAI_BASE_URL || DEFAULTS.openai.baseUrl,
      model: env.OPENAI_MODEL || DEFAULTS.openai.model,
      fetchImpl,
    });
  }
  if (wantDeepSeek) {
    if (!deepSeekKey) return { error: 'DEEPSEEK_API_KEY is not set on the server.' };
    return createCompatibleProvider({
      name: 'deepseek',
      apiKey: deepSeekKey,
      baseUrl: env.DEEPSEEK_BASE_URL || DEFAULTS.deepseek.baseUrl,
      model: env.DEEPSEEK_MODEL || DEFAULTS.deepseek.model,
      fetchImpl,
    });
  }
  return {
    error: 'No language-model key is configured. Set OPENAI_API_KEY or DEEPSEEK_API_KEY on the server.',
  };
}

export function describeProvider(env = process.env) {
  const provider = resolveProvider(env, () => {
    throw new Error('health check must not call the model');
  });
  if (provider.error) return { ok: false, provider: 'unconfigured', model: null, error: provider.error };
  return { ok: true, provider: provider.name, model: provider.model };
}
