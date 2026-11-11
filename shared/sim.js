// Shared deterministic game simulation. Runs in the browser (single player,
// and prediction in multiplayer) and on the Node server (authoritative).
export const W = 800;
export const H = 600;

import { PALETTE, SKINS, SHOP_GUN_IDS, TRAIL_INFO } from './catalog.js';
export { PALETTE, SKINS };
const MOD_MAX = { hull: 2, engine: 5, cooling: 5, shield: 3, magnet: 3, reactor: 2 };
export const WEAPONS = ['blaster', 'pulse', 'laser', 'missile'];
export const WORLD_NAMES = ['Nebula', 'Asteroid Belt', 'Frozen Moon', 'Farm Planet', 'Neon City', 'Lava World'];

const rnd = (s) => {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// tx/ty: optional absolute target (mouse control); null = keyboard/touch steering
export const emptyInput = () => ({ left: 0, right: 0, up: 0, down: 0, fire: 0, tx: null, ty: null });
const invTime = (p) => 2.5 + 0.4 * (p.mods?.shield || 0);

export function createState(seed = (Math.random() * 1e9) >>> 0) {
  return {
    seed, t: 0, wave: 0, nid: 1, over: false, delay: 1.2, banner: '', bt: 0,
    pattern: 'grid', gx: 0, gy: 0, gdir: 1, hw: 0, flaw: true, cleared: false,
    players: {}, chickens: [], bullets: [], eggs: [], gifts: [], fxArcs: [],
  };
}

/**
 * opts comes from a profile's loadout (server-validated in multiplayer):
 * { color, skin, trail, gun, mods }. Everything is re-validated here so a hostile client can't
 * smuggle in unowned-looking values beyond what the catalog allows.
 */
export function addPlayer(s, id, name, opts = {}) {
  const n = Object.keys(s.players).length;
  const col = /^#[0-9a-f]{6}$/i.test(opts.color || '') ? opts.color : PALETTE[n % PALETTE.length];
  const mods = {};
  for (const k of Object.keys(MOD_MAX)) mods[k] = clamp(Math.floor(Number(opts.mods?.[k]) || 0), 0, MOD_MAX[k]);
  const base = SHOP_GUN_IDS.includes(opts.gun) ? opts.gun : 'blaster';
  s.players[id] = {
    id, name: String(name || 'Pilot').slice(0, 14), color: col,
    skin: SKINS.includes(opts.skin) ? opts.skin : 'plain',
    trail: TRAIL_INFO[opts.trail] ? opts.trail : 'ember',
    mods, base, weapon: base,
    x: 150 + (n % 4) * 165, y: H - 60, lives: 3 + mods.hull, score: 0, power: 1 + mods.reactor, keys: 0,
    cd: 0, inv: 2 + 0.4 * mods.shield, alive: true, rv: 0, shots: 0, hits: 0, kills: 0, input: emptyInput(),
  };
}
export const removePlayer = (s, id) => { delete s.players[id]; };
export const setInput = (s, id, input) => { if (s.players[id]) s.players[id].input = input; };

function nearest(s, x, y) {
  let best = null, bd = 1e12;
  for (const p of Object.values(s.players)) {
    if (!p.alive) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
const eggAt = (s, x, y, ang, sp) => s.eggs.push({ id: s.nid++, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp });

function spawnWave(s) {
  s.wave++;
  s.chickens = []; s.eggs = []; s.gy = 0; s.gx = 0; s.gdir = 1;
  s.flaw = true; s.cleared = false;
  const boss = s.wave % 5 === 0;
  const newWorld = (s.wave - 1) % 5 === 0 && s.wave > 1;
  const world = WORLD_NAMES[Math.floor((s.wave - 1) / 5) % WORLD_NAMES.length];
  s.banner = boss ? `Wave ${s.wave} - BOSS!` : newWorld ? `Wave ${s.wave} - ${world}` : `Wave ${s.wave}`;
  s.bt = 2.2;
  for (const p of Object.values(s.players)) {
    if (!p.alive) { p.alive = true; p.lives = 1; p.inv = invTime(p); p.rv = 0; }
  }
  const nP = Math.max(1, Object.keys(s.players).length);
  if (boss) {
    const mother = s.wave % 10 === 0; // every 10th wave: the mother hen
    const hp = (mother ? 45 + s.wave * 8 : 30 + s.wave * 6) * nP;
    s.pattern = 'boss';
    s.chickens.push({
      id: s.nid++, x: W / 2, y: 110, hp, max: hp, r: mother ? 64 : 58, boss: true, mother, fl: 0, ph: 1, bt: 2,
      ent: 0, ed: 0, side: 0,
    });
    return;
  }
  // Vest tier = hits needed: 0 none(1), 1 red(2), 2 orange(3), 3 blue(4), 4 green(5)
  const maxTier = Math.min(4, Math.floor((s.wave - 1) / 2));
  const pick = () => Math.floor(rnd(s) * (maxTier + 1));
  let idx = 0;
  const mk = (extra) => {
    const tier = pick(), hp = tier + 1, i = idx++;
    return { id: s.nid++, x: 0, y: 0, tier, hp, max: hp, r: 22, fl: 0, dv: 0, ent: 0, ed: i * 0.025, side: i % 2 ? 1 : -1, ...extra };
  };
  if (s.wave % 3 === 0) {
    s.pattern = 'ring';
    const n = Math.min(10 + s.wave * 2, 26);
    for (let i = 0; i < n; i++) {
      const outer = i % 3 !== 0;
      s.chickens.push(mk({ a: (i / n) * Math.PI * 2, R: outer ? 160 : 95, dir: outer ? 1 : -1 }));
    }
  } else {
    s.pattern = 'grid';
    const rows = Math.min(3 + Math.floor(s.wave / 3), 5);
    const cols = Math.min(6 + Math.floor(s.wave / 2), 10);
    s.hw = ((cols - 1) / 2) * 62 + 30;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        s.chickens.push(mk({ ox: (c - (cols - 1) / 2) * 62, oy: r * 54 }));
  }
}

function killChicken(s, c, owner) {
  const pts = c.boss ? 500 : 10 * (c.max || 1);
  if (owner) { owner.score += pts; owner.kills++; }
  const drops = c.boss ? 4 : rnd(s) < 0.16 ? 1 : 0;
  for (let i = 0; i < drops; i++) {
    const r = rnd(s);
    const k = r < 0.5 ? 'power' : r < 0.6 ? 'life' : r < 0.72 ? 'food' : 'wpn';
    const w = k === 'wpn' ? WEAPONS[Math.floor(rnd(s) * WEAPONS.length)] : undefined;
    s.gifts.push({ id: s.nid++, x: c.x + (i - 1.5) * 24, y: c.y, k, w });
  }
  // keys are the shop currency: tougher vests and bosses drop more
  const keys = c.boss ? (c.mother ? 5 : 3) : c.chick ? 0 : rnd(s) < 0.04 + 0.02 * (c.tier || 0) ? 1 : 0;
  for (let i = 0; i < keys; i++) s.gifts.push({ id: s.nid++, x: c.x + (i - (keys - 1) / 2) * 22, y: c.y, k: 'key' });
}

// arc caster: the bolt jumps to the nearest chickens around the one it hit
function chain(s, from, owner, n) {
  const hit = new Set([from.id]);
  let cur = from;
  for (let k = 0; k < n; k++) {
    let best = null, bd = 140 * 140;
    for (const o of s.chickens) {
      if (o.dead || hit.has(o.id) || o.ent < 1) continue;
      const d = (o.x - cur.x) ** 2 + (o.y - cur.y) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) break;
    hit.add(best.id);
    s.fxArcs.push({ x1: cur.x, y1: cur.y, x2: best.x, y2: best.y, life: 0.2 });
    damage(s, best, 1, owner);
    cur = best;
  }
}

function damage(s, c, d, owner) {
  if (c.dead || c.sh) return; // the mother hen's wing shield absorbs everything
  c.hp -= d; c.fl = 0.08;
  if (owner) owner.score += 1;
  if (c.hp <= 0) { c.dead = true; killChicken(s, c, owner); }
}

function hitPlayer(s, p) {
  if (p.inv > 0 || !p.alive) return;
  s.flaw = false;
  p.lives--; p.inv = invTime(p); p.power = Math.max(1, p.power - 1);
  if (p.lives <= 0) { p.alive = false; p.weapon = p.base || 'blaster'; p.rv = 0; }
}

const SPREAD = [[0], [-0.07, 0.07], [-0.12, 0, 0.12], [-0.18, -0.06, 0.06, 0.18], [-0.24, -0.12, 0, 0.12, 0.24]];

function fire(s, p) {
  const pw = p.power, y = p.y - 20;
  switch (p.weapon) {
    case 'pulse': { // rapid, narrow, parallel streams
      p.cd = 0.085;
      const offs = pw < 3 ? [0] : pw < 5 ? [-7, 7] : [-12, 0, 12];
      for (const o of offs) s.bullets.push({ x: p.x + o, y, vx: (rnd(s) - 0.5) * 40, vy: -860, o: p.id, w: 'p', d: 1 });
      break;
    }
    case 'laser': { // piercing beams
      p.cd = 0.17;
      const offs = pw < 3 ? [0] : pw < 5 ? [-8, 8] : [-14, 0, 14];
      for (const o of offs) s.bullets.push({ x: p.x + o, y, vx: 0, vy: -1000, o: p.id, w: 'l', d: 1, pr: 1 + pw, hit: [] });
      break;
    }
    case 'missile': { // slow homing, splash damage
      p.cd = 0.45;
      const n = pw < 3 ? 1 : pw < 5 ? 2 : 3;
      for (let i = 0; i < n; i++) s.bullets.push({ x: p.x + (i - (n - 1) / 2) * 14, y, vx: (i - (n - 1) / 2) * 90, vy: -380, o: p.id, w: 'm', d: 2, h: 1 });
      break;
    }
    case 'scatter': { // shop gun: short-range pellet burst
      p.cd = 0.55;
      const n = 5 + pw;
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1) - 0.5) * 0.9, sp = 560 + rnd(s) * 140;
        s.bullets.push({ x: p.x, y, vx: Math.sin(a) * sp, vy: -Math.cos(a) * sp, o: p.id, w: 's', d: 1, life: 0.42 });
      }
      break;
    }
    case 'arc': { // shop gun: chain lightning
      p.cd = 0.32;
      const offs = pw < 3 ? [0] : pw < 5 ? [-8, 8] : [-12, 0, 12];
      for (const o of offs) s.bullets.push({ x: p.x + o, y, vx: 0, vy: -900, o: p.id, w: 'a', d: 1 });
      break;
    }
    case 'drone': { // shop gun: straight shot plus two homing wingmen
      p.cd = 0.22;
      s.bullets.push({ x: p.x, y, vx: 0, vy: -720, o: p.id, w: 'b', d: 1 });
      for (const side of [-1, 1]) {
        s.bullets.push({ x: p.x + side * 34, y: p.y - 4 + 8 * Math.sin(s.t * 3 + side), vx: side * 40, vy: -300, o: p.id, w: 'd', d: 1, h: 1 });
      }
      break;
    }
    default: {
      p.cd = 0.2;
      for (const a of SPREAD[pw - 1])
        s.bullets.push({ x: p.x, y, vx: Math.sin(a) * 700, vy: -Math.cos(a) * 700, o: p.id, w: 'b', d: 1 });
    }
  }
  p.cd *= 1 - 0.05 * (p.mods?.cooling || 0); // gun cooling upgrade
}

function bossAttack(s, c) {
  const tg = nearest(s, c.x, c.y);
  const sp = 200 + s.wave * 4;
  if (c.ph === 1) { // fan
    for (const a of [-0.35, 0, 0.35]) eggAt(s, c.x, c.y + 40, Math.PI / 2 + a, sp);
    c.bt = 1.2;
  } else if (c.ph === 2) { // aimed volley
    const base = tg ? Math.atan2(tg.y - c.y, tg.x - c.x) : Math.PI / 2;
    for (const a of [-0.3, -0.15, 0, 0.15, 0.3]) eggAt(s, c.x, c.y + 40, base + a, sp + 50);
    c.bt = 1.0;
  } else { // enraged: rotating ring
    const n = 14, rot = s.t * 0.9;
    for (let i = 0; i < n; i++) eggAt(s, c.x, c.y, rot + (i / n) * Math.PI * 2, sp - 20);
    c.bt = 1.5;
  }
}

export function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  if (s.bt > 0) s.bt -= dt;
  if (s.fxArcs && s.fxArcs.length) s.fxArcs = s.fxArcs.filter((a) => (a.life -= dt) > 0);
  const players = Object.values(s.players);

  // players (+ co-op revive)
  for (const p of players) {
    p.cd -= dt; if (p.inv > 0) p.inv -= dt;
    if (!p.alive) {
      let near = false;
      for (const q of players) if (q.alive && (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < 46 * 46) near = true;
      p.rv = near ? p.rv + dt : Math.max(0, p.rv - dt);
      if (p.rv >= 1.5) { p.alive = true; p.lives = 1; p.inv = invTime(p); p.rv = 0; }
      continue;
    }
    const i = p.input;
    const sp = 340 * (1 + 0.06 * (p.mods?.engine || 0));
    if (Number.isFinite(i.tx) && Number.isFinite(i.ty)) { // mouse: glide toward the cursor
      const dx = i.tx - p.x, dy = i.ty - p.y, d = Math.hypot(dx, dy);
      if (d > 0.5) { const m = Math.min(d, sp * 1.35 * dt); p.x += (dx / d) * m; p.y += (dy / d) * m; }
    } else {
      p.x += ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * sp * dt;
      p.y += ((i.down ? 1 : 0) - (i.up ? 1 : 0)) * sp * dt;
    }
    p.x = clamp(p.x, 24, W - 24);
    p.y = clamp(p.y, H * 0.45, H - 30);
    if (i.fire && p.cd <= 0) { const n0 = s.bullets.length; fire(s, p); p.shots += s.bullets.length - n0; }
  }

  // chickens
  if (s.pattern === 'grid') {
    s.gx += s.gdir * (55 + s.wave * 4) * dt;
    const lim = W / 2 - s.hw;
    if (Math.abs(s.gx) > lim) { s.gx = Math.sign(s.gx) * lim; s.gdir *= -1; s.gy += 14; }
  } else if (s.pattern === 'ring') {
    s.gy = Math.min(70, s.gy + 3 * dt);
  }
  let divers = 0, chicks = 0;
  for (const c of s.chickens) { if (c.dv) divers++; if (c.chick) chicks++; }
  const maxDivers = s.wave >= 2 ? 1 + Math.floor(s.wave / 4) : 0;

  for (const c of s.chickens) {
    if (c.fl > 0) c.fl -= dt;
    if (c.chick) { // mother hen's chicks: free-flying, drift down and away
      c.x += c.vx * dt; c.y += c.vy * dt; c.vx += Math.sin(s.t * 3 + c.id) * 40 * dt;
      if (c.y > H + 30 || c.x < -40 || c.x > W + 40) c.dead = true;
      continue;
    }
    let bx, by;
    if (c.boss) {
      const ratio = c.hp / c.max;
      c.ph = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
      c.sh = c.mother && c.ph === 3 && s.t % 6 > 4 ? 1 : 0; // wings shield every 6s
      bx = W / 2 + Math.sin(s.t * (0.6 + 0.25 * c.ph)) * 250;
      by = 110 + Math.sin(s.t * 1.3) * 20;
    } else if (s.pattern === 'grid') { bx = W / 2 + s.gx + c.ox; by = 80 + s.gy + c.oy; }
    else { const a = c.a + s.t * 0.8 * c.dir; bx = W / 2 + Math.cos(a) * c.R; by = 190 + s.gy + Math.sin(a) * c.R * 0.55; }
    c.x = bx; c.y = by;

    if (c.ent < 1) { // fly-in entrance: harmless and untouchable until in formation
      if (c.ed > 0) c.ed -= dt; else c.ent = Math.min(1, c.ent + dt / 0.9);
      const e = 1 - (1 - c.ent) ** 3;
      c.x = bx + (1 - e) * (c.side || 0) * 320;
      c.y = by - (1 - e) * 330;
      if (c.ed > 0) c.y = -200;
      continue;
    }

    if (!c.boss) {
      // dive-bomb: peel off toward a player, swoop, return to formation
      if (!c.dv && divers < maxDivers && rnd(s) < 0.015 * dt) {
        const tg = nearest(s, bx, by);
        if (tg) { c.dv = 1; c.dvt = 0; c.dvx = tg.x; divers++; }
      }
      if (c.dv) {
        c.dvt += dt;
        const u = c.dvt / 2.6;
        if (u >= 1) c.dv = 0;
        else {
          const e = Math.sin(u * Math.PI);
          c.x = bx + (c.dvx - bx) * e * 0.9 + Math.sin(u * Math.PI * 3) * 28 * e;
          c.y = by + (H - 150 - by) * e;
        }
      }
      // egg drops: tiers behave differently (blue aims, green fires a triple)
      if (rnd(s) < (0.07 + s.wave * 0.008) * dt) {
        const sp = 210 + s.wave * 8, down = Math.PI / 2;
        if (c.tier === 4) for (const a of [-0.3, 0, 0.3]) eggAt(s, c.x, c.y + 14, down + a, sp);
        else if (c.tier === 3) {
          const tg = nearest(s, c.x, c.y);
          eggAt(s, c.x, c.y + 14, tg ? Math.atan2(tg.y - c.y, tg.x - c.x) : down, sp + 30);
        } else eggAt(s, c.x, c.y + 14, down, sp);
      }
    } else {
      c.bt -= dt;
      if (c.bt <= 0) bossAttack(s, c);
      if (c.mother && c.ph >= 2) { // nest spawns chicks
        c.cb = (c.cb ?? 1.5) - dt;
        if (c.cb <= 0 && chicks < 8) {
          c.cb = 2.2;
          for (const sx of [-1, 1]) {
            s.chickens.push({
              id: s.nid++, x: c.x + sx * 20, y: c.y - 30, vx: sx * (60 + rnd(s) * 40), vy: 70 + rnd(s) * 30,
              hp: 1, max: 1, tier: 0, r: 13, fl: 0, chick: true, ent: 1,
            });
            chicks++;
          }
        }
      }
    }
    if (by > H - 120) {
      s.over = true; s.banner = 'The chickens landed!';
      for (const p of players) { p.alive = false; p.lives = 0; }
    }
  }

  // bullets
  for (const b of s.bullets) {
    if (b.h) { // homing
      let best = null, bd = 1e12;
      for (const c of s.chickens) { if (c.ent < 1) continue; const d = (c.x - b.x) ** 2 + (c.y - b.y) ** 2; if (d < bd) { bd = d; best = c; } }
      const sp = Math.min(520, Math.hypot(b.vx, b.vy) + 700 * dt);
      let ang = Math.atan2(b.vy, b.vx);
      if (best) {
        let da = Math.atan2(best.y - b.y, best.x - b.x) - ang;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        ang += clamp(da, -5 * dt, 5 * dt);
      }
      b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.life !== undefined && (b.life -= dt) <= 0) { b.dead = true; continue; } // scatter pellets fall off
    if (b.y < -30 || b.y > H + 30 || b.x < -30 || b.x > W + 30) { b.dead = true; continue; }
    const owner = s.players[b.o];
    for (const c of s.chickens) {
      if (c.dead || c.ent < 1 || (b.hit && b.hit.includes(c.id))) continue;
      const dx = b.x - c.x, dy = b.y - c.y;
      if (dx * dx + dy * dy < (c.r + 4) * (c.r + 4)) {
        if (owner) owner.hits++;
        damage(s, c, b.d, owner);
        if (b.w === 'a') chain(s, c, owner, 2 + Math.floor((owner?.power || 1) / 2));
        if (b.w === 'm') { // splash
          for (const o of s.chickens) if (o !== c && !o.dead && !(o.ent < 1) && (o.x - c.x) ** 2 + (o.y - c.y) ** 2 < 55 * 55) damage(s, o, 1, owner);
        }
        if (b.pr) { b.hit.push(c.id); if (--b.pr <= 0) b.dead = true; } else b.dead = true;
        if (b.dead) break;
      }
    }
  }
  s.bullets = s.bullets.filter((b) => !b.dead);
  s.chickens = s.chickens.filter((c) => !c.dead);
  if (s.pattern === 'boss' && !s.chickens.some((c) => c.boss)) s.chickens = []; // chicks leave with the mother

  // eggs
  for (const e of s.eggs) {
    e.x += (e.vx || 0) * dt; e.y += e.vy * dt;
    if (e.y > H + 20 || e.y < -40 || e.x < -20 || e.x > W + 20) { e.dead = true; continue; }
    for (const p of players) {
      if (!p.alive) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy < 20 * 20) { e.dead = true; hitPlayer(s, p); break; }
    }
  }
  s.eggs = s.eggs.filter((e) => !e.dead);

  // chicken body contact
  for (const c of s.chickens)
    if (!(c.ent < 1))
      for (const p of players)
        if (p.alive && p.inv <= 0) {
          const dx = c.x - p.x, dy = c.y - p.y, r = c.r + 14;
          if (dx * dx + dy * dy < r * r) hitPlayer(s, p);
        }

  // gifts
  for (const g of s.gifts) {
    g.y += 130 * dt;
    if (g.y > H + 20) { g.dead = true; continue; }
    for (const p of players) {
      if (!p.alive) continue;
      const mag = p.mods?.magnet || 0;
      let dx = g.x - p.x, dy = g.y - p.y;
      if (mag && dx * dx + dy * dy < (100 + mag * 45) ** 2) { // magnet upgrade pulls drops in
        const d = Math.hypot(dx, dy) || 1;
        g.x -= (dx / d) * 170 * dt; g.y -= (dy / d) * 170 * dt; dx = g.x - p.x; dy = g.y - p.y;
      }
      const rr = 30 * (1 + 0.25 * mag);
      if (dx * dx + dy * dy < rr * rr) {
        g.dead = true;
        if (g.k === 'power') p.power = Math.min(5, p.power + 1);
        else if (g.k === 'life') p.lives = Math.min(5, p.lives + 1);
        else if (g.k === 'key') p.keys = (p.keys || 0) + 1;
        else if (g.k === 'wpn') { if (p.weapon === g.w) p.power = Math.min(5, p.power + 1); else p.weapon = g.w; }
        p.score += g.k === 'food' ? 100 : 25;
        break;
      }
    }
  }
  s.gifts = s.gifts.filter((g) => !g.dead);

  // wave flow / game over
  if (players.length && players.every((p) => !p.alive)) { s.over = true; if (!s.banner.includes('landed')) s.banner = 'Game over'; return; }
  if (s.chickens.length === 0) {
    if (s.wave > 0 && !s.cleared) {
      s.cleared = true;
      if (s.flaw) { // co-op bonus: nobody got hit this wave
        for (const p of players) if (p.alive) p.score += 200;
        s.banner = 'Flawless! +200'; s.bt = 2;
      }
    }
    s.delay -= dt;
    if (s.delay <= 0) { spawnWave(s); s.delay = 2.4; }
  }
}
