import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const api = spawn(process.execPath, ['server/index.js'], {
  stdio: 'inherit',
  env: process.env,
});
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const web = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

function stop() {
  if (!api.killed) api.kill('SIGTERM');
  if (!web.killed) web.kill('SIGTERM');
}

process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('SIGTERM', () => { stop(); process.exit(0); });
web.on('exit', (code) => {
  if (!api.killed) api.kill('SIGTERM');
  process.exit(code ?? 0);
});
api.on('exit', (code) => {
  if (code && code !== 0) console.error(`Chat server exited with ${code}`);
});
