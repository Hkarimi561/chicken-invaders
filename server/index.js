import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createState, addPlayer, removePlayer, setInput, step, emptyInput, W, H } from '../shared/sim.js';
import { buyItem, equipItem, loadoutOf, sanitizeProfile, defaultProfile } from '../shared/catalog.js';
import { EVENTS, activeEvent } from '../shared/events.js';

const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = 4;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '..', 'dist');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'profiles.json');
const ID_RE = /^[a-f0-9]{24}$/;
// The running seasonal event (decides when limited-time shop skins can be bought). EVENT_OVERRIDE=halloween forces one.
const serverEvent = () => (EVENTS[process.env.EVENT_OVERRIDE] ? process.env.EVENT_OVERRIDE : activeEvent(new Date()));

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

// ---------- persistent profiles (the "global" account: keys, unlocks, loadout) ----------
const profiles = new Map();
try {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  for (const [id, p] of Object.entries(raw)) if (ID_RE.test(id)) profiles.set(id, sanitizeProfile(p));
  console.log(`Loaded ${profiles.size} profile(s) from ${FILE}`);
} catch { /* first run */ }

let saveTimer = null;
function writeNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(profiles)));
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error('Could not save profiles:', e.message); }
}
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; writeNow(); }, 300);
}
process.on('exit', () => { if (saveTimer) writeNow(); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));

const newProfile = () => {
  const id = crypto.randomBytes(12).toString('hex');
  const p = defaultProfile();
  profiles.set(id, p);
  save();
  return { id, p };
};

// Single-player runs: the server issues a run id at the start and caps how many keys a run can claim,
// based on elapsed time and wave. (Single-player simulation runs in the browser, so this is a sanity
// limit, not a guarantee. Multiplayer keys are counted by the server's own simulation.)
const runs = new Map();
const KEY_RATE_SECONDS = 4;

function creditPending(profile, keys, wave) {
  const k = Math.max(0, Math.floor(keys));
  profile.pending += k;
  profile.stats.runs += 1;
  profile.stats.totalKeys += k;
  profile.stats.bestWave = Math.max(profile.stats.bestWave, Math.max(0, Math.floor(wave)));
  save();
}

// ---------- HTTP ----------
const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(dist));
app.get('/api/info', (_req, res) => res.json({ port: PORT, addresses: lanAddresses(), event: serverEvent() }));

const hits = new Map(); // tiny per-IP rate limit for the mutating API
app.use('/api', (req, res, next) => {
  if (req.method !== 'POST') return next();
  const now = Date.now(), k = req.ip, h = (hits.get(k) || []).filter((t) => now - t < 60000);
  if (h.length >= 240) return res.status(429).json({ error: 'Slow down' });
  h.push(now); hits.set(k, h);
  next();
});

const fail = (res, code, error) => res.status(code).json({ error });
const withProfile = (req, res) => {
  const id = String(req.body?.id ?? req.params?.id ?? '');
  const p = ID_RE.test(id) ? profiles.get(id) : null;
  if (!p) { fail(res, 404, 'Unknown profile'); return null; }
  return { id, p };
};

app.post('/api/profile', (req, res) => {
  const id = String(req.body?.id || '');
  if (ID_RE.test(id) && profiles.has(id)) return res.json({ id, profile: profiles.get(id) });
  const { id: nid, p } = newProfile();
  res.json({ id: nid, profile: p });
});
app.get('/api/profile/:id', (req, res) => {
  const w = withProfile(req, res);
  if (w) res.json({ id: w.id, profile: w.p });
});
app.post('/api/buy', (req, res) => {
  const w = withProfile(req, res); if (!w) return;
  const r = buyItem(w.p, req.body?.item, { event: serverEvent() });
  if (!r.ok) return fail(res, 400, r.error);
  save(); res.json({ profile: w.p });
});
app.post('/api/equip', (req, res) => {
  const w = withProfile(req, res); if (!w) return;
  const r = equipItem(w.p, String(req.body?.slot), req.body?.value ?? null);
  if (!r.ok) return fail(res, 400, r.error);
  save(); res.json({ profile: w.p });
});
app.post('/api/claim', (req, res) => {
  const w = withProfile(req, res); if (!w) return;
  const n = w.p.pending;
  w.p.keys += n; w.p.pending = 0;
  save(); res.json({ profile: w.p, claimed: n });
});
app.post('/api/run/start', (req, res) => {
  const w = withProfile(req, res); if (!w) return;
  const now = Date.now();
  for (const [k, r] of runs) if (now - r.start > 6 * 3600 * 1000) runs.delete(k);
  const runId = crypto.randomBytes(8).toString('hex');
  runs.set(runId, { pid: w.id, start: now, done: false });
  res.json({ runId });
});
app.post('/api/run/end', (req, res) => {
  const w = withProfile(req, res); if (!w) return;
  const run = runs.get(String(req.body?.runId || ''));
  if (!run || run.pid !== w.id || run.done) return fail(res, 400, 'Run already submitted or unknown');
  run.done = true;
  const elapsed = (Date.now() - run.start) / 1000;
  const wave = Math.min(999, Math.max(0, Math.floor(Number(req.body?.wave) || 0)));
  const reported = Math.max(0, Math.floor(Number(req.body?.keys) || 0));
  const cap = Math.min(3 + Math.ceil(elapsed / KEY_RATE_SECONDS), 5 + wave * 6);
  const credited = Math.min(reported, cap);
  creditPending(w.p, credited, wave);
  res.json({ profile: w.p, credited });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map();
let nextId = 1;

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const genCode = () => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
};
const clientLoadout = (ws) => loadoutOf(ws.profileId ? profiles.get(ws.profileId) : null);

function roomInfo(room, ws) {
  return {
    t: 'room', code: room.code, you: ws.pid, host: room.host, phase: room.phase,
    players: [...room.clients].map((c) => ({ id: c.pid, name: c.pname, color: clientLoadout(c).color })),
  };
}
function broadcastRoom(room) { for (const c of room.clients) send(c, roomInfo(room, c)); }

// Keys collected by a multiplayer pilot are counted by the server's own simulation and credited to their profile.
function creditPlayer(ws, room) {
  const p = room.state?.players[ws.pid];
  const prof = ws.profileId && profiles.get(ws.profileId);
  if (!p || !prof) return;
  const fresh = Math.max(0, (p.keys || 0) - (ws.creditedKeys || 0));
  ws.creditedKeys = p.keys || 0;
  if (fresh > 0 || !ws.runCounted) { creditPending(prof, fresh, room.state.wave); ws.runCounted = true; }
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  creditPlayer(ws, room);
  room.clients.delete(ws);
  if (room.state) removePlayer(room.state, ws.pid);
  ws.room = null;
  if (room.clients.size === 0) { rooms.delete(room.code); return; }
  if (room.host === ws.pid) room.host = [...room.clients][0].pid;
  broadcastRoom(room);
}

function startGame(room) {
  room.state = createState();
  room.overHandled = false;
  for (const c of room.clients) {
    c.creditedKeys = 0; c.runCounted = false;
    addPlayer(room.state, c.pid, c.pname, clientLoadout(c));
  }
  room.phase = 'playing';
  for (const c of room.clients) send(c, { t: 'state', s: room.state });
  broadcastRoom(room);
}

// Snapshots are serialised once per tick (not once per client) with positions rounded to 0.01.
const round2 = (_k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v);

const num = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(v, Math.max(W, H))) : null);

wss.on('connection', (ws) => {
  ws.pid = 'p' + nextId++;
  ws.pname = 'Pilot';
  ws.room = null;
  ws.profileId = null;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'ping') return send(ws, { t: 'pong', ts: m.ts });
    if (m.t === 'join') {
      leave(ws);
      ws.pname = String(m.name || 'Pilot').slice(0, 14);
      ws.profileId = ID_RE.test(String(m.pid || '')) && profiles.has(m.pid) ? m.pid : null;
      let room;
      if (m.create) {
        room = { code: genCode(), host: ws.pid, phase: 'lobby', state: null, clients: new Set(), tick: 0 };
        rooms.set(room.code, room);
      } else {
        room = rooms.get(String(m.room || '').toUpperCase().trim());
        if (!room) return send(ws, { t: 'error', msg: 'Room not found' });
        if (room.clients.size >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'Room is full' });
      }
      room.clients.add(ws);
      ws.room = room;
      if (room.state) { addPlayer(room.state, ws.pid, ws.pname, clientLoadout(ws)); ws.creditedKeys = 0; ws.runCounted = false; } // late join
      if (room.state) send(ws, { t: 'state', s: room.state });
      broadcastRoom(room);
    } else if (ws.room) {
      const room = ws.room;
      if (m.t === 'input' && room.state && m.input) {
        const i = m.input;
        setInput(room.state, ws.pid, { ...emptyInput(), left: +!!i.left, right: +!!i.right, up: +!!i.up, down: +!!i.down, fire: +!!i.fire, tx: num(i.tx), ty: num(i.ty) });
      } else if (m.t === 'start' && room.host === ws.pid && room.phase === 'lobby') {
        startGame(room);
      } else if (m.t === 'restart' && room.host === ws.pid && room.state?.over) {
        startGame(room);
      } else if (m.t === 'rtt' && room.state) {
        const p = room.state.players[ws.pid]; // each pilot's measured latency, shown in everyone's HUD
        if (p) p.ping = Math.max(0, Math.min(999, Math.round(Number(m.ms) || 0)));
      } else if (m.t === 'leave') {
        leave(ws);
      }
    }
  });
  ws.on('close', () => leave(ws));
});

// 60Hz simulation, 30Hz snapshots
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.phase !== 'playing' || !room.state) continue;
    step(room.state, 1 / 60);
    if (room.state.over && !room.overHandled) { // run finished: credit everyone's keys
      room.overHandled = true;
      for (const c of room.clients) creditPlayer(c, room);
    }
    if (++room.tick % 2 === 0) {
      const msg = JSON.stringify({ t: 'state', s: room.state }, round2);
      for (const c of room.clients) if (c.readyState === 1) c.send(msg);
    }
  }
}, 1000 / 60);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Chicken Blasters server on port ${PORT}`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const a of lanAddresses()) console.log(`  Network: http://${a}:${PORT}`);
});
