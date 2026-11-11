// Shop catalog + pure profile logic. Shared by the server (authoritative) and the client (display).
import { EVENTS } from './events.js';
import { emptyRec, sanitizeRec, cleanName } from './leaderboard.js';

export const PALETTE = ['#4fc3f7', '#ff8a65', '#aed581', '#ce93d8', '#ffd54f', '#f06292'];
export const SKINS = ['plain', 'stripes', 'flames', 'camo', 'checker', 'gold', 'neon', 'ghost', 'dragon', 'galaxy', 'pumpkin', 'frost', 'cupid', 'blossom'];
export const SHOP_GUN_IDS = ['scatter', 'arc', 'drone'];

export const UPGRADES = {
  hull: { name: 'Hull plating', desc: '+1 starting life per level', costs: [4, 8] },
  engine: { name: 'Engine tuning', desc: '+6% ship speed per level', costs: [2, 3, 4, 5, 7] },
  cooling: { name: 'Gun cooling', desc: '+5% fire rate per level', costs: [3, 4, 5, 6, 8] },
  shield: { name: 'Shield capacitor', desc: '+0.4s invulnerability after a hit, per level', costs: [3, 5, 8] },
  magnet: { name: 'Gift magnet', desc: 'Larger pickup radius, pulls drops in', costs: [2, 4, 6] },
  reactor: { name: 'Weapon reactor', desc: 'Start every run with +1 weapon power per level', costs: [6, 12] },
};

export const GUNS = {
  scatter: { name: 'Scatter cannon', cost: 15, desc: 'Wide shotgun burst, short range. Devastating up close.' },
  arc: { name: 'Arc caster', cost: 20, desc: 'Lightning bolt that chains between nearby chickens.' },
  drone: { name: 'Wingman drones', cost: 25, desc: 'Two orbiting drones add homing fire to every shot.' },
};

export const SKIN_INFO = {
  plain: { name: 'Standard issue', cost: 0 },
  stripes: { name: 'Racing stripes', cost: 4 },
  flames: { name: 'Hot-rod flames', cost: 6 },
  camo: { name: 'Camouflage', cost: 4 },
  checker: { name: 'Chequered', cost: 4 },
  gold: { name: 'Solid gold', cost: 30, special: true },
  neon: { name: 'Neon tube', cost: 24, special: true },
  ghost: { name: 'Phantom', cost: 24, special: true },
  dragon: { name: 'Dragon scale', cost: 35, special: true },
  galaxy: { name: 'Deep galaxy', cost: 35, special: true },
  // limited-time skins: sold only while their event is running, yours to keep afterwards
  pumpkin: { name: 'Jack-o-lantern', cost: 20, special: true, event: 'halloween' },
  frost: { name: 'Frostbite', cost: 20, special: true, event: 'christmas' },
  cupid: { name: 'Cupid', cost: 20, special: true, event: 'valentine' },
  blossom: { name: 'Blossom', cost: 20, special: true, event: 'nowruz' },
};

export const TRAIL_INFO = {
  ember: { name: 'Ember (default)', cost: 0, hex: '#ffb347', c: ['rgba(255,255,255,.95)', 'rgba(255,190,60,.8)', 'rgba(255,60,0,0)'] },
  ice: { name: 'Ice jet', cost: 5, hex: '#7fdcff', c: ['rgba(255,255,255,.95)', 'rgba(120,220,255,.85)', 'rgba(40,120,255,0)'] },
  toxic: { name: 'Toxic', cost: 5, hex: '#8aff5a', c: ['rgba(255,255,230,.95)', 'rgba(120,255,90,.85)', 'rgba(0,160,40,0)'] },
  plasma: { name: 'Plasma', cost: 8, hex: '#ff5adc', c: ['rgba(255,255,255,.95)', 'rgba(255,90,220,.85)', 'rgba(130,0,200,0)'] },
  rainbow: { name: 'Rainbow', cost: 15, hex: '#ffffff', c: null },
};
export const PAINT_COST = 2;

export const defaultProfile = () => ({
  keys: 0,          // claimed keys, spendable in the shop
  pending: 0,       // keys collected in runs, waiting to be claimed
  upgrades: {},     // id -> level
  owned: { gun: [], skin: ['plain'], paint: [], trail: ['ember'] },
  equipped: { gun: null, skin: 'plain', paint: null, trail: 'ember' }, // paint null = default colour by seat
  stats: { runs: 0, bestWave: 0, totalKeys: 0 },
  name: 'Pilot',                                  // public name shown on the leaderboard
  rec: { solo: emptyRec(), online: emptyRec() }, // run records behind the leaderboard and rating
});

export const parseItem = (item) => {
  const s = String(item);
  const i = s.indexOf(':');
  return { kind: s.slice(0, i), id: s.slice(i + 1) };
};

export const upgradeLevel = (p, id) => Math.min(UPGRADES[id]?.costs.length || 0, Math.max(0, Number(p.upgrades?.[id]) || 0));

/** What an item costs right now for this profile, or why it can't be bought. */
export function quote(p, item, ctx = {}) {
  const { kind, id } = parseItem(item);
  if (kind === 'up') {
    const u = UPGRADES[id];
    if (!u) return { error: 'Unknown upgrade' };
    const lvl = upgradeLevel(p, id);
    return lvl >= u.costs.length ? { error: 'Already at max level' } : { cost: u.costs[lvl], kind, id };
  }
  if (kind === 'gun') return GUNS[id] ? (p.owned.gun.includes(id) ? { error: 'Already owned' } : { cost: GUNS[id].cost, kind, id }) : { error: 'Unknown gun' };
  if (kind === 'skin') {
    const info = SKIN_INFO[id];
    if (!info) return { error: 'Unknown skin' };
    if (p.owned.skin.includes(id)) return { error: 'Already owned' };
    if (info.event && ctx.event !== info.event) return { error: 'Only sold during ' + EVENTS[info.event].name };
    return { cost: info.cost, kind, id };
  }
  if (kind === 'paint') {
    if (!PALETTE.includes(id) || id === PALETTE[0]) return { error: 'Unknown paint' };
    return p.owned.paint.includes(id) ? { error: 'Already owned' } : { cost: PAINT_COST, kind, id };
  }
  if (kind === 'trail') return TRAIL_INFO[id] ? (p.owned.trail.includes(id) ? { error: 'Already owned' } : { cost: TRAIL_INFO[id].cost, kind, id }) : { error: 'Unknown trail' };
  return { error: 'Unknown item' };
}

export function buyItem(p, item, ctx = {}) {
  const q = quote(p, item, ctx);
  if (q.error) return { ok: false, error: q.error };
  if (p.keys < q.cost) return { ok: false, error: `Need ${q.cost - p.keys} more key${q.cost - p.keys === 1 ? '' : 's'}` };
  p.keys -= q.cost;
  if (q.kind === 'up') p.upgrades[q.id] = upgradeLevel(p, q.id) + 1;
  else p.owned[q.kind].push(q.id);
  return { ok: true };
}

const SLOTS = { gun: 'gun', skin: 'skin', paint: 'paint', trail: 'trail' };
export function equipItem(p, slot, value) {
  if (!SLOTS[slot]) return { ok: false, error: 'Unknown slot' };
  if (value === null || value === undefined || value === '') {
    if (slot === 'skin' || slot === 'trail') return { ok: false, error: 'Cannot unequip this slot' };
    p.equipped[slot] = null; return { ok: true };
  }
  if (slot === 'skin' && value === 'plain') { p.equipped.skin = 'plain'; return { ok: true }; }
  if (slot === 'trail' && value === 'ember') { p.equipped.trail = 'ember'; return { ok: true }; }
  if (!p.owned[slot]?.includes(value)) return { ok: false, error: 'You do not own that yet' };
  p.equipped[slot] = value;
  return { ok: true };
}

/** What the sim needs to build a ship from a profile. Anything unowned/invalid falls back to the default plane. */
export function loadoutOf(p) {
  const prof = p || defaultProfile();
  const eq = prof.equipped || {};
  const mods = {};
  for (const id of Object.keys(UPGRADES)) mods[id] = upgradeLevel(prof, id);
  return {
    mods,
    gun: eq.gun && prof.owned.gun.includes(eq.gun) ? eq.gun : null,
    skin: SKINS.includes(eq.skin) && prof.owned.skin.includes(eq.skin) ? eq.skin : 'plain',
    color: eq.paint && prof.owned.paint.includes(eq.paint) ? eq.paint : null,
    trail: TRAIL_INFO[eq.trail] && prof.owned.trail.includes(eq.trail) ? eq.trail : 'ember',
  };
}

/** Defensive normalisation of whatever was loaded from disk. */
export function sanitizeProfile(raw) {
  const d = defaultProfile();
  const p = raw && typeof raw === 'object' ? raw : {};
  const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  d.keys = num(p.keys); d.pending = num(p.pending);
  for (const id of Object.keys(UPGRADES)) { const l = num(p.upgrades?.[id]); if (l) d.upgrades[id] = Math.min(l, UPGRADES[id].costs.length); }
  const list = (a, ok) => [...new Set((Array.isArray(a) ? a : []).filter(ok))];
  d.owned.gun = list(p.owned?.gun, (x) => x in GUNS);
  d.owned.skin = list(['plain', ...(p.owned?.skin || [])], (x) => x in SKIN_INFO);
  d.owned.paint = list(p.owned?.paint, (x) => PALETTE.includes(x) && x !== PALETTE[0]);
  d.owned.trail = list(['ember', ...(p.owned?.trail || [])], (x) => x in TRAIL_INFO);
  Object.assign(d.equipped, { gun: null, skin: 'plain', paint: null, trail: 'ember' });
  for (const slot of Object.keys(SLOTS)) equipItem(d, slot, p.equipped?.[slot]);
  d.stats = { runs: num(p.stats?.runs), bestWave: num(p.stats?.bestWave), totalKeys: num(p.stats?.totalKeys) };
  d.name = cleanName(p.name);
  d.rec = { solo: sanitizeRec(p.rec?.solo), online: sanitizeRec(p.rec?.online) };
  return d;
}
