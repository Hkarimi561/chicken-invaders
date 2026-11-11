import { W, H, ROLES, BOSS_NAMES } from '../shared/sim';
import type { State, Player } from '../shared/types';

// All art is original and drawn with canvas paths/gradients (no sprites, no emoji).

import { clamp, shade, radial, shadowEllipse, quality, IS_TOUCH } from './util';
import { settings } from './settings';
import { drawWorld, drawForeground } from './world';
import * as sfx from './audio';
import { pack, drawSprite, getImg, chickenSlot } from './packs';
import { eventBack, eventFront, eventHat, eventEgg, eventShip, eventWingStops } from './events-art';
import { theme } from './theme';
import { TRAIL_INFO } from '../shared/catalog';
import { detectEvents, ambient, updateParts, drawParts, shakeAmount, getFlare, getSummary, getCombo, heartLostAt, lensRings, spark, COMBO_COL } from './fx';

// ---------- sprites ----------
const vestCache: Record<string, any> = {};
function vestOf(i) {
  if (!i) return null;
  const c = pack.colors.vests && pack.colors.vests[i - 1];
  if (!c) return VEST[i];
  return vestCache[c] || (vestCache[c] = [c, shade(c, -0.5)]);
}
const bulletRgba = (a, fallback) => {
  const c = pack.colors.bullet;
  if (!c) return fallback;
  const n = parseInt(c.slice(1), 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
};
const accentStroke = () => pack.colors.accent || (theme.event ? EVENT_ACCENT[theme.event] : null) || 'rgba(120,150,255,.35)';
const EVENT_ACCENT = { halloween: 'rgba(255,138,30,.6)', christmas: 'rgba(255,82,82,.6)', valentine: 'rgba(255,111,165,.6)', nowruz: 'rgba(123,228,149,.6)' };
const VEST = [null, ['#ef5350', '#8e1c1c'], ['#ffa726', '#b34700'], ['#42a5f5', '#0b3a8a'], ['#66bb6a', '#14501c']];

// jagged crack lines on a damaged vest (deterministic per chicken)
function cracks(ctx, c) {
  const n = Math.min(4, (c.max || 1) - (c.hp || 1));
  if (n <= 0) return;
  ctx.lineWidth = 1.3;
  for (let i = 0; i < n; i++) {
    const sx = -12 + ((c.id * 7 + i * 13) % 24), sy = 3 + ((c.id + i * 5) % 6);
    for (const [col, off] of [['rgba(0,0,0,.6)', 0], ['rgba(255,255,255,.35)', 0.8]] as [string, number][]) {
      ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(sx + off, sy);
      let x = sx, y = sy;
      for (let k = 0; k < 4; k++) { x += (((c.id + i + k) % 3) - 1) * 4; y += 4.5; ctx.lineTo(x + off, y); }
      ctx.stroke();
    }
  }
}

function vestDetail(ctx, c, vest) {
  const tier = c.tier;
  if (tier === 1) { // chest pocket with stitching
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.roundRect(-14, 12, 9, 7, 1.5); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([1.5, 1.5]); ctx.strokeRect(-13.3, 12.7, 7.6, 5.6); ctx.setLineDash([]);
  } else if (tier === 2) { // reflective safety stripes
    for (const y of [13, 19]) {
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-19, y + 1, 38, 3.4);
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(-19, y, 38, 3);
    }
  } else if (tier === 3) { // shoulder plates + belt buckle
    for (const s of [-1, 1]) {
      const g = ctx.createLinearGradient(0, 0, 0, 8);
      g.addColorStop(0, '#e3f2fd'); g.addColorStop(1, '#5c7da8');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(s < 0 ? -20 : 9, -3, 11, 8, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = '#263238'; ctx.beginPath(); ctx.arc(s * 14.5, 1, 0.9, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#ffd54f'; ctx.fillRect(-4, 18, 8, 5); ctx.fillStyle = '#6d4c00'; ctx.fillRect(-2, 19.5, 4, 2);
  } else if (tier === 4) { // full segmented armour with spikes
    for (let i = 0; i < 3; i++) {
      const y = 6 + i * 6.5, g = ctx.createLinearGradient(0, y, 0, y + 6);
      g.addColorStop(0, '#c8f7c5'); g.addColorStop(1, '#2e7d32');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-18, y, 36, 6, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = '#1b3d1f'; for (const x of [-13, -4.5, 4.5, 13]) { ctx.beginPath(); ctx.arc(x, y + 3, 0.9, 0, 7); ctx.fill(); }
    }
    ctx.fillStyle = '#d7ffd0';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 15, 0); ctx.lineTo(s * 18, -8); ctx.lineTo(s * 10, -1); ctx.closePath(); ctx.fill(); }
  }
  cracks(ctx, c);
}

const KIND_RGB = { mother: '255,200,80', sweeper: '90,220,255', splitter: '190,110,255', mirror: '200,225,255' };

// Colour-blind help: each vest tier gets its own pattern on top of its colour (clipped to the vest by the caller).
function vestPattern(ctx, tier) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.2;
  if (tier === 1) { for (let y = 10; y < 27; y += 5) { ctx.beginPath(); ctx.moveTo(-19, y); ctx.lineTo(19, y); ctx.stroke(); } }          // stripes
  else if (tier === 2) { for (let y = 11; y < 27; y += 6) for (let x = -15; x <= 15; x += 6) { ctx.beginPath(); ctx.arc(x + (y % 12 ? 3 : 0), y, 1.2, 0, 7); ctx.fill(); } } // dots
  else if (tier === 3) { for (let y = 12; y < 27; y += 7) { ctx.beginPath(); for (let x = -19; x <= 19; x += 5) ctx.lineTo(x, y + ((x / 5) & 1 ? 2.5 : 0)); ctx.stroke(); } } // zigzag
  else if (tier === 4) { for (let i = -30; i < 40; i += 7) { ctx.beginPath(); ctx.moveTo(i, 8); ctx.lineTo(i + 18, 28); ctx.moveTo(i + 18, 8); ctx.lineTo(i, 28); ctx.stroke(); } } // cross-hatch
  ctx.restore();
}

// Boss-specific decorations, drawn in the chicken's local (scaled) coordinates.
function bossExtras(ctx, c, t) {
  if (c.kind === 'sweeper') { // laser lens on the forehead, hot while the beam is firing
    ctx.fillStyle = '#1b1b2f'; ctx.beginPath(); ctx.arc(0, -13, 6.5, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const g = c.beam ? 1 : 0.4 + 0.3 * Math.sin(t * 6);
    ctx.fillStyle = radial(ctx, 0, -13, 0, 13, [[0, 'rgba(255,90,90,' + g + ')'], [1, 'rgba(255,40,40,0)']]);
    ctx.beginPath(); ctx.arc(0, -13, 13, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ff5252'; ctx.beginPath(); ctx.arc(0, -13, 2.6, 0, 7); ctx.fill();
  } else if (c.kind === 'mirror') { // chrome sheen, and a flashing ring just before it lunges
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, -6, -8, 2, 28, [[0, 'rgba(230,245,255,.5)'], [1, 'rgba(150,200,255,0)']]);
    ctx.beginPath(); ctx.ellipse(0, 2, 18, 20, 0, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (c.warn && (settings.reduceFlash || Math.floor(t * 10) % 2)) { ctx.strokeStyle = 'rgba(255,80,80,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 48, 0, 7); ctx.stroke(); }
    if (c.dash != null) { ctx.strokeStyle = 'rgba(200,225,255,.5)'; ctx.lineWidth = 2; for (const x of [-16, 0, 16]) { ctx.beginPath(); ctx.moveTo(x, -26); ctx.lineTo(x, -60); ctx.stroke(); } }
  } else if (c.kind === 'splitter' && c.sh) { // purple shield while its pieces are alive
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, 0, 0, 20, 50, [[0, 'rgba(190,110,255,.05)'], [1, 'rgba(190,110,255,.5)']]);
    ctx.beginPath(); ctx.arc(0, 0, 50, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(220,170,255,.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 50, 0, 7); ctx.stroke();
  }
  if (c.mini) { ctx.strokeStyle = 'rgba(210,150,255,.85)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.stroke(); }
}

function chicken(ctx, c, t, env) {
  const persp = 0.86 + (c.y / H) * 0.32; // nearer to the player = bigger
  const k = (c.r / 22) * persp;
  const bob = Math.sin(t * 4 + c.id) * 2 * k;
  const panic = env.panic && !c.boss && !c.chick;
  const flap = Math.sin(t * (panic ? 22 : 11) + c.id * 1.7);
  const vest = c.chick ? null : vestOf(c.tier || 0);
  const entering = c.ent < 1;
  const angry = !!c.dv || c.boss;

  // look toward the nearest living player
  let lx = 0, ly = 0.7, bd = 1e12;
  for (const p of env.players) {
    if (!p.alive) continue;
    const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    if (d < bd) { bd = d; const m = Math.sqrt(d) || 1; lx = (p.x - c.x) / m; ly = (p.y - c.y) / m; }
  }

  ctx.save();
  // motion streaks: diving, or flying in
  if (c.dv || entering) {
    ctx.strokeStyle = entering ? 'rgba(180,210,255,.45)' : 'rgba(255,140,120,.5)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(c.x + i * 11, c.y - 22); ctx.lineTo(c.x + i * 11, c.y - 22 - (entering ? 70 * (1 - c.ent) + 10 : 34 + i * i * 10)); ctx.stroke();
    }
  }
  if (entering) ctx.globalAlpha = 0.3 + 0.7 * c.ent;
  ctx.translate(c.x + (panic ? (Math.random() - 0.5) * 1.6 : 0), c.y + bob);
  ctx.scale(k, k);

  shadowEllipse(ctx, 7, 16, 20, 17, 0.3);
  if (c.boss || c.mini) {
    ctx.globalCompositeOperation = 'lighter';
    const rgb = KIND_RGB[c.kind] || (c.mini ? '190,110,255' : '255,60,60');
    ctx.fillStyle = radial(ctx, 0, 0, 10, 40, [[0, `rgba(${rgb},.45)`], [1, `rgba(${rgb},0)`]]);
    ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  // mother hen: a woven nest on her back with peeking chicks
  if (c.mother) {
    ctx.fillStyle = '#4a2f12'; ctx.beginPath(); ctx.ellipse(1, -12, 27, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = radial(ctx, -6, -16, 1, 30, [[0, '#c99a58'], [1, '#6b4519']], 0, -12);
    ctx.beginPath(); ctx.ellipse(0, -14, 26, 9, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(60,35,10,.7)'; ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 7, -21); ctx.lineTo(i * 6 + 3, -7); ctx.stroke(); }
    for (const [x, ph] of [[-12, 0], [11, 1.7]]) {
      const bounce = Math.sin(t * 3 + ph) * 2;
      ctx.fillStyle = '#ffe36b'; ctx.beginPath(); ctx.arc(x, -22 + bounce, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x - 2, -23 + bounce, 1, 0, 7); ctx.arc(x + 2, -23 + bounce, 1, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff9800'; ctx.beginPath(); ctx.moveTo(x - 1.5, -20.5 + bounce); ctx.lineTo(x + 1.5, -20.5 + bounce); ctx.lineTo(x, -18.5 + bounce); ctx.fill();
    }
  }

  // wings: extruded (dark copy underneath) then lit face; raised wide while shielding
  const spread = c.sh ? 1.6 + Math.sin(t * 8) * 0.06 : 0.5 + flap * 0.45;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 15, 2);
    ctx.rotate(side * spread);
    ctx.fillStyle = '#9a7b52';
    ctx.beginPath(); ctx.ellipse(side * 6 + 1.5, 2.5, c.sh ? 16 : 11, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = radial(ctx, side * -2, -4, 1, 16, eventWingStops() || [[0, '#fff6e5'], [1, '#d2b48c']]);
    ctx.beginPath(); ctx.ellipse(side * 6, 0, c.sh ? 16 : 11, 6, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  // body extrusion: stacked darker copies give thickness
  for (let i = 5; i >= 1; i--) {
    ctx.fillStyle = c.chick ? `rgb(${170 - i * 6},${130 - i * 6},${20})` : `rgb(${150 - i * 6},${120 - i * 6},${84 - i * 5})`;
    ctx.beginPath(); ctx.ellipse(i * 0.9, 2 + i * 1.1, 18, 20, 0, 0, 7); ctx.fill();
  }
  const body = () => { ctx.beginPath(); ctx.ellipse(0, 2, 18, 20, 0, 0, 7); };
  ctx.fillStyle = c.chick
    ? radial(ctx, -7, -9, 2, 28, [[0, '#fffbd0'], [0.5, '#ffe36b'], [1, '#d9a21b']], 0, 2)
    : radial(ctx, -7, -9, 2, 28, [[0, '#ffffff'], [0.5, '#f3e6d0'], [1, '#bd9a6a']], 0, 2);
  body(); ctx.fill();

  // vest (clipped to the body so it wraps the belly)
  if (vest) {
    ctx.save(); body(); ctx.clip();
    const vg = ctx.createLinearGradient(-18, 0, 18, 0);
    vg.addColorStop(0, vest[1]); vg.addColorStop(0.35, vest[0]); vg.addColorStop(0.6, vest[0]); vg.addColorStop(1, vest[1]);
    ctx.fillStyle = vg;
    ctx.beginPath(); ctx.moveTo(-19, -1); ctx.lineTo(-5, 0); ctx.lineTo(0, 10); ctx.lineTo(5, 0); ctx.lineTo(19, -1); ctx.lineTo(19, 26); ctx.lineTo(-19, 26); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(0, 10); ctx.lineTo(5, 0); ctx.moveTo(0, 10); ctx.lineTo(0, 26); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.moveTo(-19, -1); ctx.lineTo(-5, 0); ctx.stroke();
    if (c.tier <= 2) for (const by of [14, 20]) {
      ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(-0.01, by, 1.9, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-0.6, by - 0.6, 0.6, 0, 7); ctx.fill();
    }
    vestDetail(ctx, c, vest);
    if (settings.patterns) vestPattern(ctx, c.tier);
    ctx.restore();
  }

  // ambient occlusion on belly + specular + rim
  ctx.save(); body(); ctx.clip();
  ctx.fillStyle = radial(ctx, 9, 16, 2, 26, [[0, 'rgba(10,10,40,.35)'], [1, 'rgba(10,10,40,0)']]);
  ctx.fillRect(-20, -20, 40, 44);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath(); ctx.ellipse(-8, -10, 4.5, 7, -0.5, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(130,160,255,.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 2, 18, 20, 0, 0.1, 1.3); ctx.stroke();
  if (c.fl > 0 && !settings.reduceFlash) { ctx.fillStyle = 'rgba(255,255,255,.85)'; body(); ctx.fill(); }

  // comb (bevelled)
  for (const [x, y, r] of [[-6, -19, 5], [0, -23, 6], [6, -19, 5]]) {
    ctx.fillStyle = '#7f1313'; ctx.beginPath(); ctx.arc(x + 1, y + 1.5, r, 0, 7); ctx.fill();
    ctx.fillStyle = radial(ctx, x - 1.5, y - 2, 0.5, r + 1, [[0, '#ff8a80'], [1, '#c62828']]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  eventHat(ctx, c, t);
  // eyes: follow the player; wide with tiny pupils when panicking; red when angry
  for (const x of [-6.5, 6.5]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, -6, panic ? 5.2 : 4.3, panic ? 6.2 : 5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = angry ? '#c00' : '#111';
    ctx.beginPath(); ctx.arc(x + lx * 1.9, -5.5 + ly * 1.7, panic ? 1.4 : 2.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 0.8 + lx * 1.2, -6.6 + ly * 1, 0.9, 0, 7); ctx.fill();
  }
  if (angry) { // slanted brows
    ctx.strokeStyle = '#300'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-11, -12); ctx.lineTo(-3, -9); ctx.moveTo(11, -12); ctx.lineTo(3, -9); ctx.stroke();
  }
  if (c.boss && !c.mother) {
    ctx.fillStyle = '#b8860b';
    ctx.beginPath(); ctx.moveTo(-9, -21); ctx.lineTo(-6, -29); ctx.lineTo(-3, -22); ctx.lineTo(1, -31); ctx.lineTo(4, -22); ctx.lineTo(8, -29); ctx.lineTo(11, -21); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath(); ctx.moveTo(-10, -22); ctx.lineTo(-7, -31); ctx.lineTo(-3, -24); ctx.lineTo(0, -33); ctx.lineTo(3, -24); ctx.lineTo(7, -31); ctx.lineTo(10, -22); ctx.closePath(); ctx.fill();
  }
  if (c.mother) { // flower bonnet band
    ctx.fillStyle = '#f48fb1'; ctx.beginPath(); ctx.arc(-13, -4, 3.2, 0, 7); ctx.arc(13, -4, 3.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff176'; ctx.beginPath(); ctx.arc(-13, -4, 1.2, 0, 7); ctx.arc(13, -4, 1.2, 0, 7); ctx.fill();
  }
  // beak (two facets; open when panicking) + wattle
  if (panic) { ctx.fillStyle = '#5a1010'; ctx.beginPath(); ctx.ellipse(0, 5.5, 3.4, 3.4, 0, 0, 7); ctx.fill(); }
  const bo = panic ? 2.2 : 0;
  ctx.fillStyle = '#ffb74d'; ctx.beginPath(); ctx.moveTo(-5, 1 - (panic ? 1 : 0)); ctx.lineTo(0, 1 - (panic ? 1 : 0)); ctx.lineTo(0, 7 - bo); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ef6c00'; ctx.beginPath(); ctx.moveTo(0, 1 - (panic ? 1 : 0)); ctx.lineTo(5, 1 - (panic ? 1 : 0)); ctx.lineTo(0, 7 - bo); ctx.closePath(); ctx.fill();
  ctx.fillStyle = radial(ctx, -0.8, 11, 0.5, 4.5, [[0, '#ff8a80'], [1, '#c62828']]);
  ctx.beginPath(); ctx.ellipse(0, 12 + bo, 2.6, 4, 0, 0, 7); ctx.fill();
  if (panic) { // sweat drop
    ctx.fillStyle = 'rgba(140,210,255,.9)';
    ctx.beginPath(); ctx.moveTo(14, -16 + ((t * 6) % 3)); ctx.quadraticCurveTo(18, -9, 14, -8); ctx.quadraticCurveTo(10, -9, 14, -16 + ((t * 6) % 3)); ctx.fill();
  }
  if (c.sh) { // golden wing-shield bubble
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, 0, 0, 20, 50, [[0, 'rgba(255,220,120,.05)'], [1, 'rgba(255,200,60,.5)']]);
    ctx.beginPath(); ctx.arc(0, 0, 50, 0, 7); ctx.fill();
    ctx.strokeStyle = `rgba(255,235,150,${0.7 + Math.sin(t * 12) * 0.2})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 50, 0, 7); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (c.boss || c.mini) bossExtras(ctx, c, t);
  ctx.restore();

  // remaining-hits pips (only once damaged)
  if (!c.boss && !c.chick && c.hp < c.max) {
    for (let i = 0; i < c.hp; i++) {
      ctx.fillStyle = vest ? vest[0] : '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c.x + (i - (c.hp - 1) / 2) * 7, c.y - 34 * k, 2.6, 0, 7); ctx.fill(); ctx.stroke();
    }
  }
}

// Flat-shaded chicken for slower phones: no gradients, no extrusion stack, no clipping except the vest.
function chickenLite(ctx, c, t) {
  const k = (c.r / 22) * (0.86 + (c.y / H) * 0.32);
  const bob = Math.sin(t * 4 + c.id) * 2 * k, flap = Math.sin(t * 11 + c.id * 1.7);
  const vest = c.chick ? null : vestOf(c.tier || 0);
  ctx.save();
  if (c.ent < 1) ctx.globalAlpha = 0.3 + 0.7 * c.ent;
  ctx.translate(c.x, c.y + bob); ctx.scale(k, k);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(6, 15, 19, 16, 0, 0, 7); ctx.fill();
  ctx.fillStyle = c.chick ? '#e8c24a' : '#e6d2ae';
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 15, 2); ctx.rotate(side * (0.5 + flap * 0.45));
    ctx.beginPath(); ctx.ellipse(side * 6, 0, 11, 6, 0, 0, 7); ctx.fill(); ctx.restore();
  }
  ctx.fillStyle = c.fl > 0 ? '#ffffff' : c.chick ? '#ffe36b' : '#f6ecd9';
  ctx.beginPath(); ctx.ellipse(0, 2, 18, 20, 0, 0, 7); ctx.fill();
  if (vest) {
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 2, 18, 20, 0, 0, 7); ctx.clip();
    ctx.fillStyle = vest[0]; ctx.fillRect(-19, 8, 38, 20);
    ctx.fillStyle = vest[1]; ctx.fillRect(-19, 8, 38, 3);
    if (c.tier >= 2) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(-19, 16, 38, 2.5); }
    if (c.tier >= 4) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-19, 22, 38, 2.5); }
    if (settings.patterns) vestPattern(ctx, c.tier);
    ctx.restore();
  }
  ctx.fillStyle = '#d32f2f';
  for (const [x, y, r] of [[-6, -19, 5], [0, -23, 6], [6, -19, 5]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  eventHat(ctx, c, t);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-6.5, -6, 4.3, 0, 7); ctx.arc(6.5, -6, 4.3, 0, 7); ctx.fill();
  ctx.fillStyle = c.dv ? '#c00' : '#111'; ctx.beginPath(); ctx.arc(-6.5, -5, 2.2, 0, 7); ctx.arc(6.5, -5, 2.2, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff9800'; ctx.beginPath(); ctx.moveTo(-5, 1); ctx.lineTo(5, 1); ctx.lineTo(0, 9); ctx.fill();
  ctx.restore();
  if (!c.chick && c.hp < c.max) {
    for (let i = 0; i < c.hp; i++) {
      ctx.fillStyle = vest ? vest[0] : '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c.x + (i - (c.hp - 1) / 2) * 7, c.y - 34 * k, 2.6, 0, 7); ctx.fill(); ctx.stroke();
    }
  }
}

// A chicken drawn from the player's own image; vest tier shows as a coloured glow, damage as pips.
function packChicken(ctx, c, t, slot) {
  const k = (c.r / 22) * (0.86 + (c.y / H) * 0.32);
  const bob = Math.sin(t * 4 + c.id) * 2 * k, vest = c.chick ? null : vestOf(c.tier || 0);
  ctx.save();
  if (c.ent < 1) ctx.globalAlpha = 0.3 + 0.7 * c.ent;
  ctx.translate(c.x, c.y + bob);
  shadowEllipse(ctx, 6 * k, 16 * k, 19 * k, 15 * k, 0.28);
  if (vest && pack.opts.tierGlow !== false) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, 0, 0, 4, 34 * k, [[0, vest[0] + 'aa'], [1, vest[0] + '00']]);
    ctx.beginPath(); ctx.arc(0, 0, 34 * k, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  const pop = 1 + (c.fl > 0 ? 0.12 : 0);
  ctx.scale(pop, pop);
  drawSprite(ctx, slot, 54 * k);
  if (c.sh) { ctx.strokeStyle = 'rgba(255,225,120,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 50 * k, 0, 7); ctx.stroke(); }
  ctx.restore();
  if (!c.boss && !c.chick && c.hp < c.max) {
    for (let i = 0; i < c.hp; i++) {
      ctx.fillStyle = vest ? vest[0] : '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c.x + (i - (c.hp - 1) / 2) * 7, c.y - 34 * k, 2.6, 0, 7); ctx.fill(); ctx.stroke();
    }
  }
}

// meteor strike: a pulsing warning marker where the rock will come down, then a burning rock with a fire trail
function meteor(ctx, m, t) {
  if (m.warn > 0) {
    const a = 0.45 + 0.4 * Math.sin(t * 22), x = m.x;
    ctx.save();
    ctx.strokeStyle = `rgba(255,80,60,${a})`; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(x, 24); ctx.lineTo(x, H - 30); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,70,50,${a + 0.2})`;
    ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x - 11, 10); ctx.lineTo(x + 11, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', x, 26);
    ctx.restore();
    return;
  }
  const ang = Math.atan2(m.vy, m.vx), r = m.r;
  ctx.save(); ctx.translate(m.x, m.y);
  ctx.globalCompositeOperation = 'lighter'; // fire trail behind the direction of travel
  ctx.rotate(ang - Math.PI / 2);
  const g = ctx.createLinearGradient(0, 0, 0, -r * 4.2);
  g.addColorStop(0, 'rgba(255,190,80,.75)'); g.addColorStop(0.5, 'rgba(255,90,30,.35)'); g.addColorStop(1, 'rgba(255,60,20,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-r * 0.8, 0); ctx.lineTo(0, -r * 4.2 - Math.sin(t * 30 + m.id) * 6); ctx.lineTo(r * 0.8, 0); ctx.fill();
  ctx.globalCompositeOperation = 'source-over'; ctx.rotate(-(ang - Math.PI / 2));
  ctx.rotate(t * 2 + m.id);
  ctx.fillStyle = radial(ctx, -r * 0.3, -r * 0.3, 2, r * 1.1, [[0, '#d7b89a'], [0.55, '#7a5a45'], [1, '#2e211a']]);
  ctx.beginPath();
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, k = r * (0.82 + 0.22 * Math.sin(i * 2.7 + m.id)); i ? ctx.lineTo(Math.cos(a) * k, Math.sin(a) * k) : ctx.moveTo(Math.cos(a) * k, Math.sin(a) * k); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.arc(r * 0.25, -r * 0.1, r * 0.22, 0, 7); ctx.arc(-r * 0.3, r * 0.3, r * 0.16, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,140,60,.8)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}
function egg(ctx, e, t) {
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(Math.sin(t * 6 + e.x) * 0.3);
  shadowEllipse(ctx, 3, 4, 8, 10, 0.25);
  if (drawSprite(ctx, 'egg', 22) || eventEgg(ctx, e, t)) { ctx.restore(); return; }
  ctx.fillStyle = radial(ctx, -3, -4, 1, 12, [[0, '#ffffff'], [0.6, '#f3e5cf'], [1, '#bfa078']]);
  ctx.beginPath(); ctx.ellipse(0, 0, 8, 10.5, 0, 0, 7); ctx.fill();
  ctx.restore();
}

function gift(ctx, g, t) {
  const pulse = 1 + Math.sin(t * 6 + g.id) * 0.08;
  ctx.save(); ctx.translate(g.x, g.y); ctx.scale(pulse, pulse);
  const col = g.k === 'power' ? '255,193,7' : g.k === 'life' ? '255,82,120' : g.k === 'wpn' ? '110,220,255' : g.k === 'key' ? '255,215,0' : g.k === 'ice' ? '130,220,255' : '255,152,0';
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = radial(ctx, 0, 0, 2, 26, [[0, `rgba(${col},.6)`], [1, `rgba(${col},0)`]]);
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  shadowEllipse(ctx, 5, 9, 14, 8, 0.3);
  if (drawSprite(ctx, 'gift_' + g.k, 34)) { ctx.restore(); return; }
  if (g.k === 'power') { // true 3-face box: front, side, top
    ctx.fillStyle = '#e65100'; ctx.fillRect(-11, -4, 18, 15);
    ctx.fillStyle = '#ffb300'; ctx.fillRect(-11, -4, 18, 6);
    ctx.fillStyle = '#a63c00';
    ctx.beginPath(); ctx.moveTo(7, -4); ctx.lineTo(12, -8); ctx.lineTo(12, 7); ctx.lineTo(7, 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe082';
    ctx.beginPath(); ctx.moveTo(-11, -4); ctx.lineTo(-6, -8); ctx.lineTo(12, -8); ctx.lineTo(7, -4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d32f2f'; ctx.fillRect(-5, -4, 4, 15);
    ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(0, -8); ctx.lineTo(4, -8); ctx.lineTo(-1, -4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff5252'; ctx.beginPath(); ctx.arc(-4, -10, 3.5, 0, 7); ctx.arc(2, -10, 3.5, 0, 7); ctx.fill();
  } else if (g.k === 'life') {
    ctx.fillStyle = '#7a0c3b'; // extrusion
    for (let i = 4; i >= 1; i--) { ctx.beginPath(); ctx.moveTo(i * 0.8, 10 + i); ctx.bezierCurveTo(-18 + i * 0.8, -2 + i, -9 + i * 0.8, -14 + i, i * 0.8, -6 + i); ctx.bezierCurveTo(9 + i * 0.8, -14 + i, 18 + i * 0.8, -2 + i, i * 0.8, 10 + i); ctx.fill(); }
    ctx.fillStyle = radial(ctx, -4, -5, 1, 16, [[0, '#ffb3c1'], [0.5, '#ff4d79'], [1, '#c2185b']]);
    ctx.beginPath(); ctx.moveTo(0, 10); ctx.bezierCurveTo(-18, -2, -9, -14, 0, -6); ctx.bezierCurveTo(9, -14, 18, -2, 0, 10); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(-6, -5, 2.5, 4, -0.6, 0, 7); ctx.fill();
  } else if (g.k === 'ice') { // ice cube: cools the guns
    ctx.save(); ctx.rotate(Math.sin(t * 2 + g.id) * 0.12);
    ctx.fillStyle = 'rgba(120,200,255,.35)'; ctx.fillRect(-11, -9, 22, 22); // back face
    const ig = ctx.createLinearGradient(-12, -12, 12, 12); ig.addColorStop(0, 'rgba(235,250,255,.95)'); ig.addColorStop(0.5, 'rgba(150,215,255,.85)'); ig.addColorStop(1, 'rgba(70,150,230,.9)');
    ctx.fillStyle = ig; ctx.fillRect(-13, -13, 22, 22);
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.strokeRect(-13, -13, 22, 22);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(-2, -10); ctx.lineTo(-10, -2); ctx.fill();
    ctx.restore();
  } else if (g.k === 'key') { // golden key
    ctx.save(); ctx.rotate(Math.sin(t * 4 + g.id) * 0.35 - 0.5);
    ctx.fillStyle = '#6b4a00'; ctx.beginPath(); ctx.arc(1.5, -6.5, 8, 0, 7); ctx.fill(); ctx.fillRect(-1, -1, 5, 20);
    const kg = radial(ctx, -3, -9, 1, 12, [[0, '#fff8c4'], [0.5, '#ffd54f'], [1, '#b8860b']]);
    ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(0, -8, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#0d1233'; ctx.beginPath(); ctx.arc(0, -8, 3.2, 0, 7); ctx.fill();
    ctx.fillStyle = kg; ctx.fillRect(-2.5, -1, 5, 20); ctx.fillRect(2.5, 11, 6, 3.4); ctx.fillRect(2.5, 16, 4.5, 3.4);
    ctx.restore();
  } else if (g.k === 'wpn') { // weapon capsule: colour + icon identify the weapon
    const wc = { blaster: '#ffd54f', pulse: '#4dd0e1', laser: '#f06292', missile: '#b0bec5' }[g.w] || '#fff';
    ctx.fillStyle = '#10163a'; ctx.beginPath(); ctx.roundRect(-11, -9, 24, 22, 7); ctx.fill(); // thickness
    ctx.fillStyle = radial(ctx, -4, -6, 1, 20, [[0, '#ffffff'], [0.35, wc], [1, '#20264f']]);
    ctx.beginPath(); ctx.roundRect(-12, -11, 24, 22, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#10163a'; ctx.strokeStyle = '#10163a'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    if (g.w === 'pulse') { for (const x of [-5, 0, 5]) { ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, -4); ctx.stroke(); } }
    else if (g.w === 'laser') { ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -7, 1.6, 0, 7); ctx.fill(); }
    else if (g.w === 'missile') { ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(3.5, 0); ctx.lineTo(3.5, 6); ctx.lineTo(-3.5, 6); ctx.lineTo(-3.5, 0); ctx.closePath(); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-5, 5); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.stroke(); }
  } else { // drumstick
    ctx.rotate(-0.6);
    ctx.fillStyle = '#f5e6c8'; ctx.fillRect(-1.5, 2, 3, 12);
    ctx.beginPath(); ctx.arc(-3, 14, 2.5, 0, 7); ctx.arc(3, 14, 2.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#6d3508'; ctx.beginPath(); ctx.ellipse(1.5, 0, 9, 11, 0, 0, 7); ctx.fill();
    ctx.fillStyle = radial(ctx, -3, -5, 1, 15, [[0, '#ffc47a'], [0.5, '#d9822b'], [1, '#8d4a12']]);
    ctx.beginPath(); ctx.ellipse(0, -2, 9, 11, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(-4, -6, 2, 4, -0.5, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function bullets(ctx, list) {
  const bs = getImg('bullet');
  for (const b of list) {
    if (bs) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
      drawSprite(ctx, 'bullet', b.w === 'm' ? 30 : 24); ctx.restore();
      continue;
    }
    if (b.w === 'm') { // homing missile: small rocket, rotated along its heading
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = radial(ctx, 0, 12, 1, 18, [[0, 'rgba(255,255,255,.9)'], [0.4, 'rgba(255,150,40,.7)'], [1, 'rgba(255,60,0,0)']]);
      ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(0, 12 + Math.random() * 10); ctx.lineTo(4, 6); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createLinearGradient(-4, 0, 4, 0);
      g.addColorStop(0, '#78909c'); g.addColorStop(0.5, '#eceff1'); g.addColorStop(1, '#546e7a');
      ctx.fillStyle = g; ctx.fillRect(-3.5, -8, 7, 15);
      ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.moveTo(-3.5, -8); ctx.lineTo(0, -15); ctx.lineTo(3.5, -8); ctx.fill();
      ctx.fillStyle = '#37474f'; ctx.fillRect(-6, 3, 3, 5); ctx.fillRect(3, 3, 3, 5);
      ctx.restore();
      continue;
    }
    ctx.globalCompositeOperation = 'lighter';
    if (b.w === 'l') { // piercing beam
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,60,200,.35)'; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x, b.y + 70); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,170,240,.8)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x, b.y + 60); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x, b.y + 50); ctx.stroke();
    } else if (b.w === 's') { // scatter pellet
      ctx.fillStyle = 'rgba(255,160,40,.4)'; ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff1c4'; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, 7); ctx.fill();
    } else if (b.w === 'a') { // arc bolt: crackling orb
      ctx.fillStyle = 'rgba(80,190,255,.35)'; ctx.beginPath(); ctx.arc(b.x, b.y, 9 + Math.random() * 3, 0, 7); ctx.fill();
      ctx.strokeStyle = '#d8f4ff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(b.x, b.y - 10); ctx.lineTo(b.x + 3, b.y - 3); ctx.lineTo(b.x - 3, b.y + 3); ctx.lineTo(b.x, b.y + 11); ctx.stroke();
    } else if (b.w === 'd') { // drone shot
      ctx.fillStyle = 'rgba(105,240,174,.4)'; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#eafff3'; ctx.beginPath(); ctx.arc(b.x, b.y, 2.4, 0, 7); ctx.fill();
    } else if (b.w === 'p') { // pulse bolt
      ctx.fillStyle = 'rgba(80,220,255,.35)'; ctx.beginPath(); ctx.ellipse(b.x, b.y + 3, 5, 11, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#e0fbff'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 2.2, 6, 0, 0, 7); ctx.fill();
    } else { // blaster
      const len = 18, nx = b.vx / 700, ny = b.vy / 700;
      const g = ctx.createLinearGradient(b.x, b.y, b.x - nx * len * 1.8, b.y - ny * len * 1.8);
      g.addColorStop(0, bulletRgba(0.9, 'rgba(255,240,150,.9)')); g.addColorStop(1, bulletRgba(0, 'rgba(255,120,0,0)'));
      ctx.strokeStyle = g; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - nx * len * 1.8, b.y - ny * len * 1.8); ctx.stroke();
      ctx.fillStyle = '#fffde7'; ctx.beginPath(); ctx.arc(b.x, b.y, 2.8, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

const WPN_COL = { blaster: '#ffd54f', pulse: '#4dd0e1', laser: '#f06292', missile: '#b0bec5', scatter: '#ff9800', arc: '#40c4ff', drone: '#69f0ae' };
const WPN_CD = { blaster: 0.2, pulse: 0.085, laser: 0.17, missile: 0.45, scatter: 0.55, arc: 0.32, drone: 0.22 };
const SKIN_BASE = { pumpkin: '#e8731a', frost: '#8fd4ff', cupid: '#ff7fae', blossom: '#8fdc7a', gold: '#d9a521', neon: '#0d1233', ghost: '#9fb4d9', dragon: '#a31515', galaxy: '#2a1659' };

// engine flame colours for the equipped trail (rainbow cycles through hues)
function trailColors(id, t) {
  if (id === 'rainbow') {
    const h = (t * 140) % 360;
    return ['rgba(255,255,255,.95)', 'hsla(' + h + ',95%,60%,.85)', 'hsla(' + ((h + 60) % 360) + ',95%,50%,0)'];
  }
  return (TRAIL_INFO[id] && TRAIL_INFO[id].c) || TRAIL_INFO.ember.c;
}

function hullPath(ctx, i = 0) {
  ctx.beginPath(); ctx.moveTo(0, -28 + i); ctx.bezierCurveTo(10, -10 + i, 11, 6 + i, 8, 16 + i);
  ctx.lineTo(-8, 16 + i); ctx.bezierCurveTo(-11, 6 + i, -10, -10 + i, 0, -28 + i);
}

// paint-job patterns, clipped to the hull
function skin(ctx, p, t) {
  switch (p.skin) {
    case 'stripes': // racing stripes
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(-5, -30, 3, 50); ctx.fillRect(2, -30, 3, 50);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-1, -30, 2, 50);
      break;
    case 'flames': // flames licking up from the engine
      for (const [x, h, ph] of [[-7, 24, 0], [0, 30, 1.3], [7, 22, 2.6]]) {
        const w = Math.sin(t * 9 + ph) * 2, top = 16 - h + w * 2;
        const g = ctx.createLinearGradient(0, 16, 0, top);
        g.addColorStop(0, '#fff176'); g.addColorStop(0.5, '#ff9800'); g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x - 6, 17); ctx.quadraticCurveTo(x - 4 + w, top + h * 0.4, x + w, top); ctx.quadraticCurveTo(x + 4 + w, top + h * 0.4, x + 6, 17); ctx.fill();
      }
      break;
    case 'camo': // camouflage blobs
      for (const [x, y, rx, ry, c] of [[-5, -8, 6, 4, '#3e5b2a'], [5, -2, 5, 6, '#5b4a2a'], [-3, 7, 7, 4, '#2f4a24'], [6, 10, 4, 3, '#4a5b2e'], [0, -18, 4, 3, '#2f4a24']]) {
        ctx.fillStyle = c; ctx.globalAlpha *= 0.7; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0.6, 0, 7); ctx.fill(); ctx.globalAlpha /= 0.7;
      }
      break;
    case 'checker': // chequered nose-to-tail
      for (let y = -28; y < 18; y += 4) for (let x = -12; x < 12; x += 4)
        if (((x + 12) / 4 + (y + 28) / 4) % 2 === 0) { ctx.fillStyle = 'rgba(10,10,20,.55)'; ctx.fillRect(x, y, 4, 4); }
      break;
    case 'gold': { // brushed gold with a sweeping shine
      const x = ((t * 22) % 60) - 30;
      const g = ctx.createLinearGradient(x - 8, -30, x + 8, 20);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(-14, -30, 28, 50);
      ctx.fillStyle = 'rgba(120,70,0,.25)'; ctx.fillRect(-1, -30, 2, 50);
      break;
    }
    case 'neon': { // glowing panel lines
      const ga = ctx.globalAlpha;
      ctx.strokeStyle = p.color; ctx.globalAlpha = ga * 0.5; ctx.lineWidth = 1;
      for (let y = -20; y < 14; y += 8) { ctx.beginPath(); ctx.moveTo(-9, y); ctx.lineTo(9, y); ctx.stroke(); }
      ctx.globalAlpha = ga;
      break;
    }
    case 'ghost': { // inner glow
      ctx.fillStyle = radial(ctx, 0, -4, 1, 16, [[0, 'rgba(200,235,255,.7)'], [1, 'rgba(120,160,255,0)']]);
      ctx.fillRect(-12, -30, 24, 50);
      break;
    }
    case 'dragon': { // overlapping scales + glowing eyes
      ctx.strokeStyle = 'rgba(40,0,0,.55)'; ctx.lineWidth = 1;
      for (let y = -26; y < 18; y += 5) for (let x = -12 + ((y / 5) & 1) * 3; x < 12; x += 6) { ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI); ctx.stroke(); }
      ctx.fillStyle = '#ffd54f'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 3.2, -12, 1.6, 0.9, 0, 0, 7); ctx.fill(); }
      break;
    }
    case 'pumpkin': { // carved jack-o-lantern: ribs plus a glowing face below the cockpit
      ctx.strokeStyle = 'rgba(120,50,0,.5)'; ctx.lineWidth = 1;
      for (const x of [-7, -3.5, 0, 3.5, 7]) { ctx.beginPath(); ctx.moveTo(x, -26); ctx.quadraticCurveTo(x * 1.5, -4, x, 16); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,235,120,' + (0.75 + 0.25 * Math.sin(t * 7)) + ')';
      ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(-2, 3); ctx.lineTo(-4, 8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(2, 3); ctx.lineTo(6, 3); ctx.lineTo(4, 8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, 10); ctx.lineTo(-3, 13); ctx.lineTo(0, 10); ctx.lineTo(3, 13); ctx.lineTo(6, 10); ctx.lineTo(5, 15); ctx.lineTo(-5, 15); ctx.closePath(); ctx.fill();
      break;
    }
    case 'frost': { // ice facets with a travelling glint
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(-9, 6); ctx.lineTo(0, -4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(120,190,255,.32)'; ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(9, 6); ctx.lineTo(0, -4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.moveTo(-9, 6); ctx.lineTo(0, 16); ctx.lineTo(0, -4); ctx.closePath(); ctx.fill();
      const gy = ((t * 18) % 50) - 30;
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-3, gy); ctx.lineTo(3, gy); ctx.moveTo(0, gy - 3); ctx.lineTo(0, gy + 3); ctx.stroke();
      break;
    }
    case 'cupid': { // heart emblem + arrow
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(0, 14); ctx.bezierCurveTo(-9, 6, -5, -2, 0, 3); ctx.bezierCurveTo(5, -2, 9, 6, 0, 14); ctx.fill();
      ctx.strokeStyle = 'rgba(120,0,50,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-8, 12); ctx.lineTo(8, 2); ctx.stroke();
      break;
    }
    case 'blossom': { // little flowers across the hull
      for (const [x, y] of [[-5, -14], [5, -8], [-4, 0], [5, 8], [-3, 12]]) {
        ctx.fillStyle = '#ffb7d5'; for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + t * 0.4; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, 1.7, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(x, y, 1.3, 0, 7); ctx.fill();
      }
      break;
    }
    case 'galaxy': { // swirling nebula + twinkling stars
      const ga = ctx.globalAlpha;
      ctx.fillStyle = radial(ctx, Math.sin(t * 0.7) * 5, -6, 1, 18, [[0, 'rgba(255,90,220,.55)'], [1, 'rgba(255,90,220,0)']]); ctx.fillRect(-12, -30, 24, 50);
      ctx.fillStyle = radial(ctx, Math.cos(t * 0.5) * 5, 6, 1, 16, [[0, 'rgba(90,200,255,.5)'], [1, 'rgba(90,200,255,0)']]); ctx.fillRect(-12, -30, 24, 50);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 14; i++) {
        const sx = ((i * 53) % 22) - 11, sy = ((i * 37 + t * 8) % 46) - 28;
        ctx.globalAlpha = ga * (0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i)));
        ctx.fillRect(sx, sy, 1.2, 1.2);
      }
      ctx.globalAlpha = ga;
      break;
    }
    default:
  }
}

function weaponHardware(ctx, p, t) {
  const wc = WPN_COL[p.weapon] || '#fff';
  const steel = (x, y, w, h) => {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#455a64'); g.addColorStop(0.5, '#eceff1'); g.addColorStop(1, '#37474f');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  };
  const glow = (x, y, r, col) => {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, x, y, 0, r, [[0, col], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  };
  if (p.weapon === 'blaster') {
    for (const s of [-1, 1]) { steel(s * 11 - 2, -8, 4, 16); ctx.fillStyle = '#263238'; ctx.fillRect(s * 11 - 2.5, -9, 5, 2.4); glow(s * 11, -9, 5, 'rgba(255,220,100,.9)'); }
  } else if (p.weapon === 'pulse') {
    for (const x of [-13, -8, 8, 13]) { steel(x - 1.1, -6, 2.2, 15); glow(x, -7, 4, 'rgba(80,230,255,.9)'); }
  } else if (p.weapon === 'laser') {
    for (const s of [-1, 1]) { // prism fins
      ctx.fillStyle = 'rgba(255,170,230,.65)'; ctx.beginPath(); ctx.moveTo(s * 5, -12); ctx.lineTo(s * 11, 2); ctx.lineTo(s * 5, 4); ctx.closePath(); ctx.fill();
    }
    const g = ctx.createLinearGradient(-4, -36, 4, -22);
    g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#f06292'); g.addColorStop(1, '#880e4f');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -37); ctx.lineTo(4.5, -29); ctx.lineTo(0, -21); ctx.lineTo(-4.5, -29); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 0.8; ctx.stroke();
    glow(0, -29, 11 + Math.sin(t * 8) * 2, 'rgba(255,90,200,.7)');
  } else if (p.weapon === 'scatter') { // flared double barrel
    for (const s of [-1, 1]) {
      steel(s * 6 - 2.5, -9, 5, 18);
      ctx.fillStyle = '#263238'; ctx.beginPath(); ctx.moveTo(s * 6 - 4, -11); ctx.lineTo(s * 6 + 4, -11); ctx.lineTo(s * 6 + 2.5, -7); ctx.lineTo(s * 6 - 2.5, -7); ctx.closePath(); ctx.fill();
      glow(s * 6, -11, 5, 'rgba(255,170,60,.85)');
    }
  } else if (p.weapon === 'arc') { // tesla coil
    ctx.strokeStyle = '#9ad7ff'; ctx.lineWidth = 1.4;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(0, -22 + k * 3.2, 4 + k * 0.6, 1.4, 0, 0, 7); ctx.stroke(); }
    glow(0, -27, 9 + Math.sin(t * 20) * 2, 'rgba(90,190,255,.85)');
    ctx.strokeStyle = 'rgba(210,245,255,.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(4 + Math.sin(t * 40) * 3, -35); ctx.moveTo(0, -28); ctx.lineTo(-4 + Math.cos(t * 37) * 3, -34); ctx.stroke();
  } else if (p.weapon === 'drone') { // two orbiting wingmen
    for (const s of [-1, 1]) {
      const dx = s * 34, dy = -4 + 8 * Math.sin(t * 3 + s);
      ctx.fillStyle = '#1b2a2f'; ctx.beginPath(); ctx.ellipse(dx + 1.5, dy + 2, 7, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = radial(ctx, dx - 2, dy - 2, 1, 9, [[0, '#e8fff2'], [0.5, '#69f0ae'], [1, '#1b5e3b']]);
      ctx.beginPath(); ctx.ellipse(dx, dy, 7, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#0b1a14'; ctx.beginPath(); ctx.arc(dx, dy, 1.8, 0, 7); ctx.fill();
      glow(dx, dy + 5, 5, 'rgba(105,240,174,.7)');
      ctx.strokeStyle = 'rgba(105,240,174,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(s * 8, 2); ctx.lineTo(dx - s * 6, dy); ctx.stroke();
    }
  } else if (p.weapon === 'missile') {
    for (const s of [-1, 1]) { // under-wing pods with red noses
      steel(s * 17 - 3.5, 4, 7, 14);
      ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.moveTo(s * 17 - 3.5, 4); ctx.lineTo(s * 17, -3); ctx.lineTo(s * 17 + 3.5, 4); ctx.fill();
      ctx.fillStyle = '#263238'; ctx.fillRect(s * 17 - 3.5, 9, 7, 1.2);
    }
  }
  // power level: glowing orbs march along each wing; max power adds wing-tip halos
  for (let i = 0; i < p.power - 1; i++) {
    const u = (i + 1) / 5, pulse = 0.6 + 0.4 * Math.sin(t * 6 + i);
    for (const s of [-1, 1]) glow(s * (5 + 21 * u), -2 + 20 * u, 4.5 + pulse * 2, wc);
  }
  if (p.power >= 5) for (const s of [-1, 1]) glow(s * 24, 19, 9 + Math.sin(t * 9) * 2, wc);
}

// firing feedback at the nose: charge ring (laser), launch flash (missile), muzzle flare, heat shimmer (pulse)
function muzzle(ctx, p, t) {
  const cdMax = WPN_CD[p.weapon] || 0.2;
  const f = clamp(p.cd / cdMax, 0, 1);       // 1 right after firing -> 0 when ready
  const wc = WPN_COL[p.weapon] || '#fff';
  ctx.globalCompositeOperation = 'lighter';
  if (f > 0.02 && p.cd > 0) {
    const big = p.weapon === 'missile' ? 34 : p.weapon === 'laser' ? 26 : 16;
    ctx.fillStyle = radial(ctx, 0, -29, 0, big * f + 4, [[0, 'rgba(255,255,255,.95)'], [0.4, wc], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath(); ctx.arc(0, -29, big * f + 4, 0, 7); ctx.fill();
  }
  if (p.weapon === 'laser' && p.input.fire) { // converging charge ring
    const cp = 1 - f;
    ctx.strokeStyle = `rgba(255,120,220,${0.2 + cp * 0.7})`; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, -29, 22 - 15 * cp, 0, 7); ctx.stroke();
  }
  if (p.weapon === 'missile' && f > 0.4) { // launch smoke vents
    ctx.fillStyle = `rgba(255,180,80,${f * 0.5})`;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 17, 6 + (1 - f) * 10, 5 * f + 2, 0, 7); ctx.fill(); }
  }
  if (p.weapon === 'pulse' && p.input.fire) { // heat shimmer above the guns
    ctx.lineWidth = 3;
    for (let j = -1; j <= 1; j++) {
      ctx.strokeStyle = 'rgba(120,230,255,.11)';
      ctx.beginPath();
      for (let y = -32; y > -92; y -= 4) { const x = j * 7 + Math.sin(t * 28 + y * 0.35 + j) * 2.6; y === -32 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

// gun temperature under the ship: fills as you fire, flashes red when overheated, blue while an ice cube is active
function heatBar(ctx, p, t) {
  if (!(p.heat > 0.02 || p.ice > 0)) return;
  const w = 46, h = 5, x = p.x - w / 2, y = p.y + 30;
  ctx.save();
  ctx.fillStyle = 'rgba(8,12,40,.75)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  const f = clamp(p.heat, 0, 1);
  ctx.fillStyle = p.ice > 0 ? '#80d8ff' : p.oh ? (Math.floor(t * 8) % 2 ? '#ff1744' : '#ff8a80') : f > 0.7 ? '#ff7043' : f > 0.4 ? '#ffca28' : '#66bb6a';
  ctx.fillRect(x, y, w * (p.ice > 0 ? 1 : f), h);
  if (p.oh || p.ice > 0) {
    ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = p.ice > 0 ? '#b3e5fc' : '#ff8a80';
    ctx.fillText(p.ice > 0 ? 'COOL' : 'OVERHEAT', p.x, y + 16);
  }
  ctx.restore();
}
function ship(ctx, p, t) {
  const bank = clamp(((p.input.right ? 1 : 0) - (p.input.left ? 1 : 0)) * 0.22, -0.3, 0.3);
  const base = SKIN_BASE[p.skin] || p.color;
  ctx.save();
  ctx.translate(p.x, p.y);
  shadowEllipse(ctx, 10, 18, 24, 8, 0.25);
  if (p.inv > 0 && Math.floor(t * 14) % 2) ctx.globalAlpha = 0.5;
  if (p.skin === 'ghost') ctx.globalAlpha *= 0.62;
  ctx.rotate(bank * 0.6);
  ctx.scale(1 - Math.abs(bank) * 0.4, 1);

  // engine flame
  const fl = 14 + Math.random() * 10 + (p.input.up ? 8 : 0);
  ctx.globalCompositeOperation = 'lighter';
  const tc = p.skin === 'dragon' && (!p.trail || p.trail === 'ember') ? ['rgba(255,240,180,.95)', 'rgba(255,90,30,.85)', 'rgba(160,0,0,0)'] : trailColors(p.trail, t);
  ctx.fillStyle = radial(ctx, 0, 14, 1, fl + 6, [[0, tc[0]], [0.3, tc[1]], [1, tc[2]]]);
  ctx.beginPath(); ctx.moveTo(-7, 12); ctx.lineTo(0, 14 + fl); ctx.lineTo(7, 12); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const shipImg = getImg('ship');
  if (shipImg) drawSprite(ctx, 'ship', 64);
  else {
  // wings
  for (const s of [-1, 1]) {
    ctx.fillStyle = shade(base, -0.45);
    ctx.beginPath(); ctx.moveTo(s * 5, -2); ctx.lineTo(s * 26, 18); ctx.lineTo(s * 20, 22); ctx.lineTo(s * 6, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(base, -0.15);
    ctx.beginPath(); ctx.moveTo(s * 5, -2); ctx.lineTo(s * 20, 14); ctx.lineTo(s * 6, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(s * 24, 19, 2, 0, 7); ctx.fill();
  }
  // hull extrusion (thickness)
  for (let i = 5; i >= 1; i--) { ctx.fillStyle = shade(base, -0.55 - i * 0.04); hullPath(ctx, i); ctx.fill(); }
  const hg = ctx.createLinearGradient(-10, 0, 10, 0);
  hg.addColorStop(0, shade(base, -0.35)); hg.addColorStop(0.45, shade(base, 0.45)); hg.addColorStop(1, shade(base, -0.25));
  ctx.fillStyle = hg; hullPath(ctx); ctx.fill();
  ctx.save(); hullPath(ctx); ctx.clip(); skin(ctx, p, t); ctx.restore();
  if (p.skin === 'neon') { // glowing tube outline in the pilot's colour
    ctx.save(); ctx.shadowColor = p.color; ctx.shadowBlur = quality.level >= 2 ? 12 + Math.sin(t * 5) * 3 : 0; ctx.strokeStyle = p.color; ctx.lineWidth = 2;
    hullPath(ctx); ctx.stroke();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 5, -2); ctx.lineTo(s * 26, 18); ctx.lineTo(s * 20, 22); ctx.lineTo(s * 6, 14); ctx.stroke(); }
    ctx.restore();
  } else if (p.skin === 'ghost') { // fading echoes behind the hull
    const ga = ctx.globalAlpha;
    ctx.strokeStyle = 'rgba(190,220,255,.4)'; ctx.lineWidth = 1;
    for (let k = 1; k <= 3; k++) { ctx.globalAlpha = ga * Math.pow(0.6, k); ctx.save(); ctx.translate(0, k * 7); hullPath(ctx); ctx.stroke(); ctx.restore(); }
    ctx.globalAlpha = ga;
  } else if (p.skin === 'dragon') { // horns
    ctx.fillStyle = '#ffcf40';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 5, -22); ctx.lineTo(s * 11, -30); ctx.lineTo(s * 8, -17); ctx.closePath(); ctx.fill(); }
  }
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; hullPath(ctx); ctx.stroke();

  eventShip(ctx, p, t);
  weaponHardware(ctx, p, t);

  // cockpit
  ctx.fillStyle = radial(ctx, -2, -8, 1, 10, [[0, '#e1f5fe'], [0.5, '#29b6f6'], [1, '#01579b']]);
  ctx.beginPath(); ctx.ellipse(0, -6, 4.5, 9, 0, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(-1.5, -9, 1.4, 4, 0, 0, 7); ctx.fill();

  }
  muzzle(ctx, p, t);

  // shield bubble
  if (p.inv > 0) {
    ctx.globalAlpha = 0.5 + Math.sin(t * 10) * 0.15;
    ctx.strokeStyle = '#80d8ff'; ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(128,216,255,.12)';
    ctx.beginPath(); ctx.arc(0, 0, 32, 0, 7); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// ---------- HUD ----------
function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8,12,40,.6)'; ctx.strokeStyle = accentStroke(); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke();
}
function heartPath(ctx, x, y, s: number) {
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.9); ctx.bezierCurveTo(x - s * 1.5, y - s * 0.2, x - s * 0.7, y - s * 1.1, x, y - s * 0.5);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.5, y - s * 0.2, x, y + s * 0.9);
}
function fullHeart(ctx, x, y, s: number) {
  ctx.fillStyle = radial(ctx, x - s * 0.4, y - s * 0.5, 0.5, s * 1.6, [[0, '#ff9fb2'], [0.5, '#ff5277'], [1, '#b0124a']]);
  heartPath(ctx, x, y, s); ctx.fill();
}
function emptyHeart(ctx, x, y, s: number) { // cracked outline
  ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1;
  heartPath(ctx, x, y, s); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - s * 0.5); ctx.lineTo(x - s * 0.3, y); ctx.lineTo(x + s * 0.2, y + s * 0.3); ctx.lineTo(x - s * 0.1, y + s * 0.8); ctx.stroke();
}
function breakingHeart(ctx, x, y, s: number, age) { // two halves split and fall away
  const a = clamp(1 - age / 0.6, 0, 1);
  ctx.save(); ctx.globalAlpha = a;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.beginPath(); ctx.rect(side < 0 ? x - s * 2 : x, y - s * 2, s * 2, s * 4); ctx.clip();
    ctx.translate(x + side * age * 16, y + age * age * 60); ctx.rotate(side * age * 1.6); ctx.translate(-x, -y);
    fullHeart(ctx, x, y, s);
    ctx.restore();
  }
  ctx.restore();
}
function star(ctx, x, y, r, fill, scale) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath();
  ctx.fillStyle = fill ? radial(ctx, -r * 0.3, -r * 0.3, 1, r * 1.4, [[0, '#fff8c4'], [0.5, '#ffd54f'], [1, '#e08600']]) : 'rgba(255,255,255,.12)';
  ctx.fill(); ctx.strokeStyle = fill ? '#fff3b0' : 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

function ghost(ctx, p, t) {
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.globalAlpha = 0.4 + Math.sin(t * 4) * 0.1;
  ctx.fillStyle = 'rgba(128,216,255,.12)'; ctx.strokeStyle = p.color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = p.color;
  ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(10, 10); ctx.lineTo(0, 5); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  if (p.rv > 0) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 36, -Math.PI / 2, -Math.PI / 2 + (p.rv / 1.5) * Math.PI * 2); ctx.stroke();
  }
  ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#b3e5fc'; ctx.fillText('fly here to revive', 0, 46);
  ctx.restore();
}

function nameTag(ctx, p) {
  ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillText(p.name, p.x + 1, p.y - 38);
  ctx.fillStyle = p.color; ctx.fillText(p.name, p.x, p.y - 39);
}

function keyIcon(ctx, x, y, k) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.rotate(-0.6);
  ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(0, -4, 4.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#0d1233'; ctx.beginPath(); ctx.arc(0, -4, 1.8, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffd54f'; ctx.fillRect(-1.2, 0, 2.4, 11); ctx.fillRect(1.2, 7, 3.6, 2); ctx.fillRect(1.2, 10, 2.8, 2);
  ctx.restore();
}

function hud(ctx, s: State, me, t) {
  const list = Object.values(s.players);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  list.forEach((p, i) => {
    const y = 8 + i * 40;
    panel(ctx, 8, y, 210, 34);
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(22, y + 17, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#10163a'; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText((ROLES[p.role] || ROLES.ace).icon, 22, y + 17.5); ctx.textAlign = 'left';
    ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillStyle = '#e8eaf6';
    const label = p.id === me ? p.name + ' (you)' : p.name;
    ctx.fillText(label, 34, y + 11);
    if (p.ping != null) { // each pilot's measured latency to the server
      const px = 34 + ctx.measureText(label).width + 8;
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.fillStyle = p.ping < 60 ? '#69f0ae' : p.ping < 130 ? '#ffd54f' : '#ff6e6e';
      ctx.fillText(p.ping + 'ms', px, y + 12);
      ctx.font = 'bold 12px system-ui, sans-serif';
    }
    const slots = Math.min(5, Math.max(3, p.lives)), lost = heartLostAt(p.id);
    for (let l = 0; l < slots; l++) {
      const hx = 40 + l * 14, hy = y + 25;
      if (l < p.lives) fullHeart(ctx, hx, hy, 4.5);
      else if (lost !== undefined && l === p.lives && t - lost < 0.6) { emptyHeart(ctx, hx, hy, 4.5); breakingHeart(ctx, hx, hy, 4.5, t - lost); }
      else emptyHeart(ctx, hx, hy, 4.5);
    }
    // glowing power meter
    ctx.save();
    for (let w = 0; w < 5; w++) {
      const on = w < p.power;
      if (on && quality.level >= 2) { ctx.shadowColor = '#ffb300'; ctx.shadowBlur = 7; }
      const g = ctx.createLinearGradient(0, y + 21, 0, y + 29);
      g.addColorStop(0, on ? '#fff3b0' : 'rgba(255,255,255,.18)'); g.addColorStop(1, on ? '#ff9800' : 'rgba(255,255,255,.08)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(116 + w * 8, y + 21, 6, 8, 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    ctx.font = 'bold 10px system-ui, sans-serif'; ctx.fillStyle = WPN_COL[p.weapon] || '#fff';
    ctx.fillText(p.weapon.toUpperCase(), 162, y + 25);
    ctx.textAlign = 'right'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(String(p.score), 210, y + 11); ctx.textAlign = 'left';
  });
  if (list.length > 1) {
    const total = list.reduce((a, p) => a + p.score, 0);
    panel(ctx, W / 2 - 70, 8, 140, 26);
    ctx.textAlign = 'center'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.fillStyle = '#b2ff59';
    ctx.fillText(`TEAM ${total}`, W / 2, 21);
    // teammate status row (bottom-left): colour dot, lives, revive progress when down
    list.forEach((p, i) => {
      const x = 24 + i * 32, y = H - 22;
      ctx.globalAlpha = p.alive ? 1 : 0.55;
      ctx.fillStyle = p.alive ? p.color : '#37474f'; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill();
      ctx.strokeStyle = p.id === me ? '#fff' : 'rgba(255,255,255,.35)'; ctx.lineWidth = p.id === me ? 2 : 1; ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = p.alive ? '#10163a' : '#ff8a80';
      ctx.fillText(p.alive ? String(p.lives) : '✕', x, y + 0.5);
      if (!p.alive && p.rv > 0) {
        ctx.strokeStyle = '#80d8ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + (p.rv / 1.5) * Math.PI * 2); ctx.stroke();
      }
    });
  }
  panel(ctx, W - 88, 8, 80, 28);
  ctx.textAlign = 'center'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillStyle = '#ffd54f';
  ctx.fillText(`WAVE ${s.wave}`, W - 48, 22);

  const keyMe = s.players[me];
  if (keyMe) { // keys collected this run (claimed in the menu afterwards)
    panel(ctx, W - 176, 8, 82, 28);
    keyIcon(ctx, W - 160, 22, 1);
    ctx.textAlign = 'left'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillStyle = '#ffd54f';
    ctx.fillText('x' + (keyMe.keys || 0), W - 144, 22);
  }

  if (keyMe && keyMe.alive && !IS_TOUCH) { // role ability charge (touch devices show it on the button instead)
    const ready = keyMe.charge >= 100, gx = W - 40, gy = H - 52, role = ROLES[keyMe.role] || ROLES.ace;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,40,.7)'; ctx.beginPath(); ctx.arc(gx, gy, 24, 0, 7); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.beginPath(); ctx.arc(gx, gy, 20, 0, 7); ctx.stroke();
    ctx.strokeStyle = ready ? role.color : 'rgba(255,255,255,.7)';
    if (ready && quality.level >= 2 && !settings.reduceFlash) { ctx.shadowColor = role.color; ctx.shadowBlur = 12; }
    ctx.beginPath(); ctx.arc(gx, gy, 20, -Math.PI / 2, -Math.PI / 2 + (clamp(keyMe.charge, 0, 100) / 100) * Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = ready ? '#fff' : 'rgba(255,255,255,.6)'; ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ready ? role.ability.toUpperCase() : Math.floor(keyMe.charge) + '%', gx, gy);
    ctx.restore();
  }
  if (s.mut && s.mut.length) { // active run rules
    ctx.textAlign = 'center'; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,214,120,.85)';
    ctx.fillText('RULES: ' + s.mut.map((m) => (MUT_LABEL[m] || m)).join(' · ').toUpperCase(), W / 2, H - 5);
  }

  // combo counter
  const cb = getCombo(t);
  if (cb && cb.n >= 3) {
    const age = t - cb.last, a = age > 1.5 ? clamp((2 - age) / 0.5, 0, 1) : 1;
    const pop = 1 + Math.max(0, 0.18 - age) * 3, y = list.length > 1 ? 52 : 28;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, y); ctx.scale(pop, pop);
    ctx.font = 'bold 20px system-ui, sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,20,.8)';
    ctx.strokeText(`x${cb.n} COMBO`, 0, 0); ctx.fillStyle = COMBO_COL(cb.n); ctx.fillText(`x${cb.n} COMBO`, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(-45, 13, 90, 3);
    ctx.fillStyle = COMBO_COL(cb.n); ctx.fillRect(-45, 13, 90 * clamp(1 - age / 2, 0, 1), 3);
    ctx.restore();
  }

  const boss = s.chickens.find((c) => c.boss);
  if (boss) {
    panel(ctx, W / 2 - 130, H - 28, 260, 16);
    ctx.fillStyle = '#3b0d0d'; ctx.fillRect(W / 2 - 125, H - 24, 250, 8);
    const g = ctx.createLinearGradient(W / 2 - 125, 0, W / 2 + 125, 0);
    g.addColorStop(0, boss.sh ? '#ffd54f' : '#ff7043'); g.addColorStop(1, boss.sh ? '#ffb300' : '#d50000');
    ctx.fillStyle = g; ctx.fillRect(W / 2 - 125, H - 24, 250 * clamp(boss.hp / boss.max, 0, 1), 8);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillRect(W / 2 - 125 + 250 * 0.33, H - 24, 1.5, 8); ctx.fillRect(W / 2 - 125 + 250 * 0.66, H - 24, 1.5, 8);
    ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = boss.sh ? '#fff3b0' : '#ffccbc';
    ctx.fillText((BOSS_NAMES[boss.kind] || 'BOSS').toUpperCase() + (boss.sh ? '  -  SHIELDED' : ''), W / 2, H - 36);
  }
}

function summaryCard(ctx, s: State, t) {
  const sm = getSummary();
  if (!sm || !s.cleared || s.over || s.delay <= 0) return;
  const age = t - sm.at;
  const a = clamp(age * 4, 0, 1) * (s.delay < 0.3 ? s.delay / 0.3 : 1);
  const x = W / 2 - 150, y = H / 2 + 14 + (1 - a) * 16;
  ctx.save(); ctx.globalAlpha = a;
  panel(ctx, x, y, 300, 146);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 18px system-ui, sans-serif'; ctx.fillStyle = '#ffd54f'; ctx.fillText(`WAVE ${sm.wave} CLEAR`, W / 2, y + 20);
  ctx.font = '14px system-ui, sans-serif'; ctx.fillStyle = '#e8eaf6';
  ctx.textAlign = 'left'; ctx.fillText('Kills', x + 24, y + 48); ctx.fillText('Accuracy', x + 24, y + 68); ctx.fillText('Best combo', x + 24, y + 88);
  ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(String(sm.kills), x + 276, y + 48);
  ctx.fillText(`${Math.round(sm.acc * 100)}%`, x + 276, y + 68);
  ctx.fillText(`x${sm.bestCombo}`, x + 276, y + 88);
  for (let i = 0; i < 3; i++) {
    const on = i < sm.stars, appear = clamp((age - (0.45 + i * 0.26)) * 6, 0, 1);
    const scale = on ? (appear < 1 ? appear * 1.35 : 1 + Math.max(0, 0.35 - (age - (0.45 + i * 0.26) - 0.17) * 2) * 0.5) : 1;
    star(ctx, W / 2 + (i - 1) * 44, y + 120, 15, on && appear > 0, on ? Math.max(scale, 0.01) : 1);
  }
  if (sm.flawless) { ctx.textAlign = 'center'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillStyle = '#b2ff59'; ctx.fillText('FLAWLESS', W / 2, y + 140); }
  ctx.restore();
}

let vigCanvas = null; // the vignette never changes, so paint it once and blit it
function vignette(ctx) {
  if (!vigCanvas) {
    vigCanvas = document.createElement('canvas'); vigCanvas.width = W; vigCanvas.height = H;
    const g = vigCanvas.getContext('2d');
    g.fillStyle = radial(g, W / 2, H / 2, H * 0.45, H * 0.95, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,10,.55)']]);
    g.fillRect(0, 0, W, H);
  }
  ctx.drawImage(vigCanvas, 0, 0);
}

// shockwave lens: magnify the pixels under a ring edge for a heat-haze look
function lens(ctx) {
  for (const p of lensRings()) {
    const a = clamp(p.life / p.max, 0, 1);
    if (a < 0.05 || p.r < 8) continue;
    const th = 20 + p.r * 0.07;
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + th, 0, 7); ctx.arc(p.x, p.y, Math.max(0, p.r - th * 0.4), 0, 7, true);
    ctx.clip('evenodd');
    ctx.globalAlpha = a;
    const sc = 1 + 0.045 * a;
    ctx.translate(p.x, p.y); ctx.scale(sc, sc); ctx.translate(-p.x, -p.y);
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.restore();
  }
}

const MUT_LABEL = { rapid: 'Egg storm', glass: 'Glass hull', swarm: 'Swarm', drought: 'Drought', heavy: 'Thick hides', fast: 'Hyperdrive' };

// The sweeper's laser: a flickering dashed warning line first, then the beam itself.
function beams(ctx, s: State, t) {
  for (const c of s.chickens) {
    if (!c.beam) continue;
    const b = c.beam, ox = c.x, oy = c.y + 30, ex = ox + Math.sin(b.a) * 1000, ey = oy + Math.cos(b.a) * 1000;
    ctx.save(); ctx.lineCap = 'round';
    if (!b.on && b.t < 1.0) {
      ctx.strokeStyle = 'rgba(255,60,60,' + (settings.reduceFlash ? 0.4 : 0.25 + 0.25 * Math.sin(t * 24)) + ')'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
    } else if (b.on) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [w, col] of [[30, 'rgba(255,60,60,.22)'], [14, 'rgba(255,140,120,.55)'], [5, 'rgba(255,255,255,.95)']]) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// Role abilities: Nova ring, Aegis dome, Mend ring.
function pulses(ctx, s: State) {
  for (const p of s.fxPulse || []) {
    const a = clamp(1 - p.life / p.max, 0, 1), inv = 1 - a;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (p.kind === 'nova') {
      const r = p.r * (1 - (1 - a) ** 3);
      ctx.strokeStyle = 'rgba(255,170,60,' + inv + ')'; ctx.lineWidth = 16 * inv + 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.stroke();
      if (!settings.reduceFlash) { ctx.fillStyle = 'rgba(255,230,180,' + 0.35 * inv * inv + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); }
    } else if (p.kind === 'aegis') {
      ctx.fillStyle = 'rgba(90,170,255,' + 0.22 * inv + ')'; ctx.strokeStyle = 'rgba(170,215,255,' + 0.9 * inv + ')'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + 0.4 * Math.min(1, a * 3)), 0, 7); ctx.fill(); ctx.stroke();
    } else {
      const r = p.r * Math.min(1, a * 2.2);
      ctx.strokeStyle = 'rgba(105,240,174,' + inv + ')'; ctx.lineWidth = 6 * inv + 2; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(190,255,215,' + inv + ')';
      for (let i = 0; i < 8; i++) { const ang = (i / 8) * Math.PI * 2; ctx.fillRect(p.x + Math.cos(ang) * r * 0.7 - 1.5, p.y + Math.sin(ang) * r * 0.7 - 6 - a * 18, 3, 12); }
    }
    ctx.restore();
  }
}

// chain-lightning from the arc caster (kept in the sim state for a few frames)
function arcs(ctx, s: State) {
  if (!s.fxArcs) return;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const a of s.fxArcs) {
    const al = clamp(a.life / 0.2, 0, 1), dx = a.x2 - a.x1, dy = a.y2 - a.y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    for (const [w, col] of [[7, 'rgba(80,160,255,' + al * 0.3 + ')'], [3, 'rgba(170,225,255,' + al * 0.9 + ')'], [1.3, 'rgba(255,255,255,' + al + ')']]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x1, a.y1);
      for (let k = 1; k < 6; k++) {
        const u = k / 6, j = (((a.x1 * 7 + k * 13 + Math.floor(a.life * 40)) % 9) - 4) * 1.6;
        ctx.lineTo(a.x1 + dx * u + nx * j, a.y1 + dy * u + ny * j);
      }
      ctx.lineTo(a.x2, a.y2); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- main ----------
let lastT = 0, startWave = -1, startCount = 0;

export function draw(ctx, s: State, me, t, { paused, silent, quiet, replay }: { paused?: boolean; silent?: boolean; quiet?: boolean; replay?: boolean } = {}) {
  const dt = clamp(t - lastT, 0, 0.1); lastT = t;
  if (!paused) { detectEvents(s, me, t, silent || quiet); ambient(s); updateParts(dt); }

  if (s.wave !== startWave) { startWave = s.wave; startCount = s.chickens.length; }
  startCount = Math.max(startCount, s.chickens.length);
  const list = Object.values(s.players);
  const panic = s.pattern !== 'boss' && startCount >= 8 && s.chickens.length <= Math.max(3, Math.ceil(startCount * 0.25));
  const cenv = { players: list, panic };

  const mine = s.players[me];
  const wenv = {
    px: mine && mine.alive ? clamp((mine.x - W / 2) / (W / 2), -1, 1) : 0,
    q: quality.level, beat: settings.reduceFlash ? 0 : sfx.getBeat(), flare: settings.reduceFlash ? 0 : getFlare(), bullets: s.bullets, spark: (x, y) => spark(x, y),
  };

  const sh = settings.reduceFlash ? 0 : shakeAmount();
  ctx.save();
  if (sh > 0.5) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
  drawWorld(ctx, t, s.wave, wenv);

  eventBack(ctx, t, quality.level);
  for (const p of list) if (!p.alive && !s.over) ghost(ctx, p, t);
  const full = quality.level >= 2;
  for (const c of [...s.chickens].sort((a, b) => a.y - b.y)) {
    const ps = chickenSlot(c);
    if (ps) packChicken(ctx, c, t, ps);
    else if (full || c.boss) chicken(ctx, c, t, cenv); else chickenLite(ctx, c, t);
  }
  for (const g of s.gifts) gift(ctx, g, t);
  for (const e of s.eggs) egg(ctx, e, t);
  for (const m of s.meteors || []) meteor(ctx, m, t);
  bullets(ctx, s.bullets);
  arcs(ctx, s);
  beams(ctx, s, t);
  pulses(ctx, s);
  for (const p of list) if (p.alive) { ship(ctx, p, t); heatBar(ctx, p, t); }
  drawParts(ctx);
  if (list.length > 1) for (const p of list) if (p.alive) nameTag(ctx, p);
  eventFront(ctx, t, quality.level);
  if (quality.level >= 2) drawForeground(ctx, t, s.wave, wenv);
  vignette(ctx);
  ctx.restore();
  if (quality.level >= 2 && !(pack.opts.pixel > 1) && !settings.reduceFlash) lens(ctx);

  if (pack.colors.overlay && pack.colors.overlayAlpha > 0) {
    const n = parseInt(pack.colors.overlay.slice(1), 16);
    ctx.fillStyle = 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + pack.colors.overlayAlpha + ')';
    ctx.fillRect(0, 0, W, H);
  }
  if (!silent) { hud(ctx, s, me, t); summaryCard(ctx, s, t); }

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const glowText = (txt, y, size, col) => {
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    ctx.shadowColor = col; ctx.shadowBlur = quality.level >= 2 ? 24 : 0; ctx.fillStyle = col; ctx.fillText(txt, W / 2, y);
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.globalAlpha *= 0.85; ctx.fillText(txt, W / 2, y); ctx.globalAlpha /= 0.85;
  };
  if (s.bt > 0 && !s.over && !silent) {
    ctx.globalAlpha = clamp(s.bt, 0, 1);
    glowText(s.banner, H / 2 - 40, s.banner.length > 18 ? 34 : 44, s.banner.startsWith('Flawless') ? '#b2ff59' : '#ffd54f');
    ctx.globalAlpha = 1;
  }
  if (mine && !mine.alive && !s.over) {
    ctx.font = '18px system-ui, sans-serif'; ctx.fillStyle = '#cfd8ff';
    ctx.fillText(list.length > 1 ? 'You are down - a teammate can revive you' : 'You are down - respawn next wave', W / 2, H / 2 + 40);
  }
  if (s.over && !silent) {
    ctx.fillStyle = 'rgba(0,0,12,.7)'; ctx.fillRect(0, 0, W, H);
    glowText(s.banner || 'Game over', H / 2 - 30, 50, '#ff7043');
    ctx.font = '18px system-ui, sans-serif'; ctx.fillStyle = '#e8eaf6';
    ctx.fillText(replay ? 'Replay finished at wave ' + s.wave : 'Reached wave ' + s.wave + ' · Enter to restart (host) · Esc to leave', W / 2, H / 2 + 28);
    const mk = s.players[me];
    if (mk && mk.keys > 0) { ctx.fillStyle = '#ffd54f'; ctx.fillText('Keys collected: ' + mk.keys + ' — claim them in the menu', W / 2, H / 2 + 58); }
  }
  if (paused) glowText('PAUSED', H / 2, 44, '#fff');
}

/** Hangar preview: draws a ship with the given loadout-like options on a small canvas. */
export function drawShipPreview(ctx, w, h, o, t) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.fillStyle = radial(ctx, w / 2, h / 2, 4, w * 0.6, [[0, 'rgba(90,110,255,.25)'], [1, 'rgba(0,0,0,0)']]);
  ctx.fillRect(0, 0, w, h);
  const k = o.scale || 1.7;
  ctx.translate(w / 2, h / 2 + 4 + Math.sin(t * 2) * 2); ctx.scale(k, k);
  ship(ctx, {
    x: 0, y: 0, color: o.color || '#4fc3f7', skin: o.skin || 'plain', trail: o.trail || 'ember',
    input: { left: 0, right: 0, up: 0, down: 0, fire: 0 }, inv: 0, power: o.power || 3, weapon: o.weapon || 'blaster', cd: 0,
  }, t);
  ctx.restore();
}
