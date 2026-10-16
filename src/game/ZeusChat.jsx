import { useEffect, useRef, useState } from 'react';

const MAX_CHARS = 2000;

async function readChatStream(response, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reply = '';
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
      if (event.delta) {
        reply += event.delta;
        onDelta(reply);
      }
    }
  }
  return reply;
}

export function useZeusChat() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [oracle, setOracle] = useState(null);
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
    const history = [...messages, { role: 'user', content: text }].slice(-16);
    setMessages([...history, { role: 'assistant', content: '' }]);
    setDraft('');
    setError('');
    setStatus('sending');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ agent: 'zeus', messages: history, stream: true }),
        signal: controller.signal,
      });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || type.includes('application/json')) {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `The chat server returned ${response.status}.`);
        setMessages([...history, { role: 'assistant', content: data.reply || '' }]);
      } else {
        await readChatStream(response, (reply) => {
          setMessages([...history, { role: 'assistant', content: reply }]);
        });
      }
      setStatus('idle');
    } catch (reason) {
      if (reason?.name === 'AbortError') return;
      const message = reason?.message || 'Zeus could not answer.';
      const offline = message === 'Failed to fetch' || message.includes('NetworkError');
      setError(offline ? 'Chat server is not running. Start it with npm run dev:api.' : message);
      setMessages((current) => {
        const last = current.at(-1);
        if (last?.role === 'assistant' && !last.content) return current.slice(0, -1);
        return current;
      });
      setStatus('error');
    }
  }

  return { messages, draft, setDraft, status, error, oracle, send, maxChars: MAX_CHARS };
}

export default function ZeusChat({ chat }) {
  const logRef = useRef(null);
  const { messages, draft, setDraft, status, error, oracle, send, maxChars } = chat;

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, status]);

  const oracleLabel = oracle?.provider === 'mock'
    ? 'MOCK ORACLE'
    : oracle?.provider === 'offline'
      ? 'CHAT SERVER OFFLINE'
      : oracle?.provider === 'unconfigured'
        ? 'NO ORACLE KEY'
        : oracle?.provider
          ? oracle.provider.toUpperCase()
          : 'ORACLE';

  return (
    <div className="zeus-chat">
      <div className="zeus-chat-meta">
        <span>{oracleLabel}{oracle?.model ? ` · ${oracle.model}` : ''}</span>
        <span>{status === 'sending' ? 'ZEUS IS SPEAKING' : 'SPEAK WITH ZEUS'}</span>
      </div>
      <div className="zeus-chat-log" ref={logRef} aria-live="polite">
        {messages.length === 0 && (
          <p className="zeus-chat-empty">Ask Zeus for a priority, a decision, or which god should take the work.</p>
        )}
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`zeus-bubble ${message.role}`}>
            <small>{message.role === 'user' ? 'OWNER' : 'ZEUS'}</small>
            {message.content || (status === 'sending' && index === messages.length - 1 ? '…' : '')}
          </div>
        ))}
      </div>
      {error && <p className="zeus-chat-error" role="alert">{error}</p>}
      <form
        className="zeus-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <textarea
          value={draft}
          maxLength={maxChars}
          placeholder="Speak, owner…"
          aria-label="Message to Zeus"
          disabled={status === 'sending'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <button type="submit" disabled={status === 'sending' || !draft.trim()}>SEND</button>
      </form>
      <div className="zeus-chat-meta"><span>{draft.length} / {maxChars}</span><span>ENTER TO SEND</span></div>
    </div>
  );
}
