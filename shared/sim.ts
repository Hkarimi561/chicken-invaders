// Shared deterministic game simulation. Runs in the browser (single player, replays,
// and prediction in multiplayer) and on the Node server (authoritative).
export const W = 800;
export const H = 600;
/** Bump whenever a change would make an old recording play out differently. */
export const SIM_VERSION = 7;

import { PALETTE, SKINS, SHOP_GUN_IDS, TRAIL_INFO } from './catalog';
import type { State, Player, Input, Loadout } from './types';
export type { State, Player, Input, Loadout, Chicken, Bullet, Egg, Gift } from './types';
export { PALETTE, SKINS };
const MOD_MAX = { hull: 2, engine: 5, cooling: 5, shield: 3, magnet: 3, reactor: 2 };
export const WEAPONS = ['blaster', 'pulse', 'laser', 'missile'];
export const WORLD_NAMES = ['Nebula', 'Asteroid Belt', 'Frozen Moon', 'Farm Planet', 'Neon City', 'Lava World'];

// Optional run rules. Each one makes the run harder and pays more: +25% key drops and +20% score each.
export const MUTATORS = {
  rapid: { name: 'Egg storm', desc: 'Chickens lay twice as fast' },
  glass: { name: 'Glass hull', desc: 'One life only; no extra lives' },
  swarm: { name: 'Swarm', desc: 'Far more chickens in every wave' },
  drought: { name: 'Drought', desc: 'No power-ups: only keys fall' },
  heavy: { name: 'Thick hides', desc: 'Every chicken has +1 hit point' },
  fast: { name: 'Hyperdrive', desc: 'Chickens move 35% faster' },
};
export const MUT_IDS = Object.keys(MUTATORS);

// Co-op roles: each has a passive perk and an ability that charges from kills (and slowly over time).
export const ROLES = {
  ace: { name: 'Ace', icon: 'A', color: '#ffb300', ability: 'Nova', desc: 'Balanced. Nova: damages every chicken and wipes all eggs.' },
  striker: { name: 'Striker', icon: 'S', color: '#ff5252', ability: 'Super Nova', desc: 'Fires 12% faster and charges 25% quicker. A harder-hitting Nova.' },
  tank: { name: 'Tank', icon: 'T', color: '#42a5f5', ability: 'Aegis', desc: '+1 life, a little slower. Aegis: a shield dome for the whole team.' },
  medic: { name: 'Medic', icon: 'M', color: '#69f0ae', ability: 'Mend', desc: 'Revives allies twice as fast. Mend: heals and revives everyone nearby.' },
};
export const ROLE_IDS = Object.keys(ROLES);

export const BOSS_KINDS = ['rooster', 'mother', 'sweeper', 'splitter', 'mirror', 'colonel', 'bomber', 'timewarp', 'magnet', 'ghost', 'lava', 'diva', 'cloner', 'tank', 'iceq'];
export const BOSS_NAMES = {
  rooster: 'Rooster King', mother: 'Mother Hen', sweeper: 'Laser Sweeper', splitter: 'The Splitter', mirror: 'Mirror Hen',
  colonel: 'Colonel Cluck', bomber: 'Egg Bomber', timewarp: 'Time Warp Hen', magnet: 'Magnet Rooster', ghost: 'Ghost Hen',
  lava: 'Lava Chicken', diva: 'Disco Diva', cloner: 'Cloner Cluck', tank: 'Armor Tank Hen', iceq: 'Ice Queen',
};

const rnd = (s: State) => {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// tx/ty: optional absolute target (mouse/gyro); ab: ability button; null = keyboard/touch steering
export const emptyInput = (): Input => ({ left: 0, right: 0, up: 0, down: 0, fire: 0, ab: 0, tx: null, ty: null });
const invTime = (p: Player) => 2.5 + 0.4 * (p.mods?.shield || 0);

/**
 * opts: { mut: [ids], rush, daily, event }. `mut` is filtered against MUTATORS so a hostile client
 * cannot invent rules; `event` is cosmetic (event boss costume + bonus keys).
 */
export function createState(seed: number = (Math.random() * 1e9) >>> 0, opts: any = {}): State {
  const mut: string[] = [...new Set<string>((Array.isArray(opts.mut) ? opts.mut : []).filter((id) => MUT_IDS.includes(id)))];
  return {
    seed, t: 0, tick: 0, wave: 0, eff: 0, nid: 1, over: false, delay: 1.2, banner: '', bt: 0,
    pattern: 'grid', gx: 0, gy: 0, gdir: 1, hw: 0, flaw: true, cleared: false,
    mut, rush: !!opts.rush, daily: !!opts.daily, ev: typeof opts.event === 'string' && /^[a-z]{3,12}$/.test(opts.event) ? opts.event : null,
    smul: 1 + 0.2 * mut.length, kmul: 1 + 0.25 * mut.length,
    players: {}, chickens: [], bullets: [], eggs: [], gifts: [], fxArcs: [], fxPulse: [], meteors: [], meteorWave: false, mt: 0, zones: [],
  };
}

/**
 * opts comes from a profile's loadout (server-validated in multiplayer):
 * { color, skin, trail, gun, mods, role }. Everything is re-validated here so a hostile client can't
 * smuggle in unowned-looking values beyond what the catalog allows.
 */
export function addPlayer(s: State, id: string, name: string, opts: any = {}) {
  const n = Object.keys(s.players).length;
  const col = /^#[0-9a-f]{6}$/i.test(opts.color || '') ? opts.color : PALETTE[n % PALETTE.length];
  const mods: Record<string, number> = {};
  for (const k of Object.keys(MOD_MAX)) mods[k] = clamp(Math.floor(Number(opts.mods?.[k]) || 0), 0, MOD_MAX[k]);
  const base = SHOP_GUN_IDS.includes(opts.gun) ? opts.gun : 'blaster';
  const role = ROLE_IDS.includes(opts.role) ? opts.role : 'ace';
  let lives = Math.min(5, 3 + mods.hull + (role === 'tank' ? 1 : 0));
  if (s.mut && s.mut.includes('glass')) lives = 1;
  s.players[id] = {
    id, name: String(name || 'Pilot').slice(0, 14), color: col, role,
    skin: SKINS.includes(opts.skin) ? opts.skin : 'plain',
    trail: TRAIL_INFO[opts.trail] ? opts.trail : 'ember',
    mods, base, weapon: base,
    x: 150 + (n % 4) * 165, y: H - 60, lives, score: 0, power: 1 + mods.reactor, keys: 0,
    cd: 0, heat: 0, oh: false, ice: 0, inv: 2 + 0.4 * mods.shield, alive: true, rv: 0, shots: 0, hits: 0, kills: 0,
    charge: 0, abHeld: 0, st: { bosses: 0, flawless: 0, novas: 0, mends: 0, revives: 0 },
    input: emptyInput(),
  };
}
export const removePlayer = (s: State, id) => { delete s.players[id]; };
export const setInput = (s: State, id, input) => { if (s.players[id]) s.players[id].input = input; };

function nearest(s: State, x, y) {
  let best = null, bd = 1e12;
  for (const p of Object.values(s.players)) {
    if (!p.alive) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
const eggAt = (s: State, x, y, ang, sp) => s.eggs.push({ id: s.nid++, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp });
const has = (s: State, id) => s.mut.includes(id);

function bossKindFor(s: State) {
  const idx = s.rush ? s.wave - 1 : Math.floor(s.wave / 5) - 1;
  return BOSS_KINDS[((idx % BOSS_KINDS.length) + BOSS_KINDS.length) % BOSS_KINDS.length];
}

// Hazard zones used by the newer bosses: falling bombs, lava, clock bubbles, disco lanes and frost patches.
const zone = (s: State, z) => { s.zones.push({ id: s.nid++, t: 0, ...z }); };
const slowP = (p: Player, f: number) => { p.slf = Math.min(p.slw > 0 ? p.slf || 1 : 1, f); p.slw = 0.15; };
const ring = (s: State, x, y, n, sp, rot = 0) => { for (let i = 0; i < n; i++) eggAt(s, x, y, rot + (i / n) * Math.PI * 2, sp); };

function spawnWave(s: State) {
  s.wave++;
  s.chickens = []; s.eggs = []; s.meteors = []; s.zones = []; s.gy = 0; s.gx = 0; s.gdir = 1;
  s.flaw = true; s.cleared = false;
  const boss = s.rush || s.wave % 5 === 0;
  // every fourth wave (that is not a boss wave) is a meteor strike: the chickens stop laying, rocks fall instead
  s.meteorWave = !boss && s.wave >= 4 && s.wave % 4 === 0;
  s.mt = 2.5;
  s.eff = s.rush ? s.wave * 5 : s.wave; // what difficulty scales with (a rush wave is a whole boss)
  const kind = boss ? bossKindFor(s) : null;
  const newWorld = (s.wave - 1) % 5 === 0 && s.wave > 1;
  const world = WORLD_NAMES[Math.floor((s.rush ? s.eff - 1 : s.wave - 1) / 5) % WORLD_NAMES.length];
  s.banner = boss ? (s.rush ? `Boss Rush ${s.wave} - ${BOSS_NAMES[kind]}` : `Wave ${s.wave} - ${BOSS_NAMES[kind]}`)
    : newWorld ? `Wave ${s.wave} - ${world}` : `Wave ${s.wave}`;
  if (s.meteorWave) s.banner += ' - Meteor strike!';
  s.bt = 2.2;
  for (const p of Object.values(s.players)) {
    if (!p.alive) { p.alive = true; p.lives = 1; p.inv = invTime(p); p.rv = 0; }
  }
  const nP = Math.max(1, Object.keys(s.players).length);
  if (boss) {
    const base = {
      rooster: 30 + s.eff * 6, mother: 45 + s.eff * 8, sweeper: 34 + s.eff * 6, splitter: 36 + s.eff * 6, mirror: 32 + s.eff * 6,
      colonel: 34 + s.eff * 6, bomber: 32 + s.eff * 6, timewarp: 34 + s.eff * 6, magnet: 34 + s.eff * 6, ghost: 30 + s.eff * 6,
      lava: 36 + s.eff * 6, diva: 34 + s.eff * 6, cloner: 36 + s.eff * 6, tank: 40 + s.eff * 7, iceq: 36 + s.eff * 6,
    }[kind];
    const hp = base * nP;
    s.pattern = 'boss';
    s.chickens.push({
      id: s.nid++, x: W / 2, y: 110, hp, max: hp, r: kind === 'mother' ? 64 : 58, boss: true, kind, mother: kind === 'mother',
      fl: 0, ph: 1, bt: 2, ent: 0, ed: 0, side: 0, ev: s.ev, ...(kind === 'tank' ? { arm: 3, ab: 0 } : {}),
    });
    return;
  }
  // Vest tier = hits needed: 0 none(1), 1 red(2), 2 orange(3), 3 blue(4), 4 green(5)
  const maxTier = Math.min(4, Math.floor((s.wave - 1) / 2));
  const pick = () => Math.floor(rnd(s) * (maxTier + 1));
  const swarm = has(s, 'swarm'), heavy = has(s, 'heavy') ? 1 : 0;
  let idx = 0;
  const mk = (extra) => {
    const tier = pick(), hp = tier + 1 + heavy, i = idx++;
    return { id: s.nid++, x: 0, y: 0, tier, hp, max: hp, r: 22, fl: 0, dv: 0, ent: 0, ed: i * 0.025, side: i % 2 ? 1 : -1, ...extra };
  };
  if (s.wave % 3 === 0) {
    s.pattern = 'ring';
    const n = Math.min(Math.round((10 + s.wave * 2) * (swarm ? 1.4 : 1)), swarm ? 34 : 26);
    for (let i = 0; i < n; i++) {
      const outer = i % 3 !== 0;
      s.chickens.push(mk({ a: (i / n) * Math.PI * 2, R: outer ? 160 : 95, dir: outer ? 1 : -1 }));
    }
  } else {
    s.pattern = 'grid';
    const rows = Math.min(3 + Math.floor(s.wave / 3) + (swarm ? 1 : 0), swarm ? 6 : 5);
    const cols = Math.min(6 + Math.floor(s.wave / 2) + (swarm ? 2 : 0), swarm ? 12 : 10);
    s.hw = ((cols - 1) / 2) * 62 + 30;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        s.chickens.push(mk({ ox: (c - (cols - 1) / 2) * 62, oy: r * 54 }));
  }
}

function killChicken(s: State, c, owner: Player) {
  const pts = Math.round((c.boss ? 500 : 10 * (c.max || 1)) * s.smul);
  if (owner) {
    owner.score += pts; owner.kills++;
    owner.charge = Math.min(100, (owner.charge || 0) + (c.boss ? 40 : 3 + 2 * (c.max || 1)));
    if (c.boss) owner.st.bosses++;
  }
  const noDrops = has(s, 'drought') || c.mini || c.dec || c.sol;
  const drops = noDrops ? 0 : c.boss ? 4 : rnd(s) < 0.16 ? 1 : 0;
  for (let i = 0; i < drops; i++) {
    const r = rnd(s);
    let k = r < 0.45 ? 'power' : r < 0.55 ? 'life' : r < 0.65 ? 'food' : r < 0.78 ? 'ice' : 'wpn';
    if (k === 'life' && has(s, 'glass')) k = 'food'; // glass hull: no extra lives
    const w = k === 'wpn' ? WEAPONS[Math.floor(rnd(s) * WEAPONS.length)] : undefined;
    s.gifts.push({ id: s.nid++, x: c.x + (i - 1.5) * 24, y: c.y, k, w });
  }
  // keys are the shop currency: tougher vests, bosses, event bosses and harder rules drop more
  const chance = (0.04 + 0.02 * (c.tier || 0)) * s.kmul;
  const keys = c.boss ? (c.mother ? 5 : 3) + (c.ev ? 2 : 0) + s.mut.length : c.chick || c.mini || c.dec || c.sol ? 0 : rnd(s) < chance ? 1 : 0;
  for (let i = 0; i < keys; i++) s.gifts.push({ id: s.nid++, x: c.x + (i - (keys - 1) / 2) * 22, y: c.y, k: 'key' });
}

// arc caster: the bolt jumps to the nearest chickens around the one it hit
function chain(s: State, from, owner: Player, n) {
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

function damage(s: State, c, d, owner: Player) {
  if (c.dead || c.sh || c.hid) return; // a shield (mother hen wings, splitter while its pieces live) absorbs everything
  if (c.kind === 'tank' && c.boss && c.arm > 0 && !c.open) { // front armor soaks hits; every 8 absorbed breaks a plate
    c.fl = 0.08; c.ab = (c.ab || 0) + d;
    if (c.ab >= 8) { c.ab = 0; c.arm--; }
    return;
  }
  c.hp -= d; c.fl = 0.08;
  if (owner) owner.score += 1;
  if (c.hp <= 0) { c.dead = true; killChicken(s, c, owner); }
}

function hitPlayer(s: State, p: Player) {
  if (p.inv > 0 || !p.alive) return;
  s.flaw = false;
  p.lives--; p.inv = invTime(p); p.power = Math.max(1, p.power - 1);
  if (p.lives <= 0) { p.alive = false; p.weapon = p.base || 'blaster'; p.rv = 0; }
}

const SPREAD = [[0], [-0.07, 0.07], [-0.12, 0, 0.12], [-0.18, -0.06, 0.06, 0.18], [-0.24, -0.12, 0, 0.12, 0.24]];

function fire(s: State, p: Player) {
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
  if (p.slw > 0) p.cd /= p.slf || 1; // inside a clock bubble or frost: the gun is slow too
  if (p.role === 'striker') p.cd *= 0.88;
  // overheating: every shot adds heat in proportion to the weapon's delay; the cooling upgrade makes it build slower
  if (p.ice <= 0) {
    p.heat = Math.min(1, p.heat + p.cd * HEAT_PER_SEC * (1 - 0.08 * (p.mods?.cooling || 0)));
    if (p.heat >= 1) p.oh = true;
  }
}
const HEAT_PER_SEC = 0.3;   // continuous fire overheats in about 3.3 s
const COOL_IDLE = 0.55;     // heat lost per second while not firing
const COOL_LOCK = 0.32;     // ... while locked out (until it falls under OH_RESUME)
const OH_RESUME = 0.35;

// ---------- role abilities ----------
const pulse = (s: State, p: Player, kind, r) => s.fxPulse.push({ id: s.nid++, kind, x: p.x, y: p.y, r, life: 0.8, max: 0.8, o: p.id });
const within = (a, b, r) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < r * r;

function useAbility(s: State, p: Player) {
  p.charge = 0; p.st.novas++;
  const players = Object.values(s.players);
  if (p.role === 'tank') { // Aegis: a shield dome over the team
    for (const q of players) if (q.alive && within(q, p, 170)) q.inv = Math.max(q.inv, 3);
    s.eggs = s.eggs.filter((e) => !within(e, p, 170));
    pulse(s, p, 'aegis', 170);
  } else if (p.role === 'medic') { // Mend: heal and revive everyone nearby
    for (const q of players) {
      if (!within(q, p, 200)) continue;
      if (!q.alive) { q.alive = true; q.lives = 1; q.inv = invTime(q); q.rv = 0; p.st.revives++; }
      else if (q.lives < 5 && !has(s, 'glass')) { q.lives++; p.st.mends++; }
    }
    pulse(s, p, 'mend', 200);
  } else { // Nova (Ace) / Super Nova (Striker): damage everything, wipe the eggs
    const dmg = p.role === 'striker' ? 4 : 3;
    for (const c of s.chickens) if (!c.dead && c.ent >= 1) damage(s, c, c.boss ? Math.max(dmg, Math.ceil(c.max * 0.06)) : dmg, p);
    s.eggs = [];
    p.inv = Math.max(p.inv, 1.5);
    pulse(s, p, 'nova', 520);
  }
}

function bossAttack(s: State, c) {
  const tg = nearest(s, c.x, c.y);
  const sp = 200 + (s.eff || s.wave) * 4;
  const slow = has(s, 'rapid') ? 0.6 : 1;
  c.n = (c.n || 0) + 1;
  const odd = c.n % 2 === 1;
  const alive = Object.values(s.players).filter((p) => p.alive);
  const pick = () => (alive.length ? alive[Math.floor(rnd(s) * alive.length)] : null);
  if (c.kind === 'bomber' && odd) { // giant eggs: a warning circle shows where each one lands; shoot them down to defuse
    for (let i = 0; i < c.ph; i++) {
      const p = pick();
      const x = clamp((p ? p.x : W / 2) + (i ? (rnd(s) - 0.5) * 200 : 0), 60, W - 60);
      const y = clamp((p ? p.y : H - 120) + (i ? (rnd(s) - 0.5) * 120 : 0), H * 0.45, H - 40);
      zone(s, { k: 'bomb', x, y, sx: c.x, sy: c.y + 40, cx: c.x, cy: c.y + 40, fall: 1.5, r: 78, hp: 2 });
    }
    c.bt = 2.4 * slow; return;
  }
  if (c.kind === 'timewarp' && odd && !s.zones.some((z) => z.k === 'clock')) { // a clock bubble that chases a pilot
    zone(s, { k: 'clock', x: tg ? tg.x : W / 2, y: tg ? tg.y : H - 100, r: 90, life: 4.5 });
    c.bt = 2.4 * slow; return;
  }
  if (c.kind === 'lava' && odd) { // fireballs leave lava puddles that burn for 5 s
    const n = 2 + c.ph;
    for (let i = 0; i < n && s.zones.filter((z) => z.k === 'lava').length < 9; i++) {
      const p = pick();
      zone(s, { k: 'lava', x: clamp((p ? p.x : W / 2) + (rnd(s) - 0.5) * 240, 50, W - 50), y: clamp((p ? p.y : H - 100) + (rnd(s) - 0.5) * 160, H * 0.5, H - 40), sx: c.x, sy: c.y + 40, fall: 0.9, life: 5, r: 42 });
    }
    c.bt = 2.3 * slow; return;
  }
  if (c.kind === 'diva') { // lit floor lanes flash, then strike on the beat together with a laser ring
    const L = 8, lw = W / L, cols = new Set<number>();
    if (tg) cols.add(clamp(Math.floor(tg.x / lw), 0, L - 1));
    while (cols.size < 1 + c.ph) cols.add(Math.floor(rnd(s) * L));
    let first = true;
    for (const col of cols) { zone(s, { k: 'lane', x: (col + 0.5) * lw, w: lw, warn: 1.0, on: 0.35, col, ring: first }); first = false; }
    c.bt = (2.8 - 0.2 * c.ph) * slow; return;
  }
  if (c.kind === 'iceq') {
    if (odd) { // aimed ice shards: a hit freezes a pilot instead of costing a life
      const base = tg ? Math.atan2(tg.y - c.y, tg.x - c.x) : Math.PI / 2, n = 2 + c.ph;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.22, v = sp + 40;
        s.eggs.push({ id: s.nid++, x: c.x, y: c.y + 40, vx: Math.cos(a) * v, vy: Math.sin(a) * v, fz: 1 });
      }
      c.bt = 1.4 * slow; return;
    }
    if (s.zones.filter((z) => z.k === 'frost').length < 3) { const p = pick(); zone(s, { k: 'frost', x: clamp((p ? p.x : W / 2) + (rnd(s) - 0.5) * 160, 70, W - 70), y: clamp((p ? p.y : H - 100), H * 0.55, H - 50), r: 95, life: 7 }); }
  }
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
  if (c.kind === 'mirror') c.bt *= 0.75;
  if (c.kind === 'sweeper') c.bt *= 1.35;
  c.bt *= slow;
}

export function step(s: State, dt) {
  if (s.over) return;
  s.t += dt;
  s.tick = (s.tick || 0) + 1;
  if (s.bt > 0) s.bt -= dt;
  if (s.fxArcs && s.fxArcs.length) s.fxArcs = s.fxArcs.filter((a) => (a.life -= dt) > 0);
  if (s.fxPulse && s.fxPulse.length) s.fxPulse = s.fxPulse.filter((a) => (a.life -= dt) > 0);
  const players = Object.values(s.players);

  // players (+ co-op revive)
  for (const p of players) {
    p.cd -= dt; if (p.inv > 0) p.inv -= dt;
    if (p.ice > 0) p.ice = Math.max(0, p.ice - dt);
    if (p.frz > 0) p.frz = Math.max(0, p.frz - dt);
    if (p.slw > 0) p.slw = Math.max(0, p.slw - dt);
    if (p.wt > 0 && (p.wt -= dt) <= 0) { p.wt = 0; p.weapon = p.base || 'blaster'; } // a picked-up gun wears off and the shop gun returns
    if (p.alive) {
      const firing = p.input.fire && !p.oh;
      if (p.oh) { p.heat = Math.max(0, p.heat - COOL_LOCK * dt); if (p.heat <= OH_RESUME) p.oh = false; }
      else if (!firing) p.heat = Math.max(0, p.heat - COOL_IDLE * dt * (1 + 0.1 * (p.mods?.cooling || 0)));
    }
    if (!p.alive) {
      p.abHeld = 0;
      let near = false, med = false, who = null;
      for (const q of players) if (q.alive && within(q, p, 46)) { near = true; if (q.role === 'medic') med = true; who = q; }
      p.rv = near ? p.rv + dt * (med ? 2 : 1) : Math.max(0, p.rv - dt);
      if (p.rv >= 1.5) { p.alive = true; p.lives = 1; p.inv = invTime(p); p.rv = 0; if (who) who.st.revives++; }
      continue;
    }
    const i = p.input;
    p.charge = Math.min(100, (p.charge || 0) + dt * 2 * (p.role === 'striker' ? 1.25 : 1));
    if (i.ab && !p.abHeld && p.charge >= 100) useAbility(s, p);
    p.abHeld = i.ab ? 1 : 0;
    const frozen = p.frz > 0;
    const sp = 340 * (1 + 0.06 * (p.mods?.engine || 0)) * (p.role === 'tank' ? 0.92 : 1) * (p.slw > 0 ? p.slf || 1 : 1) * (frozen ? 0 : 1);
    if (Number.isFinite(i.tx) && Number.isFinite(i.ty)) { // mouse / gyro: glide toward the target
      const dx = i.tx - p.x, dy = i.ty - p.y, d = Math.hypot(dx, dy);
      if (d > 0.5) { const m = Math.min(d, sp * 1.35 * dt); p.x += (dx / d) * m; p.y += (dy / d) * m; }
    } else {
      p.x += ((i.right ? 1 : 0) - (i.left ? 1 : 0)) * sp * dt;
      p.y += ((i.down ? 1 : 0) - (i.up ? 1 : 0)) * sp * dt;
    }
    const mg = s.chickens.find((c) => c.kind === 'magnet' && c.boss && c.pl);
    if (mg) { // magnet rooster: a steady pull toward him (you can out-fly it)
      const pull = 70 + 35 * mg.ph, dx = mg.x - p.x, dy = mg.y - p.y, d = Math.hypot(dx, dy) || 1;
      p.x += (dx / d) * pull * dt; p.y += (dy / d) * pull * 0.5 * dt;
    }
    p.x = clamp(p.x, 24, W - 24);
    p.y = clamp(p.y, H * 0.45, H - 30);
    if (i.fire && p.cd <= 0 && !p.oh && !frozen) { const n0 = s.bullets.length; fire(s, p); p.shots += s.bullets.length - n0; }
  }

  // chickens
  const fk = has(s, 'fast') ? 1.35 : 1;
  if (s.pattern === 'grid') {
    s.gx += s.gdir * (55 + s.wave * 4) * fk * dt;
    const lim = W / 2 - s.hw;
    if (Math.abs(s.gx) > lim) { s.gx = Math.sign(s.gx) * lim; s.gdir *= -1; s.gy += 14; }
  } else if (s.pattern === 'ring') {
    s.gy = Math.min(70, s.gy + 3 * dt);
  }
  let divers = 0, chicks = 0, minis = 0;
  for (const c of s.chickens) { if (c.dv) divers++; if (c.chick) chicks++; if (c.mini) minis++; }
  const maxDivers = s.wave >= 2 ? 1 + Math.floor(s.wave / 4) : 0;
  // Eggs: the old per-chicken rate meant a big late wave rained hundreds of eggs. Now the whole formation shares a
  // budget of egg events per second that grows slowly and is capped, there is a cap on eggs in flight, and they
  // fall a little slower. Meteor-strike waves lay no eggs at all.
  const layers = Math.max(1, s.chickens.length);
  const budget = Math.min(3.2, 1.1 + 0.09 * s.wave) * (1 + 0.2 * (Math.max(1, players.length) - 1)) * (has(s, 'rapid') ? 2 : 1);
  const eggRate = s.meteorWave ? 0 : Math.min(0.07 + s.wave * 0.008, budget / layers) * (has(s, 'rapid') ? 2 : 1) * (s.eggs.length >= 22 + 4 * players.length ? 0 : 1);

  for (const c of s.chickens) {
    if (c.fl > 0) c.fl -= dt;
    if (c.chick) { // mother hen's chicks: free-flying, drift down and away
      c.x += c.vx * dt; c.y += c.vy * dt; c.vx += Math.sin(s.t * 3 + c.id) * 40 * dt;
      if (c.y > H + 30 || c.x < -40 || c.x > W + 40) c.dead = true;
      continue;
    }
    if (c.mini) { // the splitter's pieces orbit it and fire aimed eggs
      const b = s.chickens.find((x) => x.boss);
      if (!b) { c.dead = true; continue; }
      c.ma += dt * 1.1;
      c.x = clamp(b.x + Math.cos(c.ma) * 150, 30, W - 30); c.y = b.y + 70 + Math.sin(c.ma) * 50;
      c.mb -= dt;
      if (c.mb <= 0) { const tg = nearest(s, c.x, c.y); eggAt(s, c.x, c.y + 20, tg ? Math.atan2(tg.y - c.y, tg.x - c.x) : Math.PI / 2, 230 + (s.eff || s.wave) * 3); c.mb = 1.7; }
      continue;
    }
    if (c.dec) { // cloner's decoys swing in step with the real boss, a quarter-turn apart
      const b = s.chickens.find((x) => x.boss);
      if (!b) { c.dead = true; continue; }
      c.x = W / 2 + Math.sin((b.ang || 0) + c.off) * 250; c.y = 110 + Math.sin(s.t * 1.3 + c.off) * 20;
      c.mb -= dt;
      if (c.mb <= 0) { const tg = nearest(s, c.x, c.y); eggAt(s, c.x, c.y + 40, tg ? Math.atan2(tg.y - c.y, tg.x - c.x) : Math.PI / 2, 220 + (s.eff || s.wave) * 3); c.mb = 2.6; }
      continue;
    }
    if (c.sol) { // colonel's squad flies in a V under him and fires aimed eggs
      const b = s.chickens.find((x) => x.boss);
      if (!b) { c.dead = true; continue; }
      c.x = clamp(b.x + (c.si - 2) * 64, 30, W - 30); c.y = b.y + 125 - Math.abs(c.si - 2) * 18 + Math.sin(s.t * 2 + c.si) * 4;
      c.mb -= dt;
      if (c.mb <= 0) { const tg = nearest(s, c.x, c.y); eggAt(s, c.x, c.y + 18, tg ? Math.atan2(tg.y - c.y, tg.x - c.x) : Math.PI / 2, 215 + (s.eff || s.wave) * 3); c.mb = 2.3 + c.si * 0.15; }
      continue;
    }
    let bx, by;
    if (c.boss) {
      const ratio = c.hp / c.max;
      c.ph = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
      if (c.mother) c.sh = c.ph === 3 && s.t % 6 > 4 ? 1 : 0; // wings shield every 6s
      else if (c.kind === 'splitter') c.sh = minis > 0 ? 1 : 0;  // invulnerable while its pieces live
      else if (c.kind === 'colonel') c.sh = s.chickens.some((x) => x.ld && !x.dead) ? 1 : 0; // shielded until the squad leader falls
      else c.sh = 0;
      by = 110 + Math.sin(s.t * 1.3) * 20;
      if (c.kind === 'mirror') {
        // Slides to the opposite side of the screen from the pilots, with a capped speed (never jumps).
        const alive = players.filter((p) => p.alive);
        const tx = alive.length ? clamp(W - alive.reduce((a, p) => a + p.x, 0) / alive.length, 110, W - 110) : W / 2;
        const lim = (200 + 40 * c.ph) * dt;
        c.ax = (c.ax ?? W / 2) + clamp(tx - (c.ax ?? W / 2), -lim, lim);
        bx = c.ax;
        c.dtm = (c.dtm ?? 6) - dt; // periodic lunge at the pilots, telegraphed for 0.6s
        if (c.dash == null && c.dtm <= 0) c.dash = 0;
        if (c.dash != null) {
          c.dash += dt;
          const u = c.dash / 1.4;
          if (u >= 1) { c.dash = null; c.dtm = 7 - c.ph; } else by += Math.sin(u * Math.PI) * 250;
        }
        c.warn = c.dash == null && c.dtm < 0.6 ? 1 : 0;
      } else {
        // Integrate the swing angle instead of using sin(t * speed): the speed rises with each phase, and
        // multiplying a large t by a new speed would jump the boss across the screen in a single frame.
        const k = c.kind === 'sweeper' ? 0.5 : 1;
        c.ang = (c.ang || 0) + dt * ((c.kind === 'sweeper' ? 0.45 : 0.6) + 0.25 * k * c.ph);
        bx = W / 2 + Math.sin(c.ang) * (c.kind === 'sweeper' ? 200 : 250);
        if (c.kind === 'ghost') { // fades out, glides (unseen) to where a pilot is, and returns with a burst of eggs
          c.gt = (c.gt ?? 4) - dt;
          if (!c.hid && c.gt <= 0) { const tg = nearest(s, c.x, c.y); c.hid = 1; c.gt = 2.4; c.gx = clamp(tg ? tg.x : W / 2, 90, W - 90); }
          else if (c.hid && c.gt <= 0) { c.hid = 0; c.gt = 5.5 - 0.5 * c.ph; ring(s, c.x, c.y, 10, 175, s.t); }
          const lim = (c.hid ? 450 : 400) * dt, tx = c.hid ? c.gx : bx;
          c.ax = (c.ax ?? W / 2) + clamp(tx - (c.ax ?? W / 2), -lim, lim);
          bx = c.ax;
        }
        if (c.kind === 'tank') { // a telegraphed charge at a pilot; the armor opens while she is charging
          c.dtm = (c.dtm ?? 5) - dt;
          if (c.dash == null && c.dtm <= 0) { const tg = nearest(s, c.x, c.y); c.dash = 0; c.dx = tg ? tg.x : W / 2; }
          if (c.dash != null) {
            c.dash += dt;
            const u = c.dash / 1.8;
            if (u >= 1) { c.dash = null; c.dtm = 7 - c.ph; c.open = 0; }
            else { const e = Math.sin(u * Math.PI); bx += (c.dx - bx) * 0.3 * e; by += e * 300; c.open = 1; }
          }
          c.warn = c.dash == null && c.dtm < 0.7 ? 1 : 0;
        }
      }
    } else if (s.pattern === 'grid') { bx = W / 2 + s.gx + c.ox; by = 80 + s.gy + c.oy; }
    else { const a = c.a + s.t * 0.8 * fk * c.dir; bx = W / 2 + Math.cos(a) * c.R; by = 190 + s.gy + Math.sin(a) * c.R * 0.55; }
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
        c.dvt += dt * fk;
        const u = c.dvt / 2.6;
        if (u >= 1) c.dv = 0;
        else {
          const e = Math.sin(u * Math.PI);
          c.x = bx + (c.dvx - bx) * e * 0.9 + Math.sin(u * Math.PI * 3) * 28 * e;
          c.y = by + (H - 150 - by) * e;
        }
      }
      // egg drops: tiers behave differently (blue aims, green fires a triple)
      if (rnd(s) < eggRate * dt) {
        const sp = Math.min(210 + s.wave * 8, 330), down = Math.PI / 2;
        if (c.tier === 4) for (const a of [-0.3, 0, 0.3]) eggAt(s, c.x, c.y + 14, down + a, sp);
        else if (c.tier === 3) {
          const tg = nearest(s, c.x, c.y);
          eggAt(s, c.x, c.y + 14, tg ? Math.atan2(tg.y - c.y, tg.x - c.x) : down, sp + 30);
        } else eggAt(s, c.x, c.y + 14, down, sp);
      }
    } else {
      c.bt -= dt;
      if (c.bt <= 0) { if (c.hid) c.bt = 0.4; else bossAttack(s, c); }
      if (c.kind === 'magnet') { // pull on for ~3 s, then a breather
        c.pt = (c.pt ?? 3) - dt;
        if (c.pt <= 0) { c.pl = c.pl ? 0 : 1; c.pt = c.pl ? 3.2 : 3.6 - 0.3 * c.ph; }
      }
      if (c.kind === 'cloner') { // three look-alikes; only the real one has the boss health bar
        c.ct = s.chickens.some((x) => x.dec) ? 4 : (c.ct ?? 2) - dt;
        if (c.ct <= 0) {
          for (let i = 0; i < 3; i++) s.chickens.push({ id: s.nid++, x: c.x, y: c.y, hp: 1, max: 1, tier: 0, r: 58, fl: 0, dec: true, kind: 'cloner', ent: 1, off: 1.4 + i * 1.7, mb: 1 + i * 0.6 });
          c.ct = 9;
        }
      }
      if (c.kind === 'colonel') { // squads: a leader and four soldiers; the boss is shielded while the leader lives
        c.ct = s.chickens.some((x) => x.sol) ? 3 : (c.ct ?? 2.5) - dt;
        if (c.ct <= 0) {
          const lhp = 5 + Math.floor((s.eff || s.wave) / 3);
          for (let i = 0; i < 5; i++) s.chickens.push({ id: s.nid++, x: c.x, y: c.y, hp: i === 2 ? lhp : 2, max: i === 2 ? lhp : 2, tier: 0, r: i === 2 ? 28 : 20, fl: 0, sol: true, ld: i === 2, si: i, ent: 1, mb: 1.2 + i * 0.25 });
          c.ct = 4;
        }
      }
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
      if (c.kind === 'splitter') { // splits into two orbiting pieces at 66% and again at 33%
        c.spl = c.spl || 0;
        while (c.spl < c.ph - 1) {
          const mhp = Math.max(4, Math.round(c.max * 0.12));
          for (const off of [0, Math.PI]) s.chickens.push({ id: s.nid++, x: c.x, y: c.y, hp: mhp, max: mhp, tier: 0, r: 34, fl: 0, mini: true, ent: 1, ma: off, mb: 1 + off * 0.2 });
          c.spl++;
          c.sh = 1; // shielded in the very frame it splits, before any bullet can land
        }
      }
      if (c.kind === 'sweeper') { // telegraphed laser sweep across the arena
        if (c.beam) {
          const b = c.beam;
          b.t += dt;
          const u = clamp((b.t - 1.0) / 1.8, 0, 1);
          b.a = b.dir * (-1.15 + 2.3 * u);
          b.on = b.t >= 1.0 && b.t <= 2.8;
          if (b.on) {
            const ox = c.x, oy = c.y + 30, dx = Math.sin(b.a), dy = Math.cos(b.a);
            for (const p of players) {
              if (!p.alive || p.inv > 0) continue;
              const vx = p.x - ox, vy = p.y - oy;
              if (vx * dx + vy * dy > 0 && Math.abs(vx * dy - vy * dx) < 20) hitPlayer(s, p);
            }
          }
          if (b.t > 2.9) { c.beam = null; c.bc = Math.max(3, 6.5 - 0.8 * c.ph); }
        } else {
          c.bc = (c.bc ?? 4) - dt;
          if (c.bc <= 0) c.beam = { t: 0, dir: rnd(s) < 0.5 ? -1 : 1, a: 0, on: false };
        }
      }
    }
    if (by > H - 120) {
      s.over = true; s.banner = 'The chickens landed!';
      for (const p of players) { p.alive = false; p.lives = 0; }
    }
  }

  // hazard zones of the newer bosses
  if (s.zones.length) {
    const bossC = s.chickens.find((x) => x.boss);
    const inZ = (p, z, r) => (p.x - z.x) ** 2 + (p.y - z.y) ** 2 < r * r;
    for (const z of s.zones) {
      z.t += dt;
      if (z.k === 'bomb') {
        const u = Math.min(1, z.t / z.fall);
        z.cx = z.sx + (z.x - z.sx) * u; z.cy = z.sy + (z.y - z.sy) * u;
        if (z.t >= z.fall) {
          z.dead = true;
          for (const p of players) if (p.alive && inZ(p, z, z.r)) hitPlayer(s, p);
          ring(s, z.x, z.y, 10, 170, z.id);
        }
      } else if (z.k === 'lava') {
        if (z.t >= z.fall) {
          if (z.t > z.fall + z.life) z.dead = true;
          else for (const p of players) if (p.alive && p.inv <= 0 && inZ(p, z, z.r)) hitPlayer(s, p);
        }
      } else if (z.k === 'clock') {
        const tg = nearest(s, z.x, z.y);
        if (tg) { const dx = tg.x - z.x, dy = tg.y - z.y, d = Math.hypot(dx, dy) || 1, m = Math.min(d, 65 * dt); z.x += (dx / d) * m; z.y += (dy / d) * m; }
        for (const p of players) if (p.alive && inZ(p, z, z.r)) slowP(p, 0.5);
        if (z.t >= z.life) { z.dead = true; ring(s, z.x, z.y, 8, 150, z.id); }
      } else if (z.k === 'lane') {
        if (z.ring && !z.rd && z.t >= z.warn) { z.rd = 1; if (bossC) ring(s, bossC.x, bossC.y + 20, 12, 165, s.t); }
        if (z.t >= z.warn && z.t < z.warn + z.on) for (const p of players) if (p.alive && Math.abs(p.x - z.x) < z.w / 2) hitPlayer(s, p);
        if (z.t >= z.warn + z.on) z.dead = true;
      } else if (z.k === 'frost') {
        if (z.t > z.life) z.dead = true;
        else for (const p of players) if (p.alive && inZ(p, z, z.r)) slowP(p, 0.7);
      }
    }
    s.zones = s.zones.filter((z) => !z.dead);
  }
  const mgn = s.chickens.find((x) => x.kind === 'magnet' && x.boss && x.pl);
  const clocks = s.zones.filter((z) => z.k === 'clock');

  // bullets
  for (const b of s.bullets) {
    if (mgn) b.vx += clamp((mgn.x - b.x) * 2.2, -650, 650) * dt; // the magnet bends shots toward him
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
    let bdt = dt;
    for (const z of clocks) if ((z.x - b.x) ** 2 + (z.y - b.y) ** 2 < z.r * z.r) { bdt = dt * 0.5; break; } // time runs slow inside a clock bubble
    b.x += b.vx * bdt; b.y += b.vy * bdt;
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
    if (!b.dead) for (const z of s.zones) { // falling giant eggs can be shot down
      if (z.k !== 'bomb' || z.dead) continue;
      const dx = b.x - z.cx, dy = b.y - z.cy;
      if (dx * dx + dy * dy < 30 * 30) {
        if (owner) owner.hits++;
        z.hp -= b.d;
        if (z.hp <= 0) { z.dead = true; z.def = 1; if (owner) owner.score += Math.round(25 * s.smul); }
        if (b.pr) { b.hit.push(-z.id); if (--b.pr <= 0) b.dead = true; } else b.dead = true;
        break;
      }
    }
    if (!b.dead) for (const m of s.meteors) { // rocks can be shot down (two hits)
      if (m.dead || m.warn > 0) continue;
      const dx = b.x - m.x, dy = b.y - m.y;
      if (dx * dx + dy * dy < (m.r + 4) * (m.r + 4)) {
        if (owner) owner.hits++;
        m.hp -= b.d;
        if (m.hp <= 0) { m.dead = true; if (owner) { owner.score += Math.round(25 * s.smul); } }
        if (b.pr) { b.hit.push(-m.id); if (--b.pr <= 0) b.dead = true; } else b.dead = true;
        break;
      }
    }
  }
  s.bullets = s.bullets.filter((b) => !b.dead);
  if (s.zones.length) s.zones = s.zones.filter((z) => !z.dead);
  s.chickens = s.chickens.filter((c) => !c.dead);
  if (s.pattern === 'boss' && !s.chickens.some((c) => c.boss)) { s.chickens = []; s.zones = []; } // chicks / pieces / hazards leave with the boss

  // eggs
  for (const e of s.eggs) {
    e.x += (e.vx || 0) * dt; e.y += e.vy * dt;
    if (e.y > H + 20 || e.y < -40 || e.x < -20 || e.x > W + 20) { e.dead = true; continue; }
    for (const p of players) {
      if (!p.alive) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy < 20 * 20) {
        e.dead = true;
        if (e.fz) { if (p.inv <= 0) p.frz = 1.4; } else hitPlayer(s, p); // ice shards freeze instead of hurting
        break;
      }
    }
  }
  s.eggs = s.eggs.filter((e) => !e.dead);

  // meteor strike: each rock is announced by a warning marker, then falls fast toward where a pilot was
  if (s.meteorWave && s.bt <= 0 && !s.cleared && s.chickens.length) {
    s.mt -= dt;
    if (s.mt <= 0 && s.meteors.length < 6 + players.length) {
      s.mt = Math.max(0.4, 1.15 - s.wave * 0.02) * (0.8 + rnd(s) * 0.5);
      const alive = players.filter((p) => p.alive);
      const tg = alive.length ? alive[Math.floor(rnd(s) * alive.length)] : null;
      const x = clamp((tg ? tg.x : W / 2) + (rnd(s) - 0.5) * 220, 40, W - 40);
      const dir = (rnd(s) - 0.5) * 0.5;
      s.meteors.push({ id: s.nid++, x, y: -40, vx: dir * 260, vy: 0, sp: 420 + s.wave * 6, warn: 1.0, r: 24 + Math.floor(rnd(s) * 10), hp: 2, tx: x });
    }
  }
  for (const m of s.meteors) {
    if (m.warn > 0) { m.warn -= dt; if (m.warn <= 0) { m.warn = 0; m.vy = m.sp; } continue; }
    m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.y > H + 50 || m.x < -50 || m.x > W + 50) { m.dead = true; continue; }
    for (const p of players) {
      if (!p.alive || p.inv > 0) continue;
      const dx = m.x - p.x, dy = m.y - p.y, r = m.r + 14;
      if (dx * dx + dy * dy < r * r) { m.dead = true; hitPlayer(s, p); break; }
    }
  }
  s.meteors = s.meteors.filter((m) => !m.dead);

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
        else if (g.k === 'ice') { p.heat = 0; p.oh = false; p.ice = 5; s.zones = s.zones.filter((z) => z.k !== 'lava'); } // reset the gun, stay cool for 5 s, and cool the lava
        else if (g.k === 'wpn') {
          if (p.weapon === g.w) p.power = Math.min(5, p.power + 1);
          else {
            p.weapon = g.w;
            // A pilot flying a gun from the shop keeps it: the capsule only lends its weapon for 30 seconds.
            p.wt = (p.base || 'blaster') !== 'blaster' && g.w !== p.base ? 30 : 0;
          }
          if (g.w === p.base) p.wt = 0;
        }
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
        for (const p of players) if (p.alive) { p.score += 200; p.st.flawless++; }
        s.banner = 'Flawless! +200'; s.bt = 2;
      }
      if (s.rush) for (const p of players) if (p.alive && p.lives < 5 && !has(s, 'glass')) p.lives++; // rush: a life per boss
    }
    s.delay -= dt;
    if (s.delay <= 0) { spawnWave(s); s.delay = 2.4; }
  }
}
