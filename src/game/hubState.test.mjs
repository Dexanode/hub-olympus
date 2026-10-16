import assert from 'node:assert/strict';
import test from 'node:test';
import { appendDelta, countUnread, sanitizeHub } from './hubState.js';

test('stored threads drop empty rows and cap the length', () => {
  const long = Array.from({ length: 30 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    speaker: index % 2 ? 'demeter' : 'owner',
    content: `line ${index}`,
  }));
  const hub = sanitizeHub({
    mode: 'nope',
    selected: 'demeter',
    threads: {
      demeter: [...long, { role: 'assistant', content: '   ' }, { role: 'system', content: 'ignore' }],
      zeus: [{ role: 'user', content: 'Hello' }],
    },
  });
  assert.equal(hub.mode, 'small');
  assert.equal(hub.selected, 'demeter');
  assert.equal(hub.threads.demeter.length, 24);
  assert.equal(hub.threads.demeter[0].content, 'line 6');
  assert.equal(hub.threads.zeus[0].speaker, 'owner');
  assert.equal(hub.seen.demeter, 24);
});

test('unread counts finished replies the owner has not seen', () => {
  const messages = [
    { role: 'user', speaker: 'owner', content: 'Hi' },
    { role: 'assistant', speaker: 'demeter', content: 'Hello' },
    { role: 'assistant', speaker: 'zeus', content: '', pending: true },
  ];
  assert.equal(countUnread(messages, 0), 1);
  assert.equal(countUnread(messages, 2), 0);
  const done = messages.map((message) => ({ ...message, pending: false, content: message.content || 'done' }));
  assert.equal(countUnread(done, 2), 1);
});

test('streaming appends to the same speaker bubble', () => {
  const first = appendDelta([], 'demeter', 'I am');
  assert.equal(first.created, true);
  const second = appendDelta(first.messages, 'demeter', ' Demeter');
  assert.equal(second.created, false);
  assert.equal(second.messages.length, 1);
  assert.equal(second.messages[0].content, 'I am Demeter');
  const next = appendDelta(second.messages, 'zeus', 'Owner');
  assert.equal(next.created, true);
  assert.equal(next.messages.length, 2);
});
