// Multiplayer game server: rooms, the authoritative 60 Hz simulation, spectators and reconnects.
// It runs as its own long-lived Node process (WebSockets need one, so it cannot live on Vercel's serverless
// functions). It trusts a short-lived token minted by the website, and reads/writes the same database.
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { createState, addPlayer, removePlayer, setInput, step, emptyInput, W, H, MUT_IDS, ROLE_IDS } from '../shared/sim';
import { loadoutOf } from '../shared/catalog';
import { EVENTS, activeEvent } from '../shared/events';
import { recordRun, cleanName } from '../shared/leaderboard';
import { applyRun } from '../shared/progress';
import { verifyToken } from '../lib/auth';
import { getStore } from '../lib/store';

type Conn = WebSocket & Record<string, any>;

const PORT = Number(process.env.PORT) || 3001;
const MAX_SPECTATORS = 8;
const GRACE_MS = 30000; // how long a dropped player keeps their seat
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || ''; // e.g. https://your-game.vercel.app (empty = any, for local use)
// The running seasonal event (decides the event boss costume). EVENT_OVERRIDE=halloween forces one.
const serverEvent = () => (EVENTS[process.env.EVENT_OVERRIDE as string] ? (process.env.EVENT_OVERRIDE as string) : activeEvent(new Date()));
const cleanMut = (list: unknown) => [...new Set((Array.isArray(list) ? list : []).filter((id) => MUT_IDS.includes(id)))] as string[];
const logErr = (what: string) => (e: unknown) => console.error(what + ':', (e as Error)?.message || e);

// ---------- HTTP (health + public room list) ----------
const cors = (res: http.ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN || '*');
  res.setHeader('Vary', 'Origin');
};
const server = http.createServer((req, res) => {
  cors(res);
  const url = new URL(req.url || '/', 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '600' }); return res.end(); }
  if (url.pathname === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (url.pathname === '/rooms') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({
      rooms: [...rooms.values()].filter((r) => r.settings.public).map((r) => ({
        code: r.code, name: r.settings.name, players: r.clients.size + r.held.size, max: r.settings.max, phase: r.phase,
        mut: r.settings.mut, wave: r.state ? r.state.wave : 0, locked: !!r.settings.password, spectators: r.specs.size,
      })).sort((a, b) => b.players - a.players),
    }));
  }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

server.on('upgrade', async (req, socket, head) => {
  try {
    const url = new URL(req.url || '/', 'http://x');
    if (url.pathname !== '/ws') throw new Error('path');
    if (ALLOWED_ORIGIN && req.headers.origin !== ALLOWED_ORIGIN) throw new Error('origin');
    const session = await verifyToken(url.searchParams.get('token'), 'game');
    if (!session) throw new Error('token');
    wss.handleUpgrade(req, socket, head, (ws) => {
      (ws as Conn).session = session;
      wss.emit('connection', ws, req);
    });
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
  }
});

// ---------- rooms ----------
const rooms = new Map<string, any>();
let nextId = 1;

const send = (ws: any, msg: any) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const genCode = () => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
};
const clientLoadout = (ws: Conn) => ({ ...loadoutOf(ws.profile || null), role: ws.role });

const cleanSettings = (raw, fallbackName) => {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    name: cleanName(s.name || fallbackName).slice(0, 20),
    public: !!s.public,
    password: String(s.password ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, 16),
    mut: cleanMut(s.mut),
    max: Math.min(4, Math.max(2, Math.floor(Number(s.max) || 4))),
  };
};
const newRoom = (hostWs, settings) => {
  const room = { code: genCode(), host: hostWs.pid, phase: 'lobby', state: null, clients: new Set(), specs: new Set(), held: new Map(), tick: 0, settings, overHandled: false };
  rooms.set(room.code, room);
  return room;
};

function roomInfo(room, ws) {
  const away = new Set([...room.held.values()].map((h) => h.pid));
  const mk = (c, isAway) => ({ id: c.pid, name: c.pname, color: clientLoadout(c).color, role: c.role, away: isAway });
  return {
    t: 'room', code: room.code, you: ws.pid, token: ws.token, spectator: !!ws.spectator, host: room.host, phase: room.phase,
    settings: { name: room.settings.name, public: room.settings.public, locked: !!room.settings.password, mut: room.settings.mut, max: room.settings.max },
    spectators: room.specs.size,
    players: [...room.clients].map((c) => mk(c, false)).concat([...room.held.values()].map((h) => mk(h, away.has(h.pid)))),
  };
}
function broadcastRoom(room) { for (const c of [...room.clients, ...room.specs]) send(c, roomInfo(room, c)); }

// Keys collected by a multiplayer pilot are counted by the server's own simulation and credited to their profile.
function creditPlayer(ws: Conn, room: any) {
  const p = room.state?.players[ws.pid];
  if (!p || !ws.session) return;
  const fresh = Math.max(0, (p.keys || 0) - (ws.creditedKeys || 0));
  ws.creditedKeys = p.keys || 0;
  if (fresh <= 0) return;
  getStore().then((s) => s.updateProfile(ws.session.uid, (prof) => { prof.pending += fresh; prof.stats.totalKeys += fresh; })).catch(logErr('credit keys'));
}

// Records an online run once per game, from the server's own numbers for that pilot.
function finishRun(ws: Conn, room: any) {
  const p = room.state?.players[ws.pid];
  if (!p || !ws.session || ws.runRecorded) return;
  ws.runRecorded = true;
  const wave = room.state.wave, name = cleanName(ws.pname), muts = room.state.mut.length;
  const snap = { score: p.score, kills: p.kills, keys: p.keys || 0, st: { ...p.st } };
  getStore().then((s) => s.updateProfile(ws.session.uid, (prof) => {
    if (!recordRun(prof.rec.online, { score: snap.score, wave })) return;
    prof.name = name; // the public name only changes when a run is actually recorded
    prof.stats.runs += 1;
    prof.stats.bestWave = Math.max(prof.stats.bestWave, wave);
    applyRun(prof, {
      mode: 'online', score: snap.score, wave, kills: snap.kills, keys: snap.keys, mut: muts,
      bosses: snap.st.bosses, flawless: snap.st.flawless, novas: snap.st.novas, mends: snap.st.mends, revives: snap.st.revives,
    }, new Date(), serverEvent());
  })).catch(logErr('record run'));
}

function closeRoomIfEmpty(room) {
  if (room.clients.size || room.held.size) return false;
  for (const sp of room.specs) { send(sp, { t: 'error', msg: 'The room has closed' }); sp.room = null; }
  room.specs.clear();
  rooms.delete(room.code);
  return true;
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  if (ws.spectator) { room.specs.delete(ws); broadcastRoom(room); return; }
  creditPlayer(ws, room);
  finishRun(ws, room);
  room.clients.delete(ws);
  room.held.delete(ws.token);
  if (room.state) removePlayer(room.state, ws.pid);
  if (closeRoomIfEmpty(room)) return;
  if (room.host === ws.pid && room.clients.size) room.host = [...room.clients][0].pid;
  broadcastRoom(room);
}

// A dropped connection keeps the seat for a while: the pilot hovers (untouchable, not shooting) until they return.
function hold(ws, room) {
  room.clients.delete(ws);
  ws.heldUntil = Date.now() + GRACE_MS;
  room.held.set(ws.token, ws);
  if (room.host === ws.pid && room.clients.size) room.host = [...room.clients][0].pid;
  broadcastRoom(room);
}
function finalizeHeld(room, ws) {
  room.held.delete(ws.token);
  creditPlayer(ws, room);
  finishRun(ws, room);
  if (room.state) removePlayer(room.state, ws.pid);
  if (closeRoomIfEmpty(room)) return;
  broadcastRoom(room);
}

function startGame(room) {
  room.state = createState(undefined, { mut: room.settings.mut, event: serverEvent() });
  room.overHandled = false;
  for (const c of room.clients) {
    c.creditedKeys = 0; c.runRecorded = false;
    addPlayer(room.state, c.pid, c.pname, clientLoadout(c));
  }
  room.phase = 'playing';
  for (const c of [...room.clients, ...room.specs]) send(c, { t: 'state', s: room.state });
  broadcastRoom(room);
}

// Snapshots are serialised once per tick (not once per client) with positions rounded to 0.01.
const round2 = (_k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v);
const num = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(v, Math.max(W, H))) : null);

// Puts a connection into a room as a player or spectator. Returns an error string, or null on success.
function enter(ws: Conn, room: any, { password, spectate, creating }: { password?: unknown; spectate?: boolean; creating?: boolean }) {
  // the creator of a password room is not asked for its password
  if (!creating && room.settings.password && room.settings.password !== String(password ?? '')) return 'Wrong password';
  if (spectate) {
    if (room.specs.size >= MAX_SPECTATORS) return 'Too many spectators';
    ws.spectator = true; ws.room = room; room.specs.add(ws);
    if (room.state) send(ws, { t: 'state', s: room.state });
    broadcastRoom(room);
    return null;
  }
  if (room.clients.size + room.held.size >= room.settings.max) return 'Room is full';
  ws.spectator = false; ws.room = room; room.clients.add(ws);
  if (room.state) { addPlayer(room.state, ws.pid, ws.pname, clientLoadout(ws)); ws.creditedKeys = 0; ws.runRecorded = false; } // late join
  if (room.state) send(ws, { t: 'state', s: room.state });
  broadcastRoom(room);
  return null;
}

const onConnection = (ws: Conn) => {
  ws.pid = 'p' + nextId++;
  ws.token = crypto.randomBytes(8).toString('hex');
  ws.pname = 'Pilot';
  ws.role = 'ace';
  ws.room = null;
  ws.profile = null;
  ws.queue = getStore().then((s) => s.getProfile(ws.session.uid)).then((p) => { ws.profile = p; }).catch(logErr('load profile'));

  const identify = (m: any) => {
    ws.pname = String(m.name || ws.session.username || 'Pilot').slice(0, 14);
    ws.role = ROLE_IDS.includes(m.role) ? m.role : 'ace';
  };

  ws.on('message', (raw) => {
    let m: any;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (m.t === 'ping') return send(ws, { t: 'pong', ts: m.ts });
    ws.queue = ws.queue.then(() => handle(m)); // messages wait for the profile to load, in order
  });

  const handle = (m: any) => {

    if (m.t === 'join') {
      leave(ws);
      identify(m);
      let room;
      if (m.create) {
        room = newRoom(ws, cleanSettings(m.settings, ws.pname + "'s room"));
      } else {
        room = rooms.get(String(m.room || '').toUpperCase().trim());
        if (!room) return send(ws, { t: 'error', msg: 'Room not found' });
      }
      const err = enter(ws, room, { password: m.password, spectate: !!m.spectate, creating: !!m.create });
      if (err) { if (m.create) rooms.delete(room.code); return send(ws, { t: 'error', msg: err }); }
    } else if (m.t === 'quick') { // quick play: the busiest open public room, or a fresh one
      leave(ws);
      identify(m);
      const open = [...rooms.values()].filter((r) => r.settings.public && !r.settings.password && r.clients.size + r.held.size < r.settings.max && !(r.state && r.state.over));
      open.sort((a, b) => (a.phase === 'lobby' ? 0 : 1) - (b.phase === 'lobby' ? 0 : 1) || b.clients.size - a.clients.size);
      const room = open[0] || newRoom(ws, cleanSettings({ public: true, name: 'Quick play' }, 'Quick play'));
      const err = enter(ws, room, {});
      if (err) { if (!open[0]) rooms.delete(room.code); return send(ws, { t: 'error', msg: err }); }
    } else if (m.t === 'rejoin') { // take a held seat back after a dropped connection
      const room = rooms.get(String(m.room || '').toUpperCase().trim());
      const old = room && room.held.get(String(m.token || ''));
      if (!old) return send(ws, { t: 'error', msg: 'Could not rejoin', fatal: true });
      Object.assign(ws, { pid: old.pid, pname: old.pname, profile: old.profile, session: old.session, role: old.role, token: old.token, creditedKeys: old.creditedKeys, runRecorded: old.runRecorded, spectator: false, room });
      room.held.delete(old.token);
      room.clients.add(ws);
      const p = room.state && room.state.players[ws.pid];
      if (p) p.away = false;
      if (room.state) send(ws, { t: 'state', s: room.state });
      broadcastRoom(room);
    } else if (ws.room) {
      const room = ws.room;
      if (ws.spectator) { if (m.t === 'leave') leave(ws); return; } // spectators only watch
      if (m.t === 'input' && room.state && m.input) {
        const i = m.input;
        setInput(room.state, ws.pid, { ...emptyInput(), left: +!!i.left, right: +!!i.right, up: +!!i.up, down: +!!i.down, fire: +!!i.fire, ab: +!!i.ab, tx: num(i.tx), ty: num(i.ty) });
      } else if (m.t === 'start' && room.host === ws.pid && room.phase === 'lobby') {
        startGame(room);
      } else if (m.t === 'restart' && room.host === ws.pid && room.state?.over) {
        startGame(room);
      } else if (m.t === 'settings' && room.host === ws.pid && room.phase === 'lobby') {
        const keep = room.settings.password;
        room.settings = cleanSettings({ ...m.settings, password: m.settings && 'password' in m.settings ? m.settings.password : keep }, room.settings.name);
        broadcastRoom(room);
      } else if (m.t === 'rtt' && room.state) {
        const p = room.state.players[ws.pid]; // each pilot's measured latency, shown in everyone's HUD
        if (p) p.ping = Math.max(0, Math.min(999, Math.round(Number(m.ms) || 0)));
      } else if (m.t === 'leave') {
        ws.explicitLeave = true;
        leave(ws);
      }
    }
  };

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    if (ws.spectator || ws.explicitLeave) return leave(ws);
    const playing = room.phase === 'playing' && room.state && !room.state.over && room.state.players[ws.pid];
    if (playing) hold(ws, room); else leave(ws);
  });
};
wss.on('connection', onConnection as any);

// 60Hz simulation, 30Hz snapshots
setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    for (const h of [...room.held.values()]) { // dropped pilots hover safely until the grace period ends
      const p = room.state && room.state.players[h.pid];
      if (now > h.heldUntil || !p) { finalizeHeld(room, h); continue; }
      p.input = emptyInput(); p.inv = Math.max(p.inv, 0.6); p.away = true;
    }
    if (!rooms.has(room.code) || room.phase !== 'playing' || !room.state) continue;
    step(room.state, 1 / 60);
    if (room.state.over && !room.overHandled) { // run finished: credit everyone's keys
      room.overHandled = true;
      for (const c of room.clients) { creditPlayer(c, room); finishRun(c, room); }
      for (const h of [...room.held.values()]) { creditPlayer(h, room); finishRun(h, room); }
    }
    if (++room.tick % 2 === 0) {
      const msg = JSON.stringify({ t: 'state', s: room.state }, round2);
      for (const c of room.clients) if (c.readyState === 1) c.send(msg);
      for (const c of room.specs) if (c.readyState === 1) c.send(msg);
    }
  }
}, 1000 / 60);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Chicken Blasters game server on port ${PORT}`);
  console.log('  WebSocket: /ws   Rooms: /rooms   Health: /health');
  getStore().then((s) => console.log('  Storage: ' + s.kind)).catch((e) => console.error('  Storage error: ' + e.message));
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
