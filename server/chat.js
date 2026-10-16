import { personaFor, personas } from './personas.js';
import { ProviderError, resolveProvider } from './providers.js';
import { createChainClient, needsOnchain } from './chain.js';
import { hadesEvents } from './hades.js';

export const MAX_MESSAGE_CHARS = 2000;
export const MAX_MESSAGES = 16;
export const MAX_TOTAL_CHARS = 8000;
const DEFAULT_LIMIT = 20;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 25_000;

export function createRateLimiter({ limit = DEFAULT_LIMIT, windowMs = DEFAULT_WINDOW_MS } = {}) {
  const hits = new Map();
  return function allow(ip, now = Date.now()) {
    const key = ip || 'unknown';
    const recent = (hits.get(key) || []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [name, times] of hits) {
        if (times.every((time) => now - time >= windowMs)) hits.delete(name);
      }
    }
    return true;
  };
}

export function resolveAgentId(pathname, body) {
  const match = String(pathname || '').match(/^\/api\/chat\/([a-z][a-z0-9-]{0,32})$/);
  if (match) return match[1];
  return typeof body?.agent === 'string' ? body.agent : '';
}

export function validateChatBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Send a JSON object with an agent and messages.' };
  }
  const persona = personaFor(body.agent);
  if (!persona) return { error: 'Unknown agent.' };
  if (!persona.enabled) return { error: `${persona.name} is not available for chat yet.` };
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { error: 'Send at least one message.' };
  }
  if (body.messages.length > MAX_MESSAGES) {
    return { error: `Keep the conversation to ${MAX_MESSAGES} messages.` };
  }
  const messages = [];
  let total = 0;
  for (const message of body.messages) {
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) {
      return { error: 'Each message needs a role of user or assistant.' };
    }
    if (typeof message.content !== 'string') return { error: 'Each message needs text content.' };
    const content = message.content.trim();
    if (!content) return { error: 'Messages cannot be empty.' };
    if (content.length > MAX_MESSAGE_CHARS) {
      return { error: `Keep each message under ${MAX_MESSAGE_CHARS} characters.` };
    }
    total += content.length;
    messages.push({ role: message.role, content });
  }
  if (total > MAX_TOTAL_CHARS) return { error: 'That conversation is too long. Start a shorter one.' };
  if (messages.at(-1).role !== 'user') return { error: 'The latest message must be from the owner.' };
  return { persona, messages };
}

async function* withSpeaker(speaker, events) {
  for await (const event of events) {
    if (event.lookup) yield { speaker, lookup: event.lookup };
    else if (event.delta) yield { speaker, delta: event.delta };
  }
}

async function* demeterWithHades({ persona, messages, provider, client, signal }) {
  let hadesText = '';
  for await (const event of hadesEvents({
    provider,
    system: personas.hades.system,
    messages: [{ role: 'user', content: messages.at(-1).content }],
    client,
    signal,
  })) {
    if (event.lookup) yield { speaker: 'hades', lookup: event.lookup };
    if (event.delta) {
      hadesText += event.delta;
      yield { speaker: 'hades', delta: event.delta };
    }
  }
  const quoted = hadesText.trim().slice(0, 4_000);
  const system = `${persona.system}

Hades already looked up the onchain data for the owner's latest question.
Explain his reply in your support tone. Do not add numbers, addresses, or transaction data that he did not state.
If he had no tool result, say the lookup is unavailable and ask for the chain and the address or transaction hash.
Hades said: ${quoted}`;
  for await (const delta of provider.stream({ system, messages, signal })) {
    if (delta) yield { speaker: 'demeter', delta };
  }
}

async function* framedEvents({ persona, messages, provider, client, signal }) {
  try {
    if (persona.id === 'hades') {
      yield* withSpeaker('hades', hadesEvents({
        provider,
        system: persona.system,
        messages,
        client,
        signal,
      }));
    } else {
      yield* demeterWithHades({ persona, messages, provider, client, signal });
    }
    yield { done: true };
  } catch (error) {
    yield { error: errorMessage(error) };
  }
}

async function collectFramed(events, provider) {
  const turns = [];
  const lookups = [];
  for await (const event of events) {
    if (event.error) {
      const status = /too long/i.test(event.error) ? 504 : 502;
      return { status, json: { error: event.error } };
    }
    if (event.done) break;
    if (event.lookup) {
      lookups.push(event.lookup);
      turns.push({ speaker: event.speaker || 'hades', lookup: event.lookup });
      continue;
    }
    if (!event.delta) continue;
    const last = turns.at(-1);
    if (last?.speaker === event.speaker && typeof last.content === 'string') last.content += event.delta;
    else turns.push({ speaker: event.speaker, content: event.delta });
  }
  const reply = [...turns].reverse().find((turn) => turn.content)?.content || '';
  return {
    status: 200,
    json: {
      reply,
      turns,
      lookups,
      provider: provider.name,
      model: provider.model,
    },
  };
}

export function createChatHandler({ env = process.env, fetchImpl = fetch, chainFetch, allow } = {}) {
  const limit = Number(env.CHAT_RATE_LIMIT || DEFAULT_LIMIT);
  const windowMs = Number(env.CHAT_RATE_WINDOW_MS || DEFAULT_WINDOW_MS);
  const timeoutMs = Number(env.CHAT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const rateLimit = allow || createRateLimiter({ limit, windowMs });
  const client = createChainClient({ env, fetchImpl: chainFetch || fetch });

  return async function handleChat({ body, ip, signal, now = Date.now() }) {
    if (!rateLimit(ip, now)) {
      return { status: 429, json: { error: 'Too many messages. Wait a minute and try again.' } };
    }
    const parsed = validateChatBody(body);
    if (parsed.error) {
      const status = parsed.error.includes('not available') ? 403 : 400;
      return { status, json: { error: parsed.error } };
    }
    const provider = resolveProvider(env, fetchImpl);
    if (provider.error) return { status: 503, json: { error: provider.error } };

    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const onchain = parsed.persona.id === 'hades'
      || (parsed.persona.id === 'demeter' && needsOnchain(parsed.messages.at(-1).content));
    if (onchain) {
      const events = framedEvents({
        persona: parsed.persona,
        messages: parsed.messages,
        provider,
        client,
        signal: combined,
      });
      if (body.stream === false) return collectFramed(events, provider);
      return { status: 200, framed: true, stream: events, provider: provider.name, model: provider.model };
    }
    try {
      const stream = provider.stream({
        system: parsed.persona.system,
        messages: parsed.messages,
        signal: combined,
      });
      if (body.stream === false) {
        let reply = '';
        for await (const delta of stream) reply += delta;
        return { status: 200, json: { reply, provider: provider.name, model: provider.model } };
      }
      return { status: 200, provider: provider.name, model: provider.model, stream };
    } catch (error) {
      return { status: errorStatus(error), json: { error: errorMessage(error) } };
    }
  };
}

function errorStatus(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 504;
  if (error instanceof ProviderError) return error.status === 429 ? 429 : (error.status || 502);
  return 502;
}

function errorMessage(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'The reply took too long.';
  if (error instanceof ProviderError) return error.message;
  return 'The chat could not answer just now.';
}

export async function* guardStream(stream) {
  try {
    for await (const delta of stream) {
      if (delta) yield { delta };
    }
    yield { done: true };
  } catch (error) {
    yield { error: errorMessage(error) };
  }
}
