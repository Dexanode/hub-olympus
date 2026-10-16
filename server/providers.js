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

export function createCompatibleProvider({ name, apiKey, baseUrl, model, fetchImpl = fetch }) {
  const url = completionsUrl(baseUrl);
  return {
    name,
    model,
    async *stream({ system, messages, signal }) {
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            stream: true,
            temperature: 0.4,
            messages: [{ role: 'system', content: system }, ...messages],
          }),
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
      yield* readOpenAIDeltas(response);
    },
  };
}

function mockReply(text, system = '') {
  const indonesian = /[^\u0000-\u007f]/u.test(text) || /\b(saya|aku|kamu|apa|tolong|bagaimana|yang|tidak|bantu)\b/i.test(text);
  if (/You are Demeter/.test(system)) {
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
