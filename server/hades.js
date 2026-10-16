import { HADES_TOOLS, clipToolResult, publicArgs } from './chain.js';

export const MAX_TOOL_ROUNDS = 4;
const MAX_CALLS_PER_ROUND = 4;

function parseArgs(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.length > 4_000) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function* textDeltas(content) {
  const text = String(content || '').trim()
    || 'No tool result is available. I will not invent a balance, an address, or a transaction.';
  const parts = text.split(/(\s+)/);
  for (const part of parts) {
    if (part) yield { delta: part };
  }
}

export async function* hadesEvents({ provider, system, messages, client, signal }) {
  const transcript = messages.map((message) => ({ role: message.role, content: message.content }));
  let rounds = 0;
  while (rounds < MAX_TOOL_ROUNDS) {
    const result = await provider.complete({
      system,
      messages: transcript,
      tools: HADES_TOOLS,
      signal,
    });
    const calls = (result.toolCalls || []).filter((call) => call?.name).slice(0, MAX_CALLS_PER_ROUND);
    if (!calls.length) {
      yield* textDeltas(result.content);
      return;
    }
    rounds += 1;
    const assistant = {
      role: 'assistant',
      tool_calls: calls.map((call, index) => ({
        id: String(call.id || `call_${rounds}_${index}`),
        type: 'function',
        function: {
          name: String(call.name),
          arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}),
        },
      })),
    };
    if (result.content) assistant.content = result.content;
    transcript.push(assistant);
    for (const [index, call] of calls.entries()) {
      const args = parseArgs(call.arguments);
      const tool = String(call.name);
      yield { lookup: { tool, args: publicArgs(args) } };
      const output = await client.execute(tool, args, signal);
      transcript.push({
        role: 'tool',
        tool_call_id: assistant.tool_calls[index].id,
        content: clipToolResult(output),
      });
    }
  }
  const finalResult = await provider.complete({
    system: `${system}\nYou have used the lookup limit. Answer only from tool results already in the conversation. Do not request more lookups.`,
    messages: transcript,
    signal,
  });
  yield* textDeltas(finalResult.content);
}
