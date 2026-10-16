export const HUB_KEY = 'olympus-hub-v1';
export const HUB_MODES = ['small', 'half', 'hidden'];
export const ONLINE_GODS = new Set(['zeus', 'demeter', 'hades']);
export const MAX_STORED = 24;

export function emptyHub() {
  return { mode: 'small', selected: 'zeus', threads: {}, seen: {} };
}

export function sanitizeHub(raw) {
  const base = emptyHub();
  if (!raw || typeof raw !== 'object') return base;
  const mode = HUB_MODES.includes(raw.mode) ? raw.mode : base.mode;
  const selected = typeof raw.selected === 'string' && raw.selected ? raw.selected : base.selected;
  const threads = {};
  if (raw.threads && typeof raw.threads === 'object') {
    for (const [id, list] of Object.entries(raw.threads)) {
      if (!Array.isArray(list)) continue;
      const messages = [];
      for (const message of list) {
        if (!message) continue;
        const speaker = typeof message.speaker === 'string' && message.speaker
          ? message.speaker
          : (message.role === 'user' ? 'owner' : id);
        if (message.role === 'lookup' && message.lookup && typeof message.lookup.tool === 'string') {
          const tool = message.lookup.tool.trim();
          if (!/^[a-z0-9_]{1,40}$/.test(tool)) continue;
          const args = {};
          const rawArgs = message.lookup.args;
          if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
            for (const key of ['chain', 'address', 'token', 'hash']) {
              if (typeof rawArgs[key] === 'string' && rawArgs[key].trim()) args[key] = rawArgs[key].trim().slice(0, 80);
            }
          }
          messages.push({ role: 'lookup', speaker, lookup: { tool, args } });
          continue;
        }
        if (message.role !== 'user' && message.role !== 'assistant') continue;
        if (typeof message.content !== 'string' || !message.content.trim()) continue;
        messages.push({
          role: message.role,
          speaker,
          content: message.content.trim(),
        });
      }
      if (messages.length) threads[id] = messages.slice(-MAX_STORED);
    }
  }
  const seen = {};
  for (const [id, list] of Object.entries(threads)) {
    const stored = Number(raw.seen?.[id]);
    seen[id] = Number.isFinite(stored)
      ? Math.min(list.length, Math.max(0, Math.floor(stored)))
      : list.length;
  }
  return { mode, selected, threads, seen };
}

export function loadHub(storage = globalThis.localStorage) {
  if (!storage) return emptyHub();
  try {
    return sanitizeHub(JSON.parse(storage.getItem(HUB_KEY) || 'null'));
  } catch {
    return emptyHub();
  }
}

export function saveHub(state, storage = globalThis.localStorage) {
  if (!storage) return;
  storage.setItem(HUB_KEY, JSON.stringify(sanitizeHub(state)));
}

export function appendDelta(messages, speaker, delta) {
  const list = messages || [];
  const last = list.at(-1);
  if (last?.pending && last.speaker === speaker) {
    const next = list.slice();
    next[next.length - 1] = { ...last, content: last.content + delta };
    return { messages: next, created: false };
  }
  return {
    messages: [...list, { role: 'assistant', speaker, content: delta, pending: true }],
    created: true,
  };
}

export function formatLookup(lookup) {
  const tool = typeof lookup?.tool === 'string' ? lookup.tool : 'lookup';
  const args = lookup?.args && typeof lookup.args === 'object' ? lookup.args : {};
  const parts = ['chain', 'address', 'token', 'hash']
    .filter((key) => typeof args[key] === 'string' && args[key])
    .map((key) => `${key}=${args[key]}`);
  return `onchain lookup · ${tool}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
}

export function countUnread(messages, seen) {
  const list = messages || [];
  const start = Number.isFinite(seen) ? seen : list.length;
  return list.slice(start).filter((message) => message.role === 'assistant' && message.content && !message.pending).length;
}
