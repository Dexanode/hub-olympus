import { useEffect, useRef, useState } from 'react';

const MAX_CHARS = 2000;

const speakers = {
  owner: { name: 'OWNER', icon: '♜', color: '#f6e2a4' },
  zeus: { name: 'ZEUS', icon: 'ϟ', color: '#f6cf76' },
  athena: { name: 'ATHENA', icon: '◉', color: '#8fe0b0' },
  demeter: { name: 'DEMETER', icon: '❋', color: '#b4e780' },
  aphrodite: { name: 'APHRODITE', icon: '✿', color: '#ffa3c3' },
  hera: { name: 'HERA', icon: '♛', color: '#d4a7ff' },
  ares: { name: 'ARES', icon: '⚔', color: '#ff806f' },
  hades: { name: 'HADES', icon: '⌁', color: '#72f0c1' },
};

function speakerMeta(id) {
  return speakers[id] || { name: String(id || 'GOD').toUpperCase(), icon: '✦', color: '#f6e2a4' };
}

async function readRoomStream(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\n').find((item) => item.startsWith('data:'));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      const event = JSON.parse(payload);
      if (event.error) throw new Error(event.error);
      if (event.delta) onEvent(event);
    }
  }
}

export function useThroneRoom() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [oracle, setOracle] = useState(null);
  const [open, setOpen] = useState(true);
  const abortRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    async function load() {
      try {
        const response = await fetch('/api/health');
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        setOracle({ ...data, offline: false });
        if (!data.ok) timer = window.setTimeout(load, 4000);
      } catch {
        if (cancelled) return;
        setOracle({ ok: false, provider: 'offline' });
        timer = window.setTimeout(load, 4000);
      }
    }
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, []);

  async function send() {
    const text = draft.trim();
    if (!text || status === 'sending') return;
    if (text.length > MAX_CHARS) {
      setError(`Keep the message under ${MAX_CHARS} characters.`);
      return;
    }
    const history = [...messages, { role: 'user', speaker: 'owner', content: text }].slice(-24);
    setMessages(history);
    setDraft('');
    setError('');
    setStatus('sending');
    setOpen(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          messages: history.map(({ role, speaker, content }) => ({ role, speaker, content })),
          stream: true,
        }),
        signal: controller.signal,
      });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || type.includes('application/json')) {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The chat server returned ${response.status}.`);
        const turns = Array.isArray(data.turns) ? data.turns : [];
        setMessages([
          ...history,
          ...turns.map((turn) => ({ role: 'assistant', speaker: turn.speaker, content: turn.content || '' })),
        ]);
      } else {
        await readRoomStream(response, (event) => {
          setMessages((current) => {
            const last = current.at(-1);
            if (last?.pending && last.speaker === event.speaker) {
              const next = current.slice();
              next[next.length - 1] = { ...last, content: last.content + event.delta };
              return next;
            }
            return [...current, { role: 'assistant', speaker: event.speaker, content: event.delta, pending: true }];
          });
        });
        setMessages((current) => current.map((message) => (
          message.pending ? { ...message, pending: false } : message
        )));
      }
      setStatus('idle');
    } catch (reason) {
      if (reason?.name === 'AbortError') return;
      const message = reason?.message || 'The throne room could not answer.';
      const offline = message === 'Failed to fetch' || message.includes('NetworkError');
      setError(offline ? 'Chat server is not running. Start it with npm run dev:api.' : message);
      setMessages((current) => current.filter((message) => message.content || message.role === 'user'));
      setStatus('error');
    }
  }

  return { messages, draft, setDraft, status, error, oracle, send, open, setOpen, maxChars: MAX_CHARS };
}

export default function ThroneRoom() {
  const room = useThroneRoom();
  const logRef = useRef(null);
  const { messages, draft, setDraft, status, error, oracle, send, open, setOpen, maxChars } = room;

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, status, open]);

  const oracleLabel = oracle?.provider === 'mock'
    ? 'MOCK ORACLE'
    : oracle?.provider === 'offline'
      ? 'CHAT SERVER OFFLINE'
      : oracle?.provider === 'unconfigured'
        ? 'NO ORACLE KEY'
        : oracle?.provider
          ? oracle.provider.toUpperCase()
          : 'ORACLE';
  const speaking = status === 'sending' ? messages.at(-1)?.speaker : '';
  const speakingLabel = speaking && speaking !== 'owner'
    ? `${speakerMeta(speaking).name} IS SPEAKING`
    : 'ZEUS IS LISTENING';

  return (
    <section className={`throne-room${open ? ' is-open' : ''}`} aria-label="Throne room">
      <button
        type="button"
        className="throne-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="throne-crest">ϟ</span>
        <b>THRONE ROOM</b>
        <small>{open ? speakingLabel : 'ASK ZEUS'}</small>
        <em>{oracleLabel}</em>
        <i>{open ? '▾' : '▴'}</i>
      </button>
      {open && (
        <div className="throne-body">
          <div className="throne-log" ref={logRef} aria-live="polite">
            {messages.length === 0 && (
              <p className="throne-empty">Ask Zeus. He answers, or calls a god who is online. Offline gods are named, not invented.</p>
            )}
            {messages.map((message, index) => {
              const meta = speakerMeta(message.speaker);
              return (
                <div key={`${message.speaker}-${index}`} className={`throne-line throne-line-${message.speaker}`}>
                  <span className="throne-icon" style={{ color: meta.color }} aria-hidden="true">{meta.icon}</span>
                  <div>
                    <b style={{ color: meta.color }}>{meta.name}</b>
                    <p>{message.content || '…'}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {error && <p className="throne-error" role="alert">{error}</p>}
          <form
            className="throne-form"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <input
              value={draft}
              maxLength={maxChars}
              placeholder="Ask Zeus to route this…"
              aria-label="Message to the throne room"
              disabled={status === 'sending'}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" disabled={status === 'sending' || !draft.trim()}>SEND</button>
          </form>
        </div>
      )}
    </section>
  );
}
