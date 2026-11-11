// @ts-nocheck
// Runs the whole test suite: pure simulation tests, then the website + game server end to end.
// The two servers are started here with a throw-away data folder (a JSON file instead of Postgres).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_PORT = Number(process.env.TEST_APP_PORT) || 3100;
const GAME_PORT = Number(process.env.TEST_GAME_PORT) || 3101;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-test-'));
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(file: string, env: NodeJS.ProcessEnv = {}) {
  const r = spawnSync(npx, ['tsx', file], { stdio: 'inherit', env: { ...process.env, ...env }, shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(file + ' failed');
}

const procs: ChildProcess[] = [];
function stop() { for (const p of procs) { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']); else p.kill('SIGTERM'); } catch { /* gone */ } } }
process.on('exit', stop);

async function waitUp(url: string, ms = 120_000) {
  const t0 = Date.now();
  for (;;) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* not yet */ }
    if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + url);
    await new Promise((r) => setTimeout(r, 400));
  }
}

try {
  run('scripts/smoke.ts');
  run('scripts/smoke2.ts');

  const env = {
    ...process.env, DATA_DIR: dataDir, DATABASE_URL: '', SESSION_SECRET: 'test-secret-test-secret-test-secret',
    GAME_SERVER_URL: `http://localhost:${GAME_PORT}`, NODE_ENV: 'development',
  };
  procs.push(spawn(npx, ['tsx', 'game-server/index.ts'], { env: { ...env, PORT: String(GAME_PORT) }, stdio: 'inherit', shell: process.platform === 'win32' }));
  procs.push(spawn(npx, ['next', 'dev', '-p', String(APP_PORT)], { env, stdio: 'ignore', shell: process.platform === 'win32' }));
  await waitUp(`http://localhost:${GAME_PORT}/health`);
  await waitUp(`http://localhost:${APP_PORT}/api/info`);
  run('scripts/integration.ts', { APP_URL: `http://localhost:${APP_PORT}`, DATA_DIR: dataDir });
  console.log('all tests passed');
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(process.exitCode || 0);
}
