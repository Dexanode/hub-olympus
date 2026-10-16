import { personas, personaFor } from './personas.js';
import { ProviderError, resolveProvider } from './providers.js';
import { MAX_MESSAGE_CHARS, MAX_TOTAL_CHARS, createRateLimiter } from './chat.js';
import { ONCHAIN_PHRASES, createChainClient, needsOnchain, textIncludesPhrase } from './chain.js';
import { hadesEvents } from './hades.js';

export const MAX_ROOM_MESSAGES = 24;
export const MAX_CONSULTS = 2;
const DEFAULT_LIMIT = 20;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 25_000;

// Lightweight routing. The model does not choose; this list does, so a turn
// never spends more than MAX_CONSULTS persona calls.
const ROUTES = [
  { id: 'athena', phrases: ['liquidity', 'likuiditas', 'impermanent', 'yield', 'apy'] },
  { id: 'demeter', phrases: ['wallet', 'dompet', 'ticket', 'tiket', 'customer support', 'seed phrase', 'private key', 'account', 'akun'] },
  { id: 'aphrodite', phrases: ['applicant', 'hire', 'contributor', 'pekerjaan', 'lamaran', 'lowongan'] },
  { id: 'hera', phrases: ['content calendar', 'social post', 'konten', 'jadwal', 'tweet'] },
  { id: 'ares', phrases: ['bug', 'audit', 'bounty', 'kerentanan', 'vulnerability'] },
  { id: 'hades', phrases: ONCHAIN_PHRASES },
];

export function planDelegation(text, roster = personas) {
  const consult = [];
  const offline = [];
  for (const route of ROUTES) {
    if (!route.phrases.some((phrase) => textIncludesPhrase(text, phrase))) continue;
    const persona = roster[route.id];
    if (!persona || persona.id === 'zeus') continue;
    if (persona.enabled) {
      if (consult.length < MAX_CONSULTS) consult.push(persona);
    } else if (offline.length < MAX_CONSULTS) {
      offline.push(persona);
    }
  }
  if (needsOnchain(text)) {
    const hades = roster.hades;
    const listed = consult.some((persona) => persona.id === 'hades')
      || offline.some((persona) => persona.id === 'hades');
    if (hades && !listed) {
      if (hades.enabled && consult.length < MAX_CONSULTS) consult.push(hades);
      else if (!hades.enabled && offline.length < MAX_CONSULTS) offline.push(hades);
    }
  }
  return { consult, offline };
}

export function validateRoomBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Send a JSON object with messages.' };
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { error: 'Send at least one message.' };
  }
  if (body.messages.length > MAX_ROOM_MESSAGES) {
    return { error: `Keep the throne room to ${MAX_ROOM_MESSAGES} messages.` };
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
    const speaker = typeof message.speaker === 'string' ? message.speaker.trim().toLowerCase() : '';
    if (message.role === 'user') {
      if (speaker && speaker !== 'owner') return { error: 'Only the owner can speak as the user.' };
    } else if (speaker && speaker !== 'zeus' && !personaFor(speaker)) {
      return { error: 'Unknown speaker.' };
    }
    total += content.length;
    messages.push({
      role: message.role,
      content,
      speaker: message.role === 'user' ? 'owner' : (speaker || 'zeus'),
    });
  }
  if (total > MAX_TOTAL_CHARS) return { error: 'That conversation is too long. Start a shorter one.' };
  if (messages.at(-1).role !== 'user') return { error: 'The latest message must be from the owner.' };
  return { messages };
}

function toModelHistory(messages) {
  return messages.map((message) => {
    if (message.role === 'user') return { role: 'user', content: message.content };
    if (message.speaker && message.speaker !== 'zeus') {
      const name = personaFor(message.speaker)?.name || message.speaker;
      return { role: 'assistant', content: `[${name}] ${message.content}` };
    }
    return { role: 'assistant', content: message.content };
  });
}

function summarySystem(consults, offline) {
  const zeus = personas.zeus;
  const lines = [
    zeus.system,
    '',
    'This is the throne-room channel. You already decided who to consult.',
  ];
  if (consults.length) {
    lines.push('Speak after your colleagues. Name each one and keep their warnings. Do not contradict them.');
    for (const turn of consults) lines.push(`${turn.name} said: ${turn.content}`);
  }
  if (offline.length) {
    const names = offline.map((persona) => persona.name).join(', ');
    lines.push(`These agents are not yet online: ${names}. Say that each one is not yet online. Do not invent their answer.`);
  }
  if (!consults.length && !offline.length) {
    lines.push('No other god was needed. Answer the owner yourself.');
  }
  lines.push('Keep the summary under 80 words.');
  return lines.join('\n');
}

function linkSignal(parent, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

function roomError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'The reply took too long.';
  if (error instanceof ProviderError) return error.message;
  return 'The throne room could not answer just now.';
}

export function createRoomHandler({ env = process.env, fetchImpl = fetch, chainFetch, allow, provider: forcedProvider } = {}) {
  const limit = Number(env.CHAT_RATE_LIMIT || DEFAULT_LIMIT);
  const windowMs = Number(env.CHAT_RATE_WINDOW_MS || DEFAULT_WINDOW_MS);
  const timeoutMs = Number(env.CHAT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const rateLimit = allow || createRateLimiter({ limit, windowMs });
  const client = createChainClient({ env, fetchImpl: chainFetch || fetch });

  return async function handleRoom({ body, ip, signal, now = Date.now() }) {
    if (!rateLimit(ip, now)) {
      return { status: 429, json: { error: 'Too many messages. Wait a minute and try again.' } };
    }
    const parsed = validateRoomBody(body);
    if (parsed.error) return { status: 400, json: { error: parsed.error } };
    const provider = forcedProvider || resolveProvider(env, fetchImpl);
    if (provider.error) return { status: 503, json: { error: provider.error } };

    const decision = planDelegation(parsed.messages.at(-1).content);
    const events = speakRoom({
      provider,
      messages: parsed.messages,
      decision,
      signal,
      timeoutMs,
      client,
    });
    if (body.stream === false) {
      const turns = [];
      try {
        for await (const event of events) {
          if (event.error) {
            const status = /too long/i.test(event.error) ? 504 : 502;
            return { status, json: { error: event.error } };
          }
          if (event.done) break;
          if (event.lookup) {
            turns.push({ speaker: event.speaker, lookup: event.lookup });
            continue;
          }
          if (!event.delta) continue;
          const last = turns.at(-1);
          if (last?.speaker === event.speaker && typeof last.content === 'string') last.content += event.delta;
          else turns.push({ speaker: event.speaker, content: event.delta });
        }
      } catch (error) {
        return { status: 502, json: { error: roomError(error) } };
      }
      return {
        status: 200,
        json: {
          turns,
          consult: decision.consult.map((persona) => persona.id),
          offline: decision.offline.map((persona) => persona.id),
          provider: provider.name,
          model: provider.model,
        },
      };
    }
    return { status: 200, stream: events, room: true };
  };
}

async function* speakRoom({ provider, messages, decision, signal, timeoutMs, client }) {
  const question = messages.at(-1).content;
  const consults = [];
  try {
    for (const persona of decision.consult) {
      let content = '';
      if (persona.id === 'hades') {
        for await (const event of hadesEvents({
          provider,
          system: persona.system,
          messages: [{ role: 'user', content: question }],
          client,
          signal: linkSignal(signal, timeoutMs),
        })) {
          if (event.lookup) yield { speaker: 'hades', lookup: event.lookup };
          if (event.delta) {
            content += event.delta;
            yield { speaker: 'hades', delta: event.delta };
          }
        }
      } else {
        for await (const delta of provider.stream({
          system: persona.system,
          messages: [{ role: 'user', content: question }],
          signal: linkSignal(signal, timeoutMs),
        })) {
          if (!delta) continue;
          content += delta;
          yield { speaker: persona.id, delta };
        }
      }
      if (content.trim()) consults.push({ name: persona.name, content });
    }
    let summary = '';
    for await (const delta of provider.stream({
      system: summarySystem(consults, decision.offline),
      messages: toModelHistory(messages),
      signal: linkSignal(signal, timeoutMs),
    })) {
      if (!delta) continue;
      summary += delta;
      yield { speaker: 'zeus', delta };
    }
    if (decision.offline.length && !/not yet online/i.test(summary)) {
      const names = decision.offline.map((persona) => persona.name).join(', ');
      yield { speaker: 'zeus', delta: `\n${names} is not yet online.` };
    }
    yield { done: true };
  } catch (error) {
    yield { error: roomError(error) };
  }
}
