import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import selfsigned from 'selfsigned';
import { WebSocketServer } from 'ws';
import { createState, addPlayer, removePlayer, setInput, step, emptyInput, W, H, MUT_IDS, ROLE_IDS } from '../shared/sim.js';
import { buyItem, equipItem, loadoutOf, sanitizeProfile, defaultProfile } from '../shared/catalog.js';
import { EVENTS, activeEvent } from '../shared/events.js';
import { recordRun, buildBoard, cleanName } from '../shared/leaderboard.js';
import { applyRun, claimWeekly, claimSeason, setTitle } from '../shared/progress.js';
import { dailyInfo } from '../shared/daily.js';
import { sanitizePack } from '../shared/packfmt.js';

const PORT = Number(process.env.PORT) || 3000;
const MAX_SPECTATORS = 8;
const GRACE_MS = 30000; // how long a dropped player keeps their seat
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '..', 'dist');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'profiles.json');
const PACKS_FILE = path.join(DATA_DIR, 'packs.json');
const ID_RE = /^[a-f0-9]{24}$/;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const HTTPS_ON = process.env.HTTPS !== '0'; // HTTPS=0 turns the secure listener off
// The running seasonal event (decides when limited-time shop skins can be bought). EVENT_OVERRIDE=halloween forces one.
const serverEvent = () => (EVENTS[process.env.EVENT_OVERRIDE] ? process.env.EVENT_OVERRIDE : activeEvent(new Date()));

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  return out;
}

// A self-signed certificate (kept in the data folder so the browser's "continue anyway" choice keeps working).
// It exists so phones on your network can use features that need a secure page, such as gyroscope steering.
function loadCert() {
  const file = path.join(DATA_DIR, 'https-cert.json');
  const hosts = ['localhost', '127.0.0.1', ...lanAddresses()];
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (c.hosts?.join() === hosts.join() && c.expires > Date.now() + 7 * 86400000) return c;
  } catch { /* generate below */ }
  const altNames = hosts.map((h) => (/^\d+\.\d+\.\d+\.\d+$/.test(h) ? { type: 7, ip: h } : { type: 2, value: h }));
  const pems = selfsigned.generate([{ name: 'commonName', value: 'chicken-blasters.local' }], {
    days: 365, keySize: 2048, algorithm: 'sha256', extensions: [{ name: 'subjectAltName', altNames }],
  });
  const c = { key: pems.private, cert: pems.cert, hosts, expires: Date.now() + 364 * 86400000 };
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify(c)); } catch { /* not fatal */ }
  return c;
}

// ---------- persistence (profiles + community packs), debounced atomic writes ----------
const profiles = new Map();
try {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  for (const [id, p] of Object.entries(raw)) if (ID_RE.test(id)) profiles.set(id, sanitizeProfile(p));
  console.log(`Loaded ${profiles.size} profile(s) from ${FILE}`);
} catch { /* first run */ }

const gallery = new Map(); // id -> { id, owner, author, name, desc, size, created, downloads, reports[], pack }
try {
  for (const g of JSON.parse(fs.readFileSync(PACKS_FILE, 'utf8'))) {
    try { gallery.set(g.id, { ...g, pack: sanitizePack(g.pack), reports: Array.isArray(g.reports) ? g.reports : [] }); } catch { /* skip a bad entry */ }
  }
  console.log(`Loaded ${gallery.size} community pack(s)`);
} catch { /* none yet */ }

const writers = new Map();
function persist(file, data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  } catch (e) { console.error('Could not save ' + path.basename(file) + ':', e.message); }
}
const flushers = [];
function debounced(file, getData) {
  const flush = () => persist(file, getData());
  flushers.push(() => { if (writers.get(file)) { clearTimeout(writers.get(file)); writers.delete(file); flush(); } });
  return () => {
    if (writers.get(file)) return;
    writers.set(file, setTimeout(() => { writers.delete(file); flush(); }, 300));
  };
}
const save = debounced(FILE, () => Object.fromEntries(profiles));
const savePacks = debounced(PACKS_FILE, () => [...gallery.values()]);
process.on('exit', () => { for (const f of flushers) f(); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));

const newProfile = () => {
  const id = crypto.randomBytes(12).toString('hex');
  const p = defaultProfile();
  profiles.set(id, p);
  save();
  return { id, p };
};

// Browser-simulated runs (solo, daily, rush): the server issues a run id at the start and only accepts what the
// elapsed time makes plausible. (The simulation runs in the browser, so this is a sanity limit, not a guarantee.
// Online runs are counted by the server's own simulation.)
const runs = new Map();
const KEY_RATE_SECONDS = 4;
const RUN_KINDS = ['solo', 'daily', 'rush'];
const cleanMut = (list) => [...new Set((Array.isArray(list) ? list : []).filter((id) => MUT_IDS.includes(id)))];

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
app.use('/api/packs/publish', express.json({ limit: '5mb' })); // packs carry images and sounds
app.use(express.json({ limit: '10kb' }));
app.use(express.static(dist));
app.get('/api/info', (_req, res) => res.json({ port: PORT, addresses: lanAddresses(), event: serverEvent(), httpsPort: httpsServer ? HTTPS_PORT : null }));
app.get('/api/daily', (_req, res) => res.json(dailyInfo(new Date())));

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

// ---- progression: weekly goals, season tiers, titles, "new achievement" acknowledgements ----
app.post('/api/weekly/claim', (req, res) => {
  const w = withProfile(req, res); if (!w) return;
  const r = claimWeekly(w.p, String(req.body?.goal || ''));
  if (!r.ok) return fail(res, 400, r.error);
  save(); res.json({ profile: w.p, keys: r.keys });
});
app.post('/api/season/claim', (req, res) => {
  const w = withProfile(req, res); if (!w) return;
  const r = claimSeason(w.p, Math.floor(Number(req.body?.tier)));
  if (!r.ok) return fail(res, 400, r.error);
  save(); res.json({ profile: w.p, keys: r.keys });
});
app.post('/api/title', (req, res) => {
  const w = withProfile(req, res); if (!w) return;
  const r = setTitle(w.p, String(req.body?.title || ''));
  if (!r.ok) return fail(res, 400, r.error);
  save(); res.json({ profile: w.p });
});
app.post('/api/ach/seen', (req, res) => {
  const w = withProfile(req, res); if (!w) return;
  w.p.achNew = [];
  save(); res.json({ profile: w.p });
});

// ---- browser-simulated runs ----
app.post('/api/run/start', (req, res) => {
  const w = withProfile(req, res); if (!w) return;
  const now = Date.now();
  for (const [k, r] of runs) if (now - r.start > 6 * 3600 * 1000) runs.delete(k);
  const kind = RUN_KINDS.includes(req.body?.kind) ? req.body.kind : 'solo';
  const daily = kind === 'daily' ? dailyInfo(new Date(now)) : null;
  const mut = daily ? daily.mut : cleanMut(req.body?.mut); // the daily challenge fixes its own rules
  const runId = crypto.randomBytes(8).toString('hex');
  runs.set(runId, { pid: w.id, start: now, done: false, kind, mut, daily });
  res.json({ runId, kind, mut, seed: daily ? daily.seed : null, daily, event: serverEvent() });
});
app.post('/api/run/end', (req, res) => {
  const w = withProfile(req, res); if (!w) return;
  const run = runs.get(String(req.body?.runId || ''));
  if (!run || run.pid !== w.id || run.done) return fail(res, 400, 'Run already submitted or unknown');
  run.done = true;
  const elapsed = (Date.now() - run.start) / 1000;
  const n = run.mut.length;
  // Only what the elapsed time makes plausible is accepted.
  const maxWave = run.kind === 'rush' ? Math.floor(elapsed / 12) + 1 : Math.floor(elapsed / 4) + 2;
  const wave = Math.min(maxWave, 999, Math.max(0, Math.floor(Number(req.body?.wave) || 0)));
  const reportedScore = Math.max(0, Math.floor(Number(req.body?.score) || 0));
  const score = Math.min(reportedScore, Math.floor((400 * elapsed + 600 * wave + 200) * (1 + 0.2 * n)));
  const reported = Math.max(0, Math.floor(Number(req.body?.keys) || 0));
  const cap = Math.round(Math.min(3 + Math.ceil(elapsed / KEY_RATE_SECONDS), 5 + wave * 6) * (1 + 0.25 * n)) + (n ? n * 2 : 0);
  const credited = Math.min(reported, cap);
  const st = req.body?.stats && typeof req.body.stats === 'object' ? req.body.stats : {};
  const lim = (v, max) => Math.min(Math.max(0, Math.floor(Number(v) || 0)), Math.max(0, Math.floor(max)));
  const stats = {
    kills: lim(req.body?.kills, elapsed * 6 + 30),
    bosses: lim(st.bosses, run.kind === 'rush' ? wave : wave / 5 + 1),
    flawless: lim(st.flawless, wave),
    novas: lim(st.novas, elapsed / 6 + 2),
    mends: lim(st.mends, elapsed / 5 + 2),
    revives: lim(st.revives, elapsed / 5 + 2),
  };
  creditPending(w.p, credited, wave);
  w.p.name = cleanName(req.body?.name);
  const counted = recordRun(w.p.rec[run.kind], { score, wave });
  const result = applyRun(w.p, { mode: run.kind, score, wave, keys: credited, mut: n, daily: run.daily, ...stats }, new Date(run.start), serverEvent());
  if (!counted) result.unlocked = result.unlocked.filter((id) => id !== 'first_run' || w.p.ach.first_run); // a zero-score run is no achievement
  save();
  res.json({ profile: w.p, credited, score, wave, result });
});

// The leaderboard never exposes profile codes: your own rows are flagged with "you".
app.post('/api/leaderboard', (req, res) => {
  const id = String(req.body?.id || '');
  const self = ID_RE.test(id) && profiles.has(id) ? id : null;
  res.json(buildBoard(profiles, String(req.body?.mode), String(req.body?.board), self, new Date(), 50));
});

// ---- community pack gallery: packs are data-only and re-validated here before they are stored or served ----
const GALLERY_MAX = 300, PER_OWNER = 5, PACK_BYTES = 3_500_000;
const publicMeta = (g) => {
  const im = g.pack.images;
  const t = [im.chicken, im.ship, im.egg, im.boss].find((x) => x && x.src.length <= 60000);
  return { id: g.id, name: g.name, author: g.author, desc: g.desc, size: g.size, downloads: g.downloads, created: g.created, thumb: t ? t.src : null };
};
const visible = (g) => g.reports.length < 3;

app.post('/api/packs/publish', (req, res) => {
  const w = withProfile(req, res); if (!w) return;
  let clean;
  try { clean = sanitizePack(req.body?.pack); } catch (e) { return fail(res, 400, e.message); }
  const size = JSON.stringify(clean).length;
  if (size > PACK_BYTES) return fail(res, 400, 'That pack is too large to share (limit about 3.5 MB)');
  if (!Object.keys(clean.images).length && !Object.keys(clean.sounds).length) return fail(res, 400, 'Add at least one image or sound before sharing');
  if ([...gallery.values()].filter((g) => g.owner === w.id).length >= PER_OWNER) return fail(res, 400, `You can share up to ${PER_OWNER} packs; remove one first`);
  if (gallery.size >= GALLERY_MAX) return fail(res, 400, 'The gallery is full right now');
  const id = crypto.randomBytes(5).toString('hex');
  const desc = String(req.body?.desc ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120);
  gallery.set(id, { id, owner: w.id, author: cleanName(w.p.name || clean.author), name: clean.name, desc, size, created: Date.now(), downloads: 0, reports: [], pack: clean });
  savePacks();
  res.json({ id });
});
app.get('/api/packs', (req, res) => {
  const list = [...gallery.values()].filter(visible);
  list.sort(req.query.sort === 'popular' ? (a, b) => b.downloads - a.downloads || b.created - a.created : (a, b) => b.created - a.created);
  res.json({ packs: list.slice(0, 60).map(publicMeta), total: list.length });
});
app.get('/api/packs/:id', (req, res) => {
  const g = gallery.get(String(req.params.id));
  if (!g || !visible(g)) return fail(res, 404, 'Pack not found');
  g.downloads++;
  savePacks();
  res.json({ meta: publicMeta(g), pack: g.pack });
});
app.post('/api/packs/remove', (req, res) => {
  const w = withProfile(req, res); if (!w) return;
  const g = gallery.get(String(req.body?.packId || ''));
  if (!g || g.owner !== w.id) return fail(res, 404, 'Pack not found');
  gallery.delete(g.id);
  savePacks();
  res.json({ ok: true });
});
app.post('/api/packs/report', (req, res) => {
  const w = withProfile(req, res); if (!w) return;
  const g = gallery.get(String(req.body?.packId || ''));
  if (!g) return fail(res, 404, 'Pack not found');
  if (!g.reports.includes(w.id)) { g.reports.push(w.id); savePacks(); } // three reports hide a pack
  res.json({ ok: true });
});

const server = http.createServer(app);
let httpsServer = null;
if (HTTPS_ON) {
  try { const c = loadCert(); httpsServer = https.createServer({ key: c.key, cert: c.cert }, app); }
  catch (e) { console.error('HTTPS disabled (could not create a certificate):', e.message); }
}
const wss = new WebSocketServer({ server, path: '/ws' });
const wssSecure = httpsServer ? new WebSocketServer({ server: httpsServer, path: '/ws' }) : null;

// ---------- rooms ----------
const rooms = new Map();
let nextId = 1;

const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const genCode = () => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
};
const clientLoadout = (ws) => ({ ...loadoutOf(ws.profileId ? profiles.get(ws.profileId) : null), role: ws.role });

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
function creditPlayer(ws, room) {
  const p = room.state?.players[ws.pid];
  const prof = ws.profileId && profiles.get(ws.profileId);
  if (!p || !prof) return;
  const fresh = Math.max(0, (p.keys || 0) - (ws.creditedKeys || 0));
  ws.creditedKeys = p.keys || 0;
  if (fresh > 0) { prof.pending += fresh; prof.stats.totalKeys += fresh; save(); }
}

// Records an online run once per game, from the server's own numbers for that pilot.
function finishRun(ws, room) {
  const p = room.state?.players[ws.pid];
  const prof = ws.profileId && profiles.get(ws.profileId);
  if (!p || !prof || ws.runRecorded) return;
  ws.runRecorded = true;
  if (recordRun(prof.rec.online, { score: p.score, wave: room.state.wave })) {
    prof.name = cleanName(ws.pname); // the public name only changes when a run is actually recorded
    prof.stats.runs += 1;
    prof.stats.bestWave = Math.max(prof.stats.bestWave, room.state.wave);
    applyRun(prof, {
      mode: 'online', score: p.score, wave: room.state.wave, kills: p.kills, keys: p.keys || 0, mut: room.state.mut.length,
      bosses: p.st.bosses, flawless: p.st.flawless, novas: p.st.novas, mends: p.st.mends, revives: p.st.revives,
    }, new Date(), serverEvent());
    save();
  }
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
function enter(ws, room, { password, spectate, creating }) {
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

app.get('/api/rooms', (_req, res) => {
  res.json({
    rooms: [...rooms.values()].filter((r) => r.settings.public).map((r) => ({
      code: r.code, name: r.settings.name, players: r.clients.size + r.held.size, max: r.settings.max, phase: r.phase,
      mut: r.settings.mut, wave: r.state ? r.state.wave : 0, locked: !!r.settings.password, spectators: r.specs.size,
    })).sort((a, b) => b.players - a.players),
  });
});

const onConnection = (ws) => {
  ws.pid = 'p' + nextId++;
  ws.token = crypto.randomBytes(8).toString('hex');
  ws.pname = 'Pilot';
  ws.role = 'ace';
  ws.room = null;
  ws.profileId = null;

  const identify = (m) => {
    ws.pname = String(m.name || 'Pilot').slice(0, 14);
    ws.profileId = ID_RE.test(String(m.pid || '')) && profiles.has(m.pid) ? m.pid : null;
    ws.role = ROLE_IDS.includes(m.role) ? m.role : 'ace';
  };

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'ping') return send(ws, { t: 'pong', ts: m.ts });

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
      Object.assign(ws, { pid: old.pid, pname: old.pname, profileId: old.profileId, role: old.role, token: old.token, creditedKeys: old.creditedKeys, runRecorded: old.runRecorded, spectator: false, room });
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
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    if (ws.spectator || ws.explicitLeave) return leave(ws);
    const playing = room.phase === 'playing' && room.state && !room.state.over && room.state.players[ws.pid];
    if (playing) hold(ws, room); else leave(ws);
  });
};
wss.on('connection', onConnection);
wssSecure?.on('connection', onConnection);

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
  console.log(`Chicken Blasters server on port ${PORT}`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const a of lanAddresses()) console.log(`  Network: http://${a}:${PORT}`);
});

if (httpsServer) {
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log('  Secure (needed for gyroscope, self-signed certificate): https://localhost:' + HTTPS_PORT);
    for (const a of lanAddresses()) console.log('  Secure network: https://' + a + ':' + HTTPS_PORT);
  });
}
