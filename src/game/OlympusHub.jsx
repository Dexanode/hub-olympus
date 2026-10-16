import { useEffect, useRef, useState } from 'react';
import zeusSprite from '../assets/zeus-pixel.png';
import athenaSprite from '../assets/athena-pixel.png';
import demeterSprite from '../assets/demeter-pixel.png';
import aphroditeSprite from '../assets/aphrodite-pixel.png';
import heraSprite from '../assets/hera-pixel.png';
import aresSprite from '../assets/ares-pixel.png';
import hadesSprite from '../assets/hades-pixel.png';
import { ONLINE_GODS, appendDelta, countUnread, loadHub, saveHub } from './hubState.js';

const MAX_CHARS = 2000;
const sprites = {
  zeus: zeusSprite,
  athena: athenaSprite,
  demeter: demeterSprite,
  aphrodite: aphroditeSprite,
  hera: heraSprite,
  ares: aresSprite,
  hades: hadesSprite,
};

function Avatar({ id, color }) {
  const src = sprites[id];
  return (
    <span className="hub-avatar" style={{ borderColor: color }}>
      {src
        ? <img src={src} alt="" draggable="false" />
        : <b>✦</b>}
    </span>
  );
}

async function readSse(response, onEvent) {
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

export default function OlympusHub({ agents, selectedId, onSelect, mode, onMode, onOpenDomain }) {
  const stored = useRef(null);
  if (!stored.current) stored.current = loadHub();
  const [threads, setThreads] = useState(stored.current.threads);
  const [seen, setSeen] = useState(stored.current.seen);
  const [drafts, setDrafts] = useState({});
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({});
  const [oracle, setOracle] = useState(null);
  const logRef = useRef(null);
  const aborts = useRef({});
  const busy = useRef({});

  const selected = agents.find((agent) => agent.id === selectedId) || agents[0];
  const online = ONLINE_GODS.has(selected?.id);
  const messages = threads[selected?.id] || [];
  const draft = drafts[selected?.id] || '';
  const error = errors[selected?.id] || '';
  const sending = status[selected?.id] === 'sending';

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    async function load() {
      try {
        const response = await fetch('/api/health');
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        setOracle(data);
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
      Object.values(aborts.current).forEach((controller) => controller.abort());
    };
  }, []);

  useEffect(() => {
    if (mode === 'hidden' || !selected?.id) return;
    setSeen((current) => {
      const length = (threads[selected.id] || []).length;
      if (current[selected.id] === length) return current;
      return { ...current, [selected.id]: length };
    });
  }, [mode, selected?.id, threads]);

  useEffect(() => {
    saveHub({ mode, selected: selectedId, threads, seen });
  }, [mode, selectedId, threads, seen]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, sending, selectedId, mode]);

  function choose(id) {
    onSelect(id);
    if (mode === 'hidden') onMode('small');
  }

  async function send() {
    const godId = selected?.id;
    if (!godId || !online || busy.current[godId]) return;
    const text = draft.trim();
    if (!text) return;
    if (text.length > MAX_CHARS) {
      setErrors((current) => ({ ...current, [godId]: `Keep the message under ${MAX_CHARS} characters.` }));
      return;
    }
    busy.current[godId] = true;
    const history = [...(threads[godId] || []), { role: 'user', speaker: 'owner', content: text }].slice(godId === 'zeus' ? -24 : -16);
    setThreads((current) => ({ ...current, [godId]: history }));
    setDrafts((current) => ({ ...current, [godId]: '' }));
    setErrors((current) => ({ ...current, [godId]: '' }));
    setStatus((current) => ({ ...current, [godId]: 'sending' }));
    const controller = new AbortController();
    aborts.current[godId] = controller;
    const throne = godId === 'zeus';
    try {
      const response = await fetch(throne ? '/api/room' : `/api/chat/${godId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(throne
          ? { messages: history.map(({ role, speaker, content }) => ({ role, speaker, content })), stream: true }
          : { messages: history.map(({ role, content }) => ({ role, content })), stream: true }),
        signal: controller.signal,
      });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || type.includes('application/json')) {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The chat server returned ${response.status}.`);
        const turns = throne
          ? (data.turns || []).map((turn) => ({ role: 'assistant', speaker: turn.speaker, content: turn.content || '' }))
          : [{ role: 'assistant', speaker: godId, content: data.reply || '' }];
        setThreads((current) => ({ ...current, [godId]: [...history, ...turns.filter((turn) => turn.content)] }));
      } else {
        await readSse(response, (event) => {
          const speaker = event.speaker || godId;
          setThreads((current) => {
            const result = appendDelta(current[godId] || history, speaker, event.delta);
            return { ...current, [godId]: result.messages };
          });
        });
        setThreads((current) => ({
          ...current,
          [godId]: (current[godId] || []).map((message) => (message.pending ? { ...message, pending: false } : message)),
        }));
      }
      setStatus((current) => ({ ...current, [godId]: 'idle' }));
    } catch (reason) {
      if (reason?.name === 'AbortError') return;
      const message = reason?.message || 'The hub could not answer.';
      const offline = message === 'Failed to fetch' || message.includes('NetworkError');
      setErrors((current) => ({
        ...current,
        [godId]: offline ? 'Chat server is not running. Start it with npm run dev:api.' : message,
      }));
      setThreads((current) => ({
        ...current,
        [godId]: (current[godId] || []).filter((message) => message.content || message.role === 'user'),
      }));
      setStatus((current) => ({ ...current, [godId]: 'error' }));
    } finally {
      busy.current[godId] = false;
    }
  }

  const oracleLabel = oracle?.provider === 'mock'
    ? 'MOCK ORACLE'
    : oracle?.provider === 'offline'
      ? 'CHAT SERVER OFFLINE'
      : oracle?.provider === 'unconfigured'
        ? 'NO ORACLE KEY'
        : oracle?.provider
          ? oracle.provider.toUpperCase()
          : 'ORACLE';
  const job = selected?.role?.split(' · ')[0] || '';

  return (
    <section className={`olympus-hub is-${mode}`} aria-label="Olympus Hub" style={{ '--accent': selected?.color || '#f6cf76' }}>
      <div className="hub-bar">
        <b>OLYMPUS HUB</b>
        <span className="hub-sizes">
          {['small', 'half', 'hidden'].map((size) => (
            <button key={size} type="button" aria-pressed={mode === size} onClick={() => onMode(size)}>{size === 'hidden' ? 'HIDE' : size.toUpperCase()}</button>
          ))}
        </span>
        <em>{oracleLabel}</em>
      </div>
      {mode !== 'hidden' && (
        <div className="hub-body">
          <div className="hub-roster" role="listbox" aria-label="Gods">
            {agents.map((agent) => {
              const thinking = status[agent.id] === 'sending';
              const isOnline = ONLINE_GODS.has(agent.id);
              const badge = countUnread(threads[agent.id], seen[agent.id]);
              const dot = thinking ? 'thinking' : isOnline ? 'online' : 'offline';
              const throne = agent.id === 'zeus';
              return (
                <button
                  key={agent.id}
                  type="button"
                  role="option"
                  aria-selected={agent.id === selected?.id}
                  className={`hub-god${agent.id === selected?.id ? ' is-selected' : ''}${throne ? ' is-throne' : ''}`}
                  style={{ '--agent': agent.color }}
                  onClick={() => choose(agent.id)}
                >
                  <span className="hub-avatar-wrap">
                    <Avatar id={agent.id} color={agent.color} />
                    <i className={`hub-dot ${dot}`} title={thinking ? 'Typing' : isOnline ? 'Online' : 'Coming soon'} />
                    {badge > 0 && <em className="hub-badge">{badge > 9 ? '9+' : badge}</em>}
                  </span>
                  <span className="hub-god-copy">
                    <b>{throne ? 'THRONE ROOM' : agent.name.toUpperCase()}</b>
                    <small>{throne ? 'Zeus routes' : isOnline ? 'Online' : 'Coming soon'}</small>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="hub-chat">
            <header className="hub-chat-head">
              <Avatar id={selected.id} color={selected.color} />
              <div>
                <b>{selected.id === 'zeus' ? 'THRONE ROOM' : selected.name.toUpperCase()}</b>
                <small>{selected.id === 'zeus' ? 'Zeus routes the gods' : job}</small>
              </div>
              <button type="button" onClick={() => onOpenDomain(selected)}>DOMAIN</button>
            </header>
            {online ? (
              <>
                <div className="hub-log" ref={logRef} aria-live="polite">
                  {messages.length === 0 && (
                    <p className="hub-empty">
                      {selected.id === 'zeus'
                        ? 'Ask Zeus. He answers, or calls a god who is online.'
                        : `Ask ${selected.name} about a wallet, a transaction, an account, or a product.`}
                    </p>
                  )}
                  {messages.map((message, index) => {
                    const speakerId = message.speaker === 'owner' ? 'owner' : message.speaker;
                    const speaker = speakerId === 'owner'
                      ? { name: 'OWNER', color: '#f6e2a4' }
                      : (agents.find((agent) => agent.id === speakerId) || selected);
                    const name = speakerId === 'owner' ? 'OWNER' : (speaker.name || speakerId).toUpperCase();
                    return (
                      <div key={`${speakerId}-${index}`} className={`hub-bubble ${message.role}`} style={{ '--accent': speaker.color || selected.color }}>
                        {speakerId === 'owner'
                          ? <span className="hub-avatar hub-owner">♜</span>
                          : <Avatar id={speakerId} color={speaker.color || selected.color} />}
                        <div>
                          <small>{name}</small>
                          <p>{message.content || '…'}</p>
                        </div>
                      </div>
                    );
                  })}
                  {sending && <p className="hub-typing" role="status"><i /><i /><i /><span>TYPING</span></p>}
                </div>
                {error && <p className="hub-error" role="alert">{error}</p>}
                <form className="hub-form" onSubmit={(event) => { event.preventDefault(); send(); }}>
                  <input
                    value={draft}
                    maxLength={MAX_CHARS}
                    placeholder={selected.id === 'zeus' ? 'Ask Zeus to route this…' : `Message ${selected.name}…`}
                    aria-label={`Message ${selected.id === 'zeus' ? 'the throne room' : selected.name}`}
                    disabled={sending}
                    onChange={(event) => setDrafts((current) => ({ ...current, [selected.id]: event.target.value }))}
                  />
                  <button type="submit" disabled={sending || !draft.trim()}>SEND</button>
                </form>
              </>
            ) : (
              <div className="hub-offline">
                <Avatar id={selected.id} color={selected.color} />
                <b>{selected.name}</b>
                <small>{job}</small>
                <p>Not online yet. Coming soon.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
