// @ts-nocheck
// End-to-end tests against a running website (APP_URL) and game server (the address the website hands out).
// Run through `npm test` (scripts/test-all.ts starts both with a throw-away database file).
import { WebSocket } from 'ws';
import { PALETTE } from '../shared/sim';
import { dailyInfo } from '../shared/daily';
import { dayId } from '../shared/timeutil';

const APP = process.env.APP_URL || 'http://localhost:3100';
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A browser-like client: keeps the session cookie between calls. */
function client() {
  let cookie = '';
  const call = async (path, body) => {
    const r = await fetch(APP + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = r.headers.getSetCookie?.() || [];
    for (const c of set) { const kv = c.split(';')[0]; if (kv.endsWith('=') || /Max-Age=0|expires=Thu, 01 Jan 1970/i.test(c)) cookie = ''; else cookie = kv; }
    return { status: r.status, body: await r.json().catch(() => ({})), setCookie: set };
  };
  return { call, get cookie() { return cookie; } };
}
let n = 0;
const uniq = () => 'u' + Date.now().toString(36).slice(-5) + (n++).toString(36);
async function account(name = uniq()) {
  const c = client();
  const r = await c.call('/api/auth/register', { username: name, password: 'secret1' });
  assert(r.status === 200, 'register ' + name + ' -> ' + r.status + ' ' + JSON.stringify(r.body));
  return { ...c, name };
}

// ---------------------------------------------------------------- accounts
{
  const anon = client();
  assert((await anon.call('/api/profile')).status === 401, 'the profile needs a session');
  assert((await anon.call('/api/buy', { item: 'skin:gold' })).status === 401, 'game actions need a session');
  assert((await anon.call('/api/auth/me')).body.user === null, 'me is null when signed out');

  assert((await anon.call('/api/auth/register', { username: 'ab', password: 'secret1' })).status === 400, 'usernames under 3 characters are refused');
  assert((await anon.call('/api/auth/register', { username: 'bad name!', password: 'secret1' })).status === 400, 'usernames allow only letters, numbers and underscores');
  assert((await anon.call('/api/auth/register', { username: 'okname', password: '123' })).status === 400, 'short passwords are refused');

  const name = uniq();
  const reg = await anon.call('/api/auth/register', { username: name, password: 'hunter22' });
  assert(reg.status === 200 && reg.body.user.username === name, 'registering needs only a username and a password');
  assert(reg.setCookie.some((c) => /HttpOnly/i.test(c) && /SameSite=lax/i.test(c)), 'the session cookie is httpOnly');
  assert(!JSON.stringify(reg.body).includes('hunter22') && !JSON.stringify(reg.body).includes('$2'), 'responses never contain the password or its hash');
  assert((await anon.call('/api/auth/me')).body.user.username === name, 'registering signs you in');

  const other = client();
  assert((await other.call('/api/auth/register', { username: name.toUpperCase(), password: 'hunter22' })).status === 409, 'usernames are unique ignoring case');
  assert((await other.call('/api/auth/login', { username: name, password: 'wrong-pass' })).status === 401, 'wrong password is refused');
  assert((await other.call('/api/auth/login', { username: 'nobody' + uniq(), password: 'hunter22' })).status === 401, 'unknown users get the same refusal');
  const li = await other.call('/api/auth/login', { username: name.toUpperCase(), password: 'hunter22' });
  assert(li.status === 200 && li.body.user.username === name, 'login works (case-insensitive name)');
  assert((await other.call('/api/profile')).body.profile.name === name, 'the pilot name starts as the username');

  await anon.call('/api/auth/logout', {});
  assert((await anon.call('/api/profile')).status === 401, 'logging out ends the session');
  const forged = client();
  const r = await fetch(APP + '/api/profile', { headers: { cookie: 'cb_session=eyJhbGciOiJIUzI1NiJ9.e30.bad' } });
  assert(r.status === 401, 'a forged session cookie is refused');
}

// ---------------------------------------------------------------- profile, shop, runs
let ownerC;
{
  const daily = (await client().call('/api/daily')).body;
  assert(JSON.stringify(daily) === JSON.stringify(dailyInfo(new Date())) && daily.id === dayId(new Date()), 'the server publishes the same daily challenge as the shared code');

  const u = await account();
  ownerC = u;
  let r = await u.call('/api/profile');
  assert(r.body.profile.keys === 0 && r.body.profile.equipped.skin === 'plain', 'a new account starts with the default plane');
  assert((await u.call('/api/buy', { item: 'skin:gold' })).status === 400, 'the server refuses purchases without keys');

  const run = await u.call('/api/run/start', { kind: 'solo', mut: ['fast', 'bogus', 'fast'] });
  assert(run.body.kind === 'solo' && run.body.mut.join() === 'fast' && run.body.seed === null, 'solo run: mutators validated, no fixed seed');
  const sd = await u.call('/api/run/start', { kind: 'daily', mut: ['glass'] });
  assert(sd.body.seed === daily.seed && sd.body.mut.join() === daily.mut.join(), 'daily run: seed and rules come from the server');
  const sr = await u.call('/api/run/start', { kind: 'rush' });
  assert(sr.body.kind === 'rush' && (await u.call('/api/run/start', { kind: 'nope' })).body.kind === 'solo', 'boss rush runs; unknown kinds fall back to solo');

  r = await u.call('/api/run/end', { runId: run.body.runId, keys: 999, wave: 3 });
  assert(r.status === 200 && r.body.credited > 0 && r.body.credited <= 12 && r.body.profile.pending === r.body.credited, 'run key claim is capped by elapsed time');
  assert((await u.call('/api/run/end', { runId: run.body.runId, keys: 5, wave: 3 })).status === 400, 'a run can only be submitted once');
  const other = await account();
  assert((await other.call('/api/run/end', { runId: sd.body.runId, keys: 5, wave: 3 })).status === 400, 'one pilot cannot close another pilot\'s run');
  const credited = r.body.credited;
  r = await u.call('/api/claim', {});
  assert(r.body.profile.keys === credited && r.body.profile.pending === 0 && r.body.claimed === credited, 'claim moves pending keys into the balance');

  // give the account keys through real claims (the shop is closed to cheating): buy a paint if affordable
  const keys = r.body.profile.keys;
  if (keys >= 3) {
    assert((await u.call('/api/buy', { item: 'paint:' + PALETTE[1] })).status === 200, 'buy a paint with claimed keys');
    assert((await u.call('/api/equip', { slot: 'paint', value: PALETTE[1] })).status === 200, 'equip owned paint');
    assert((await u.call('/api/profile')).body.profile.equipped.paint === PALETTE[1], 'the loadout persists');
  }
  assert((await u.call('/api/equip', { slot: 'paint', value: PALETTE[2] })).status === 400, 'cannot equip unowned paint');

  await sleep(4300); // wave 3 needs ~4 s to be plausible
  const end = await u.call('/api/run/end', { runId: sd.body.runId, keys: 0, wave: 3, score: 700, kills: 12, name: '<b>Dailyer', stats: { bosses: 0, flawless: 1 } });
  assert(end.status === 200 && end.body.result.dailyDone && end.body.profile.life.streak === 1, 'a finished daily pays its reward and starts a streak');
  assert(!end.body.profile.name.includes('<') && end.body.profile.rec.daily.runs === 1, 'public name is cleaned and the run recorded');
  const lb = await u.call('/api/leaderboard', { mode: 'daily', board: 'today' });
  assert(lb.status === 200 && lb.body.entries.some((e) => e.you && e.score > 0), 'the daily board lists the run and flags it as yours');
  assert(!JSON.stringify(lb.body).includes(u.name) || lb.body.entries.every((e) => e.name), 'board rows carry only public fields');
  const seenByOther = (await other.call('/api/leaderboard', { mode: 'daily', board: 'today' })).body;
  assert(seenByOther.entries.length > 0 && seenByOther.entries.every((e) => !e.you), 'another pilot does not see your row flagged as theirs');
  const r2 = await u.call('/api/run/end', { runId: sr.body.runId, keys: 0, wave: 99, score: 999999, kills: 99999, stats: { bosses: 99 } });
  assert(r2.body.wave <= 1 && r2.body.score <= 3000, 'rush wave/score caps are stricter; got wave ' + r2.body.wave + ', score ' + r2.body.score);
  assert((await u.call('/api/leaderboard', { mode: 'nope', board: 'nope' })).body.mode === 'solo', 'bad mode/board fall back safely');

  assert((await u.call('/api/weekly/claim', { goal: 'kills' })).status === 400, 'cannot claim an unfinished weekly goal');
  assert((await u.call('/api/season/claim', { tier: 0 })).status === 400, 'cannot claim a season tier without stars');
  assert((await u.call('/api/title', { title: 'Ace' })).status === 400, 'cannot take an unearned title');
  assert((await u.call('/api/ach/seen', {})).body.profile.achNew.length === 0, 'new-achievement markers can be acknowledged');
}

// ---------------------------------------------------------------- gift cards and the admin page
{
  const admin = await account('hamid');
  assert((await admin.call('/api/auth/me')).body.user.admin === true, 'the hardcoded username hamid is the admin');
  const u1 = await account(), u2 = await account(), u3 = await account();
  assert((await u1.call('/api/auth/me')).body.user.admin === false, 'other users are not admins');
  for (const [path, body] of [['/api/admin/overview'], ['/api/admin/gift/create', { keys: 5 }], ['/api/admin/grant', { username: u2.name, keys: 5 }], ['/api/admin/password', { username: u2.name, password: 'hacked1' }]]) {
    assert((await u1.call(path, body)).status === 403, 'non-admins are refused: ' + path);
  }
  assert((await client().call('/api/admin/overview')).status === 401, 'the admin page needs a session');

  const ov = (await admin.call('/api/admin/overview')).body;
  assert(ov.total >= 4 && ov.users.some((x) => x.username === 'hamid'), 'the admin sees the user list');
  assert((await admin.call('/api/admin/overview?q=' + u1.name)).body.users.length === 1, 'the user list can be searched');

  assert((await admin.call('/api/admin/gift/create', { keys: 0 })).status === 400, 'a gift card needs at least 1 key');
  const g = await admin.call('/api/admin/gift/create', { keys: 25, uses: 2, note: '<b>test' });
  assert(g.status === 200 && /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(g.body.code), 'the admin can create a gift card with a random code');
  assert((await admin.call('/api/admin/gift/create', { keys: 5, code: g.body.code })).status === 409, 'codes are unique');
  const before = (await u1.call('/api/profile')).body.profile.keys;
  const r1 = await u1.call('/api/gift/redeem', { code: g.body.code.toLowerCase().replace(/-/g, ' ') });
  assert(r1.status === 200 && r1.body.keys === 25 && r1.body.profile.keys === before + 25, 'redeeming adds the keys (code is case/format tolerant)');
  assert((await u1.call('/api/gift/redeem', { code: g.body.code })).status === 400, 'the same account cannot use a card twice');
  assert((await u2.call('/api/gift/redeem', { code: g.body.code })).status === 200, 'a second account can use a multi-use card');
  const third = await u3.call('/api/gift/redeem', { code: g.body.code });
  assert(third.status === 400 && /used up/.test(third.body.error), 'a card stops working after its uses run out');
  assert((await u3.call('/api/gift/redeem', { code: 'NOPE-NOPE-NOPE' })).status === 400, 'unknown codes are refused');
  assert((await client().call('/api/gift/redeem', { code: g.body.code })).status === 401, 'redeeming needs an account');

  const g2 = await admin.call('/api/admin/gift/create', { keys: 7, code: 'WELCOME7', days: 30 });
  assert(g2.body.code === 'WELCOME7', 'custom codes work');
  assert((await admin.call('/api/admin/gift/toggle', { code: 'WELCOME7', disabled: true })).status === 200, 'a card can be disabled');
  assert(/no longer active/.test((await u3.call('/api/gift/redeem', { code: 'WELCOME7' })).body.error), 'a disabled card is refused');
  await admin.call('/api/admin/gift/toggle', { code: 'WELCOME7', disabled: false });
  assert((await u3.call('/api/gift/redeem', { code: 'welcome7' })).body.keys === 7, 'an enabled card works again');
  assert((await admin.call('/api/admin/gift/delete', { code: 'WELCOME7' })).status === 200, 'a card can be deleted');
  assert(!(await admin.call('/api/admin/overview')).body.gifts.some((x) => x.code === 'WELCOME7') && (await admin.call('/api/admin/overview')).body.gifts.every((x) => !x.note.includes('<')), 'deleted cards disappear and notes are cleaned');

  const k0 = (await u2.call('/api/profile')).body.profile.keys;
  assert((await admin.call('/api/admin/grant', { username: u2.name, keys: 40 })).body.keys === k0 + 40, 'the admin can give keys');
  assert((await admin.call('/api/admin/grant', { username: u2.name, keys: -100000 })).status === 200 && (await u2.call('/api/profile')).body.profile.keys === 0, 'taking keys never goes below zero');
  assert((await admin.call('/api/admin/grant', { username: 'nobody_here', keys: 5 })).status === 404, 'granting to an unknown user fails');
  assert((await admin.call('/api/admin/password', { username: u3.name, password: 'abc' })).status === 400, 'new passwords follow the same rules');
  assert((await admin.call('/api/admin/password', { username: u3.name, password: 'brandnew1' })).status === 200, 'the admin can reset a password');
  const relog = client();
  assert((await relog.call('/api/auth/login', { username: u3.name, password: 'secret1' })).status === 401 && (await relog.call('/api/auth/login', { username: u3.name, password: 'brandnew1' })).status === 200, 'the old password stops working, the new one works');
}

// ---------------------------------------------------------------- rooms (game server)
const sockets = [];
const waitFor = async (w, pred, ms = 4000) => { const t0 = Date.now(); for (;;) { const m = w.msgs.find(pred); if (m) return m; if (Date.now() - t0 > ms) throw new Error('timeout waiting for message'); await sleep(25); } };
async function connect(user) {
  const t = (await user.call('/api/ws-token')).body;
  assert(t.token && t.url.startsWith('ws'), 'the website hands out a game-server token');
  const w = await new Promise((res, rej) => { const s = new WebSocket(`${t.url}?token=${encodeURIComponent(t.token)}`); s.msgs = []; s.on('message', (d) => s.msgs.push(JSON.parse(d))); s.on('open', () => res(s)); s.on('error', rej); });
  sockets.push(w);
  return w;
}
const send = (w, m) => w.send(JSON.stringify(m));
{
  // the game server refuses sockets without a valid token
  const t = (await ownerC.call('/api/ws-token')).body;
  const bare = await new Promise((res) => { const s = new WebSocket(t.url); s.on('open', () => res('open')); s.on('error', () => res('refused')); s.on('unexpected-response', () => res('refused')); });
  assert(bare === 'refused', 'a socket without a token is refused');
  const forged = await new Promise((res) => { const s = new WebSocket(t.url + '?token=abc.def.ghi'); s.on('open', () => res('open')); s.on('error', () => res('refused')); s.on('unexpected-response', () => res('refused')); });
  assert(forged === 'refused', 'a forged token is refused');

  const uA = await account(), uB = await account(), uC = await account(), uD = await account();
  // give A a coloured paint through the shop so the loadout travels: needs keys, so just check defaults here
  const A = await connect(uA);
  send(A, { t: 'join', name: 'HostA', role: 'medic', create: true, settings: { name: 'Test lobby', public: true, mut: ['rapid', 'bogus'], max: 3 } });
  const rA = await waitFor(A, (m) => m.t === 'room');
  assert(rA.settings.public && rA.settings.name === 'Test lobby' && rA.settings.mut.join() === 'rapid' && rA.settings.max === 3 && rA.players[0].role === 'medic', 'room settings and role are applied');
  const list = (await uB.call('/api/rooms')).body.rooms;
  assert(list.some((r) => r.code === rA.code && r.name === 'Test lobby' && r.players === 1), 'public rooms are listed through the website');

  const P = await connect(uC);
  send(P, { t: 'join', name: 'Priv', create: true, settings: { public: false, password: 'pw', name: 'Secret' } });
  const rP = await waitFor(P, (m) => m.t === 'room');
  assert(!(await uB.call('/api/rooms')).body.rooms.some((r) => r.code === rP.code), 'private rooms are not listed');
  assert(rP.settings.locked === true && !('password' in rP.settings), 'the password never leaves the server');
  const bad = await connect(uD);
  send(bad, { t: 'join', name: 'Guest', room: rP.code, password: 'nope' });
  assert((await waitFor(bad, (m) => m.t === 'error')).msg === 'Wrong password', 'wrong password is refused');
  send(bad, { t: 'join', name: 'Guest', room: rP.code, password: 'pw' });
  assert((await waitFor(bad, (m) => m.t === 'room')).players.length === 2, 'right password joins');

  const Q = await connect(uB);
  send(Q, { t: 'quick', name: 'Quick', role: 'tank' });
  const rQ = await waitFor(Q, (m) => m.t === 'room');
  assert(rQ.code === rA.code && rQ.players.length === 2, 'quick play joins an open public room');

  Q.send(JSON.stringify({ t: 'settings', settings: { name: 'Hacked', public: true, mut: [], max: 4 } })); await sleep(120);
  send(A, { t: 'settings', settings: { name: 'Renamed', public: true, mut: ['glass'], max: 4 } });
  assert((await waitFor(A, (m) => m.t === 'room' && m.settings.name === 'Renamed')).settings.mut.join() === 'glass', 'only the host can change room settings');

  send(A, { t: 'start' });
  const stA = await waitFor(A, (m) => m.t === 'state');
  assert(stA.s.mut.join() === 'glass' && Object.values(stA.s.players).every((p) => p.lives === 1), 'room mutators apply to the game');
  assert(Object.values(stA.s.players).some((p) => p.role === 'medic') && Object.values(stA.s.players).some((p) => p.role === 'tank'), 'roles carry into the game');
  assert(Object.values(stA.s.players).every((p) => p.color === PALETTE[(Object.keys(stA.s.players).indexOf(p.id)) % PALETTE.length] || /^#/.test(p.color)), 'players get ship colours');

  const S = await connect(await account());
  send(S, { t: 'join', name: 'Watcher', room: rA.code, spectate: true });
  const rS = await waitFor(S, (m) => m.t === 'room');
  assert(rS.spectator === true && rS.players.length === 2, 'spectators do not take a seat');
  assert(Object.keys((await waitFor(S, (m) => m.t === 'state' && m.s.t > 0.2)).s.players).length === 2, 'spectators receive live snapshots');
  send(S, { t: 'input', input: { fire: 1, left: 1 } }); await sleep(150);
  assert(!Object.values(A.msgs.filter((m) => m.t === 'state').slice(-1)[0].s.players).some((p) => p.name === 'Watcher'), 'spectator input is ignored');

  send(Q, { t: 'ping', ts: 12345 });
  assert((await waitFor(Q, (m) => m.t === 'pong')).ts === 12345, 'server answers ping with the same timestamp');
  send(Q, { t: 'rtt', ms: 42 });
  assert(await waitFor(A, (m) => m.t === 'state' && Object.values(m.s.players).some((p) => p.ping === 42)), "a pilot's measured ping is shared with the room");

  // reconnect: a dropped pilot keeps their seat
  const tokenQ = rQ.token;
  Q.terminate();
  assert((await waitFor(A, (m) => m.t === 'room' && m.players.some((p) => p.away))).players.length === 2, 'a dropped pilot keeps their seat');
  const Q2 = await connect(uB);
  send(Q2, { t: 'rejoin', room: rA.code, token: tokenQ });
  const back = await waitFor(Q2, (m) => m.t === 'room');
  assert(back.you === rQ.you && !back.players.some((p) => p.away), 'rejoining restores the same seat');
  const wrong = await connect(await account());
  send(wrong, { t: 'rejoin', room: rA.code, token: 'deadbeefdeadbeef' });
  assert((await waitFor(wrong, (m) => m.t === 'error')).fatal === true, 'a wrong rejoin token is refused');
  send(Q2, { t: 'leave' }); await sleep(150);
  assert(A.msgs.filter((m) => m.t === 'room').slice(-1)[0].players.length === 1, 'leaving on purpose frees the seat at once');
}

// ---------------------------------------------------------------- community gallery
{
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const owner = await account(), others = [await account(), await account(), await account()];
  const pub = (u, pack, desc) => u.call('/api/packs/publish', { pack, desc });
  const anon = client();
  assert((await anon.call('/api/packs/publish', { pack: { name: 'x', images: { chicken: png } } })).status === 401, 'publishing needs an account');
  const good = await pub(owner, { name: '<i>Robo</i> pack', images: { chicken: png, egg: png } }, 'A <b>test</b>');
  assert(good.status === 200 && /^[a-f0-9]{10}$/.test(good.body.id), 'a valid pack can be shared');
  const listed = (await anon.call('/api/packs?sort=new')).body.packs.find((p) => p.id === good.body.id);
  assert(listed && !listed.name.includes('<') && !listed.desc.includes('<') && listed.thumb === png, 'listing is public and shows cleaned text and a thumbnail');
  assert((await pub(owner, { name: 'Evil', images: { chicken: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' } })).status === 400, 'unsafe packs are rejected by the server');
  assert((await pub(owner, { name: 'Empty' })).status === 400, 'a pack must contain something');
  const got = await anon.call('/api/packs/' + good.body.id);
  assert(got.status === 200 && got.body.pack.images.chicken.src === png && got.body.meta.downloads >= 1, 'a pack can be downloaded (and the count goes up)');
  assert((await anon.call('/api/packs?sort=popular')).body.packs[0].downloads >= 1, 'popular sort works');
  assert((await others[0].call('/api/packs/remove', { packId: good.body.id })).status === 404, 'only the owner can remove a pack');
  for (const o of others) await o.call('/api/packs/report', { packId: good.body.id });
  assert((await anon.call('/api/packs/' + good.body.id)).status === 404 && !(await anon.call('/api/packs')).body.packs.some((p) => p.id === good.body.id), 'three reports hide a pack');
  const owned = [];
  for (let i = 0; i < 4; i++) owned.push((await pub(owner, { name: 'P' + i, sounds: { shoot: 'data:audio/mpeg;base64,AAAA' } })).body.id);
  assert((await pub(owner, { name: 'Sixth', images: { chicken: png } })).status === 400, 'each pilot can share only five packs');
  for (const id of [good.body.id, ...owned]) await owner.call('/api/packs/remove', { packId: id });
  assert((await pub(owner, { name: 'After cleanup', images: { chicken: png } })).status === 200, 'removing frees a slot');
}

// ---------------------------------------------------------------- PWA files and the page itself
{
  const man = await fetch(APP + '/manifest.webmanifest').then((r) => r.json());
  assert(man.name && man.start_url === '/' && man.icons.some((i) => i.purpose === 'maskable'), 'web manifest is valid and installable');
  for (const ic of man.icons) {
    const r = await fetch(APP + ic.src);
    const buf = Buffer.from(await r.arrayBuffer());
    assert(r.ok && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buf.readUInt32BE(16) === parseInt(ic.sizes, 10), ic.src + ' is a real PNG of the declared size');
  }
  const swText = await fetch(APP + '/sw.js').then((r) => r.text());
  assert(swText.includes("startsWith('/api/')"), 'the service worker never intercepts the API');
  const html = await fetch(APP + '/').then((r) => r.text());
  assert(html.includes('rel="manifest"') && html.includes('apple-touch-icon') && html.includes('Chicken Blasters'), 'the page links the manifest and icons');
  const bossSound = await fetch(APP + '/sound/boss-sound.mp3');
  assert(bossSound.ok, 'the boss sound is served');
}

for (const s of sockets) { try { s.terminate(); } catch { /* ignore */ } }
console.log('integration ok: accounts, shop, runs, leaderboard, gift cards, admin, rooms, reconnect, gallery, PWA');
process.exit(0);
