import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env.js';
import { createChatHandler, guardStream, resolveAgentId } from './chat.js';
import { createRoomHandler } from './room.js';
import { describeProvider } from './providers.js';

loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'));

const port = Number(process.env.PORT || 8787);
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const handleChat = createChatHandler();
const handleRoom = createRoomHandler();
const MAX_BODY = 32_000;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim().slice(0, 80);
  return req.socket.remoteAddress || 'unknown';
}

function sendJson(res, status, json) {
  const body = JSON.stringify(json);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const error = new Error('body too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('invalid json');
    error.status = 400;
    throw error;
  }
}

function writeSse(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
}

function serveStatic(req, res) {
  if (process.env.SERVE_STATIC === '0' || !fs.existsSync(path.join(distDir, 'index.html'))) return false;
  const url = new URL(req.url || '/', 'http://localhost');
  const requested = decodeURIComponent(url.pathname);
  const rel = requested === '/' ? 'index.html' : path.normalize(requested).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(distDir, rel);
  if (!file.startsWith(distDir)) {
    sendJson(res, 403, { error: 'Forbidden.' });
    return true;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      const described = describeProvider();
      sendJson(res, described.ok ? 200 : 503, described);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/room') {
      const body = await readBody(req);
      const clientGone = new AbortController();
      req.on('close', () => clientGone.abort());
      const result = await handleRoom({ body, ip: clientIp(req), signal: clientGone.signal });
      if (result.stream) {
        writeSse(res);
        for await (const event of result.stream) {
          if (event.done) res.write('data: [DONE]\n\n');
          else res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        res.end();
        return;
      }
      sendJson(res, result.status, result.json);
      return;
    }
    const chatAgent = resolveAgentId(url.pathname, null);
    if (req.method === 'POST' && (url.pathname === '/api/chat' || chatAgent)) {
      const body = await readBody(req);
      if (chatAgent) body.agent = chatAgent;
      const clientGone = new AbortController();
      req.on('close', () => clientGone.abort());
      const result = await handleChat({ body, ip: clientIp(req), signal: clientGone.signal });
      if (result.stream) {
        writeSse(res);
        const frames = result.framed ? result.stream : guardStream(result.stream);
        for await (const event of frames) {
          if (event.done) res.write('data: [DONE]\n\n');
          else res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        res.end();
        return;
      }
      sendJson(res, result.status, result.json);
      return;
    }
    if (req.method === 'GET' && serveStatic(req, res)) return;
    sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    const status = error.status || 500;
    const message = status === 413
      ? 'That request is too large.'
      : status === 400
        ? 'Send valid JSON.'
        : 'The chat server failed.';
    if (!res.headersSent) sendJson(res, status, { error: message });
    else res.end();
  }
});

server.listen(port, '0.0.0.0', () => {
  const described = describeProvider();
  console.log(`Olympus chat listening on ${port} (${described.provider}${described.model ? ` · ${described.model}` : ''})`);
});
