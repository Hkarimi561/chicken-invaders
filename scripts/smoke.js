// Headless smoke test: sim sanity + two WebSocket players in one room.
import { WebSocket } from 'ws';
import { createState, addPlayer, step, setInput, emptyInput, PALETTE } from '../shared/sim.js';
import { defaultProfile, loadoutOf, buyItem, equipItem, quote, sanitizeProfile } from '../shared/catalog.js';
import { activeEvent, nextEvent } from '../shared/events.js';
import { sanitizePack, emptyPack } from '../shared/packfmt.js';

const s = createState(42);
addPlayer(s, 'a', 'A');
setInput(s, 'a', { left: 0, right: 0, up: 0, down: 0, fire: 1 });
for (let i = 0; i < 60 * 20; i++) step(s, 1 / 60);
if (s.wave < 1 || !(s.players.a.score > 0)) throw new Error('sim did not progress');
if (!(s.players.a.shots > 0 && s.players.a.hits > 0 && s.players.a.kills > 0)) throw new Error('stats not counted');
console.log('sim ok: wave', s.wave, 'score', s.players.a.score, 'shots/hits/kills', s.players.a.shots, s.players.a.hits, s.players.a.kills);

const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); };

// vest tiers: hits needed = tier + 1, tiers unlock with waves
{
  const t = createState(7); addPlayer(t, 'a', 'A'); t.wave = 8; t.delay = 0;
  step(t, 1 / 60);
  assert(t.chickens.length > 0 && t.chickens.every((c) => c.hp === c.tier + 1), 'hp = tier + 1');
  assert(new Set(t.chickens.map((c) => c.tier)).size >= 3, 'several vest tiers by wave 9');
  const w1 = createState(7); addPlayer(w1, 'a', 'A'); w1.delay = 0; step(w1, 1 / 60);
  assert(w1.chickens.every((c) => c.tier === 0 && c.hp === 1), 'wave 1 has no vests');
}
// weapon pickup + co-op revive
{
  const t = createState(3); addPlayer(t, 'a', 'A'); addPlayer(t, 'b', 'B', { color: '#ff00aa' });
  assert(t.players.b.color === '#ff00aa', 'custom colour');
  t.delay = 99;
  t.gifts.push({ id: 900, x: t.players.a.x, y: t.players.a.y, k: 'wpn', w: 'laser' });
  step(t, 1 / 60);
  assert(t.players.a.weapon === 'laser', 'weapon gift equips laser');
  t.players.b.alive = false; t.players.b.lives = 0; t.players.b.x = t.players.a.x + 10; t.players.b.y = t.players.a.y;
  for (let i = 0; i < 60 * 1.7; i++) step(t, 1 / 60);
  assert(t.players.b.alive && t.players.b.lives === 1, 'teammate revived after 1.5s');
  // each weapon fires
  for (const w of ['blaster', 'pulse', 'laser', 'missile']) {
    const u = createState(5); addPlayer(u, 'a', 'A'); u.delay = 99; u.players.a.weapon = w;
    setInput(u, 'a', { left: 0, right: 0, up: 0, down: 0, fire: 1 }); step(u, 1 / 60);
    assert(u.bullets.length > 0 && u.bullets[0].w === { blaster: 'b', pulse: 'p', laser: 'l', missile: 'm' }[w], w + ' fires');
  }
}
// long autoplay across boss waves must not throw or produce NaN
{
  const t = createState(11); addPlayer(t, 'a', 'A'); addPlayer(t, 'b', 'B');
  t.players.a.lives = t.players.b.lives = 99;
  for (const p of Object.values(t.players)) p.input = { left: 0, right: 0, up: 0, down: 0, fire: 1 };
  for (let i = 0; i < 60 * 240 && !t.over; i++) {
    t.players.a.x = 200 + 150 * Math.sin(i / 40); t.players.b.x = 600 + 150 * Math.sin(i / 55);
    step(t, 1 / 60);
  }
  assert(Number.isFinite(t.players.a.x) && t.chickens.every((c) => Number.isFinite(c.x + c.y)), 'finite after long run');
  console.log('autoplay ok: reached wave', t.wave);
}
// entrance, mother boss (chicks, wing shield), stats, egg ids, skins
{
  const t = createState(9); addPlayer(t, 'a', 'A', { skin: 'gold' }); addPlayer(t, 'b', 'B', { skin: 'nope' });
  assert(t.players.a.skin === 'gold' && t.players.b.skin === 'plain', 'skin validated');
  t.wave = 7; t.delay = 0; step(t, 1 / 60);
  assert(t.chickens.length > 0 && t.chickens.every((c) => c.ent < 1), 'new wave chickens start in entrance');
  for (let i = 0; i < 60 * 4; i++) { t.players.a.lives = t.players.b.lives = 99; step(t, 1 / 60); }
  assert(t.chickens.every((c) => c.ent === 1), 'entrance completes');
  const u = createState(9); addPlayer(u, 'a', 'A'); u.players.a.lives = 99; u.wave = 9; u.delay = 0; step(u, 1 / 60);
  const boss = u.chickens.find((c) => c.boss);
  assert(boss && boss.mother, 'wave 10 spawns the mother hen');
  for (let i = 0; i < 120; i++) step(u, 1 / 60);
  assert(boss.ent === 1, 'boss entered');
  boss.hp = Math.floor(boss.max * 0.5);
  for (let i = 0; i < 60 * 5; i++) { u.players.a.lives = 99; step(u, 1 / 60); }
  assert(u.chickens.some((c) => c.chick) && u.chickens.filter((c) => c.chick).length <= 8, 'phase 2 spawns capped chicks');
  assert(u.eggs.every((e) => Number.isInteger(e.id)), 'eggs have ids');
  boss.hp = Math.floor(boss.max * 0.2); u.t = 4.3; step(u, 1 / 60); // let the boss move to its new position first
  const hp0 = boss.hp;
  u.bullets.push({ x: boss.x, y: boss.y, vx: 0, vy: 0, o: 'a', w: 'b', d: 1 }); step(u, 1 / 60);
  assert(boss.sh === 1 && boss.hp === hp0, 'wing shield absorbs bullets in phase 3');
  u.t = 0.5; boss.hp = 1; step(u, 1 / 60);
  assert(boss.sh === 0, 'shield is down outside its window');
  u.bullets.push({ x: boss.x, y: boss.y, vx: 0, vy: 0, o: 'a', w: 'b', d: 1 }); step(u, 1 / 60);
  assert(u.chickens.length === 0 && u.players.a.kills >= 1, 'killing the mother removes her chicks and counts a kill');
}
// keys, upgrades, loadout validation, shop guns, mouse steering
{
  const t = createState(5);
  addPlayer(t, 'a', 'A', { mods: { engine: 5, hull: 2, reactor: 2, cooling: 5, shield: 3, magnet: 3 }, gun: 'arc', skin: 'gold', trail: 'rainbow', color: '#ff00aa' });
  const p = t.players.a;
  assert(p.lives === 5 && p.power === 3 && p.weapon === 'arc' && p.skin === 'gold' && p.trail === 'rainbow' && p.color === '#ff00aa', 'loadout applied to ship');
  const h = createState(5);
  addPlayer(h, 'a', 'A', { mods: { hull: 99, engine: -4, shield: 'x' }, gun: 'nuke', skin: 'x', trail: 'y', color: 'red' });
  const hp = h.players.a;
  assert(hp.lives === 5 && hp.mods.engine === 0 && hp.mods.shield === 0 && hp.weapon === 'blaster' && hp.skin === 'plain' && hp.trail === 'ember' && hp.color === PALETTE[0], 'hostile loadout is clamped to the default plane');

  t.delay = 99;
  t.gifts.push({ id: 1, x: p.x, y: p.y, k: 'key' });
  step(t, 1 / 60);
  assert(p.keys === 1, 'key pickup');
  t.gifts.push({ id: 2, x: p.x + 120, y: p.y - 60, k: 'key' });
  for (let i = 0; i < 90; i++) step(t, 1 / 60);
  assert(p.keys === 2, 'magnet collects a distant key');

  // engine upgrade makes the ship faster
  const fast = createState(6), slow = createState(6);
  addPlayer(fast, 'a', 'A', { mods: { engine: 5 } }); addPlayer(slow, 'a', 'A');
  for (const q of [fast, slow]) { q.delay = 99; q.players.a.x = 100; q.players.a.input = { ...emptyInput(), right: 1 }; for (let i = 0; i < 30; i++) step(q, 1 / 60); }
  assert(fast.players.a.x > slow.players.a.x + 20, 'engine upgrade is faster');

  // mouse: ship glides to the target, keyboard is ignored while a target is set
  const m = createState(6); addPlayer(m, 'a', 'A'); m.delay = 99;
  m.players.a.input = { ...emptyInput(), tx: 700, ty: 330 };
  for (let i = 0; i < 180; i++) step(m, 1 / 60);
  assert(Math.abs(m.players.a.x - 700) < 2 && Math.abs(m.players.a.y - 330) < 2, 'mouse target reached');

  // shop guns
  const want = { scatter: 's', arc: 'a', drone: 'd' };
  for (const gun of Object.keys(want)) {
    const u = createState(7); addPlayer(u, 'a', 'A', { gun }); u.delay = 99;
    setInput(u, 'a', { ...emptyInput(), fire: 1 }); step(u, 1 / 60);
    assert(u.bullets.length > 0 && u.bullets.some((b) => b.w === want[gun]), gun + ' fires');
    if (gun === 'scatter') assert(u.bullets.length === 6, 'scatter fires 5+power pellets');
    if (gun === 'drone') assert(u.bullets.filter((b) => b.w === 'd').length === 2, 'two drones shoot');
  }
  // arc chains through neighbours
  const c = createState(8); addPlayer(c, 'a', 'A'); c.delay = 99; c.hw = 200; c.pattern = 'grid';
  for (const ox of [-50, 0, 50]) c.chickens.push({ id: 100 + ox, x: 0, y: 0, ox, oy: 0, hp: 1, max: 1, tier: 0, r: 22, fl: 0, dv: 0, ent: 1 });
  c.bullets.push({ x: 400, y: 80, vx: 0, vy: 0, o: 'a', w: 'a', d: 1 });
  step(c, 1 / 60);
  assert(c.fxArcs.length >= 2 && c.chickens.length === 0, 'arc bolt chains to both neighbours');
  // scatter pellets expire
  const sc = createState(9); addPlayer(sc, 'a', 'A', { gun: 'scatter' }); sc.delay = 99;
  setInput(sc, 'a', { ...emptyInput(), fire: 1 }); step(sc, 1 / 60); setInput(sc, 'a', emptyInput());
  for (let i = 0; i < 40; i++) step(sc, 1 / 60);
  assert(sc.bullets.every((b) => b.w !== 's'), 'scatter pellets have limited range');
  // key drops from killed chickens eventually appear (higher tiers more often)
  let dropped = 0;
  for (let seed = 1; seed <= 400 && !dropped; seed++) {
    const d = createState(seed); addPlayer(d, 'a', 'A'); d.delay = 99; d.hw = 200;
    d.chickens.push({ id: 1, x: 0, y: 0, ox: 0, oy: 0, hp: 1, max: 5, tier: 4, r: 22, fl: 0, dv: 0, ent: 1 });
    d.bullets.push({ x: 400, y: 80, vx: 0, vy: 0, o: 'a', w: 'b', d: 5 });
    step(d, 1 / 60);
    if (d.gifts.some((g) => g.k === 'key')) dropped = 1;
  }
  assert(dropped, 'chickens drop keys');
}

// catalog / shop rules (pure)
{
  const pr = defaultProfile();
  const base = loadoutOf(pr);
  assert(base.skin === 'plain' && base.color === null && base.gun === null && base.trail === 'ember' && base.mods.hull === 0, 'everyone starts with the default plane');
  assert(!buyItem(pr, 'skin:gold').ok, 'cannot buy without keys');
  pr.keys = 100;
  assert(buyItem(pr, 'skin:gold').ok && pr.keys === 70, 'buying a skin spends keys');
  assert(!buyItem(pr, 'skin:gold').ok, 'cannot buy twice');
  assert(!equipItem(pr, 'gun', 'arc').ok, 'unowned gun cannot be equipped');
  assert(buyItem(pr, 'gun:arc').ok && equipItem(pr, 'gun', 'arc').ok && loadoutOf(pr).gun === 'arc', 'buy + equip a gun');
  assert(equipItem(pr, 'skin', 'gold').ok && loadoutOf(pr).skin === 'gold', 'equip a skin');
  let spent = 0;
  while (!quote(pr, 'up:engine').error) { pr.keys += 20; assert(buyItem(pr, 'up:engine').ok, 'engine upgrade'); spent++; }
  assert(spent === 5 && loadoutOf(pr).mods.engine === 5 && quote(pr, 'up:engine').error, 'upgrade maxes out at level 5');
  assert(!equipItem(pr, 'skin', null).ok, 'skin slot cannot be emptied');
  const dirty = sanitizeProfile({ keys: -5, pending: 'x', owned: { skin: ['gold', 'hax'], gun: ['nuke'] }, equipped: { skin: 'hax', gun: 'nuke' }, upgrades: { hull: 99, bogus: 3 } });
  assert(dirty.keys === 0 && dirty.pending === 0 && !dirty.owned.skin.includes('hax') && dirty.owned.gun.length === 0 && dirty.equipped.skin === 'plain' && dirty.upgrades.hull === 2 && !('bogus' in dirty.upgrades), 'sanitizeProfile repairs bad data');
}
// seasonal events: calendar + limited-time skins
{
  const d = (m, day) => new Date(2026, m - 1, day);
  assert(activeEvent(d(10, 31)) === 'halloween' && activeEvent(d(10, 14)) === null, 'halloween window');
  assert(activeEvent(d(12, 25)) === 'christmas' && activeEvent(d(1, 2)) === 'christmas' && activeEvent(d(1, 4)) === null, 'winter window wraps the new year');
  assert(activeEvent(d(2, 10)) === 'valentine' && activeEvent(d(3, 21)) === 'nowruz' && activeEvent(d(7, 4)) === null, 'other events and off-season');
  const n = nextEvent(d(11, 11));
  assert(n.id === 'christmas' && n.days === 29, 'next event counts down correctly');
  const pr = defaultProfile(); pr.keys = 100;
  assert(!buyItem(pr, 'skin:pumpkin').ok, 'event skin cannot be bought off-season');
  assert(!buyItem(pr, 'skin:pumpkin', { event: 'christmas' }).ok, 'event skin cannot be bought during a different event');
  assert(buyItem(pr, 'skin:pumpkin', { event: 'halloween' }).ok && pr.keys === 80, 'event skin can be bought during its event');
  assert(equipItem(pr, 'skin', 'pumpkin').ok && loadoutOf(pr).skin === 'pumpkin', 'an owned event skin stays equippable afterwards');
  const t = createState(1); addPlayer(t, 'a', 'A', { skin: 'frost' });
  assert(t.players.a.skin === 'frost', 'sim accepts event skins');
}

// resource packs: data only, strictly validated
{
  const throws = (fn, why) => { let threw = false; try { fn(); } catch { threw = true; } assert(threw, why); };
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const evil = JSON.parse('{"name":"<b>x</b>","images":{"chicken":"' + png + '","egg":{"src":"' + png + '","scale":99}},"colors":{"accent":"#ABCDEF","bullet":"red","overlayAlpha":5,"vests":["#112233"]},"options":{"pixel":99},"evil":"x","__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}}}');
  const ok = sanitizePack(evil);
  assert(!ok.name.includes('<') && ok.images.egg.scale === 3 && ok.images.chicken.scale === 1, 'name and image scale are sanitised');
  assert(ok.colors.accent === '#abcdef' && ok.colors.bullet === null && ok.colors.overlayAlpha === 0.6 && ok.colors.vests[0] === '#112233' && ok.colors.vests[1] === null, 'colours are validated');
  assert(ok.options.pixel === 6 && !('evil' in ok) && ({}).polluted === undefined, 'unknown keys dropped, no prototype pollution');
  throws(() => sanitizePack({ images: { chicken: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' } }), 'SVG images are rejected');
  throws(() => sanitizePack({ images: { chicken: 'javascript:alert(1)' } }), 'javascript: urls are rejected');
  throws(() => sanitizePack({ images: { chicken: 'https://example.com/a.png' } }), 'remote urls are rejected');
  throws(() => sanitizePack({ images: { chicken: 'data:image/png;base64,' + 'A'.repeat(1_000_000) } }), 'oversized images are rejected');
  throws(() => sanitizePack({ sounds: { shoot: 'data:audio/x-evil;base64,AAAA' } }), 'unknown audio types are rejected');
  throws(() => sanitizePack('nope'), 'non-objects are rejected');
  const snd = sanitizePack({ sounds: { shoot: 'data:audio/mpeg;base64,AAAA', bogus: 'data:audio/mpeg;base64,AAAA' } });
  assert(snd.sounds.shoot && !('bogus' in snd.sounds), 'valid sounds kept, unknown slots dropped');
  const e = emptyPack('x');
  assert(JSON.stringify(sanitizePack(e)) === JSON.stringify(e), 'an empty pack round-trips unchanged');
}
console.log('sim mechanics ok');

// profile API (needs the server running)
const PORT = process.env.PORT || 3000;
const base = 'http://localhost:' + PORT;
const call = async (path, body) => {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
let pid;
{
  let r = await call('/api/profile', {});
  pid = r.body.id;
  assert(/^[a-f0-9]{24}$/.test(pid) && r.body.profile.keys === 0 && r.body.profile.equipped.skin === 'plain', 'new profile starts with the default plane');
  assert((await call('/api/profile', { id: pid })).body.id === pid, 'profile is looked up by its code');
  assert((await call('/api/buy', { id: pid, item: 'skin:gold' })).status === 400, 'server refuses purchases without keys');
  assert((await call('/api/buy', { id: 'f'.repeat(24), item: 'skin:stripes' })).status === 404, 'unknown profile code');
  const run = await call('/api/run/start', { id: pid });
  r = await call('/api/run/end', { id: pid, runId: run.body.runId, keys: 999, wave: 3 });
  assert(r.status === 200 && r.body.credited > 0 && r.body.credited <= 5 && r.body.profile.pending === r.body.credited, 'run key claim is capped by elapsed time');
  assert((await call('/api/run/end', { id: pid, runId: run.body.runId, keys: 5, wave: 3 })).status === 400, 'a run can only be submitted once');
  const credited = r.body.credited;
  r = await call('/api/claim', { id: pid });
  assert(r.body.profile.keys === credited && r.body.profile.pending === 0 && r.body.claimed === credited, 'claim moves pending keys into the balance');
  assert((await call('/api/buy', { id: pid, item: 'paint:' + PALETTE[1] })).status === 200, 'buy a paint with claimed keys');
  assert((await call('/api/equip', { id: pid, slot: 'paint', value: PALETTE[2] })).status === 400, 'cannot equip unowned paint');
  assert((await call('/api/equip', { id: pid, slot: 'paint', value: PALETTE[1] })).status === 200, 'equip owned paint');
  assert((await call('/api/profile/' + pid)).body.profile.equipped.paint === PALETTE[1], 'profile persists the loadout');
  assert('event' in (await call('/api/info')).body, 'server reports the running event');
console.log('profile API ok');
}

const url = `ws://localhost:${process.env.PORT || 3000}/ws`;
const open = () => new Promise((r) => { const w = new WebSocket(url); w.on('open', () => r(w)); });
const next = (w, pred) => new Promise((r) => { const f = (d) => { const m = JSON.parse(d); if (pred(m)) { w.off('message', f); r(m); } }; w.on('message', f); });

const a = await open();
a.send(JSON.stringify({ t: 'join', name: 'A', pid, create: true }));
const room = await next(a, (m) => m.t === 'room');
const b = await open();
b.send(JSON.stringify({ t: 'join', name: 'B', room: room.code }));
await next(b, (m) => m.t === 'room' && m.players.length === 2);
a.send(JSON.stringify({ t: 'start' }));
const st = await next(b, (m) => m.t === 'state' && Object.keys(m.s.players).length === 2);
assert(st.s.players[room.you].color === PALETTE[1], 'multiplayer uses the equipped loadout from the server-side profile');
b.send(JSON.stringify({ t: 'input', input: { fire: 1, left: 1, tx: 300, ty: 400 } }));
await next(b, (m) => m.t === 'state' && m.s.bullets.length > 0);
b.send(JSON.stringify({ t: 'ping', ts: 12345 }));
const pong = await next(b, (m) => m.t === 'pong');
assert(pong.ts === 12345, 'server answers ping with the same timestamp');
b.send(JSON.stringify({ t: 'rtt', ms: 42 }));
const withPing = await next(a, (m) => m.t === 'state' && Object.values(m.s.players).some((p) => p.ping === 42));
assert(withPing, "a pilot's measured ping is shared with the room");
console.log('ping ok');
console.log('multiplayer ok, room', room.code, 'players', Object.keys(st.s.players).length);
process.exit(0);
