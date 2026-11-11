// Drawing for the newer bosses' hazards: falling giant eggs, lava, clock bubbles, disco lanes, frost, the magnet field,
// the ghost's trail, and frozen pilots. Positions come straight from the simulation (state.zones etc.).
import { W, H } from '../shared/sim';
import { radial } from './util';
import { settings } from './settings';

const TAU = Math.PI * 2;
const LANE_COL = ['#ff4081', '#ffd740', '#69f0ae', '#40c4ff', '#b388ff', '#ff6e40', '#64ffda', '#ea80fc'];

/** Hazards that lie on the floor: draw before the chickens. */
export function drawFloorZones(ctx, s, t) {
  for (const z of s.zones || []) {
    if (z.k === 'lava') lava(ctx, z, t);
    else if (z.k === 'frost') frost(ctx, z, t);
    else if (z.k === 'lane') lane(ctx, z, t);
    else if (z.k === 'bomb') { // landing marker that tightens as the egg falls
      const u = Math.min(1, z.t / z.fall);
      ctx.strokeStyle = `rgba(255,${80 + 100 * (1 - u) | 0},60,${0.5 + 0.4 * Math.sin(t * 14)})`; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (1.15 - 0.15 * u), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255,60,40,${0.08 + 0.18 * u})`; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
    }
  }
}

/** Things in the air: draw over the chickens and eggs. */
export function drawAirZones(ctx, s, t) {
  const boss = (s.chickens || []).find((c) => c.boss);
  for (const z of s.zones || []) {
    if (z.k === 'bomb') bomb(ctx, z, t);
    else if (z.k === 'clock') clock(ctx, z, t);
    else if (z.k === 'lava' && z.t < z.fall) fireball(ctx, z, t);
  }
  if (boss && boss.kind === 'magnet' && boss.pl) magnetField(ctx, s, boss, t);
  if (boss && boss.kind === 'ghost' && boss.hid) ghostTrail(ctx, boss, t);
}

/** Ice blocks over frozen pilots. */
export function drawFrozen(ctx, players, t) {
  for (const p of players) {
    if (!p.alive || !(p.frz > 0)) continue;
    const wob = Math.sin(t * 40) * 0.6;
    ctx.save(); ctx.translate(p.x + wob, p.y);
    ctx.fillStyle = 'rgba(150,215,255,.5)'; ctx.strokeStyle = 'rgba(230,248,255,.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-24, 18); ctx.lineTo(-28, -8); ctx.lineTo(-12, -28); ctx.lineTo(14, -26); ctx.lineTo(28, -6); ctx.lineTo(24, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-12, -22); ctx.lineTo(-6, -2); ctx.lineTo(-16, 10); ctx.moveTo(10, -20); ctx.lineTo(4, 4); ctx.stroke();
    const f = Math.min(1, p.frz / 1.4);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(-18, 24, 36 * f, 3);
    ctx.restore();
  }
}

/** A glassy ice shard in place of the egg sprite. */
export function drawIceShard(ctx, e, t) {
  ctx.save(); ctx.translate(e.x, e.y);
  ctx.rotate(Math.atan2(e.vy || 1, e.vx || 0) - Math.PI / 2);
  ctx.fillStyle = 'rgba(120,210,255,.28)'; ctx.beginPath(); ctx.ellipse(0, 4, 10, 16, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#c9f0ff'; ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(-6, -2); ctx.lineTo(0, -12); ctx.lineTo(6, -2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.moveTo(-1, 8); ctx.lineTo(-3, -1); ctx.lineTo(0, -6); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function bomb(ctx, z, t) {
  const spin = Math.sin(t * 8 + z.id) * 0.25;
  ctx.save(); ctx.translate(z.cx, z.cy); ctx.rotate(spin);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(4, 6, 24, 28, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = radial(ctx, -8, -10, 2, 34, [[0, '#fff8e8'], [0.6, '#f0b868'], [1, '#a86a1a']]);
  ctx.beginPath(); ctx.ellipse(0, 0, 22, 27, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#4a2f12'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = '#6b3d10'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-3, 2); ctx.lineTo(-7, 8); ctx.lineTo(2, 14); ctx.stroke();
  ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -27); ctx.quadraticCurveTo(6, -36, 12, -34); ctx.stroke();
  ctx.fillStyle = Math.floor(t * 16) % 2 ? '#ffee58' : '#ff7043'; ctx.beginPath(); ctx.arc(12, -34, 3.6 + Math.sin(t * 30) * 1, 0, TAU); ctx.fill();
  ctx.restore();
}

function fireball(ctx, z, t) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const u = Math.min(1, z.t / z.fall), x = z.sx + (z.x - z.sx) * u, y = z.sy + (z.y - z.sy) * u;
  ctx.fillStyle = radial(ctx, x, y, 2, 28, [[0, 'rgba(255,230,120,.95)'], [0.45, 'rgba(255,100,20,.6)'], [1, 'rgba(255,60,0,0)']]);
  ctx.beginPath(); ctx.arc(x, y, 28, 0, TAU); ctx.fill();
  ctx.restore();
}

function lava(ctx, z, t) {
  const warn = z.t < z.fall;
  if (warn) { ctx.strokeStyle = `rgba(255,120,40,${0.4 + 0.3 * Math.sin(t * 12)})`; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]); return; }
  const left = z.fall + z.life - z.t, a = Math.min(1, left / 0.8), wob = 1 + Math.sin(t * 5 + z.id) * 0.04;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(z.x, z.y); ctx.scale(wob, 0.62 * wob);
  ctx.fillStyle = '#3a0f05'; ctx.beginPath(); ctx.arc(0, 0, z.r + 5, 0, TAU); ctx.fill();
  ctx.fillStyle = radial(ctx, 0, 0, 2, z.r, [[0, '#ffe082'], [0.5, '#ff6d00'], [1, '#bf360c']]); ctx.beginPath(); ctx.arc(0, 0, z.r, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,170,.9)'; for (let i = 0; i < 4; i++) { const ph = (t * 1.2 + i * 0.25 + z.id) % 1; ctx.beginPath(); ctx.arc(Math.cos(i * 2.4 + z.id) * z.r * 0.55, Math.sin(i * 2.4) * z.r * 0.4 - ph * 6, 3 * (1 - ph), 0, TAU); ctx.fill(); }
  ctx.restore();
}

function frost(ctx, z, t) {
  const a = Math.min(1, (z.life - z.t) / 0.8, z.t / 0.4 + 0.2);
  ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.translate(z.x, z.y); ctx.scale(1, 0.62);
  ctx.fillStyle = radial(ctx, 0, 0, 4, z.r, [[0, 'rgba(235,250,255,.75)'], [1, 'rgba(120,200,255,.35)']]);
  ctx.beginPath(); ctx.arc(0, 0, z.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.4;
  for (let i = 0; i < 6; i++) { const ang = (i / 6) * TAU + z.id; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * z.r * 0.9, Math.sin(ang) * z.r * 0.9); ctx.stroke(); }
  ctx.restore();
}

function lane(ctx, z, t) {
  const x0 = z.x - z.w / 2, col = LANE_COL[z.col % LANE_COL.length];
  if (z.t < z.warn) { // floor tile flashes in its colour on the beat
    const flash = 0.18 + 0.22 * (Math.floor(z.t * 8) % 2);
    ctx.save(); ctx.globalAlpha = flash + 0.15 * z.t; ctx.fillStyle = col; ctx.fillRect(x0 + 2, 0, z.w - 4, H);
    ctx.globalAlpha = 0.7; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(x0 + 2, 0, z.w - 4, H); ctx.restore();
  } else {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = col; ctx.globalAlpha = 0.9; ctx.fillRect(x0, 0, z.w, H);
    ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.85; ctx.fillRect(z.x - z.w * 0.2, 0, z.w * 0.4, H);
    ctx.restore();
  }
}

function clock(ctx, z, t) {
  const burst = Math.max(0, (z.t - (z.life - 0.7)) / 0.7);
  const r = z.r * (1 + 0.08 * Math.sin(t * 3) + burst * 0.25);
  ctx.save(); ctx.translate(z.x, z.y);
  ctx.fillStyle = radial(ctx, 0, 0, r * 0.2, r, [[0, 'rgba(140,170,255,.05)'], [1, 'rgba(120,140,255,.38)']]); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(170,190,255,${0.6 + 0.3 * Math.sin(t * 9)})`; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = 'rgba(220,230,255,.8)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82); ctx.lineTo(Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94); ctx.stroke(); }
  ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(-t * 0.6 - 1.6) * r * 0.45, Math.sin(-t * 0.6 - 1.6) * r * 0.45); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(-t * 4 - 1.6) * r * 0.7, Math.sin(-t * 4 - 1.6) * r * 0.7); ctx.stroke();
  ctx.restore();
}

function magnetField(ctx, s, b, t) {
  ctx.save(); ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) { const ph = (t * 0.9 + i / 3) % 1; ctx.strokeStyle = `rgba(255,${90 + i * 40},90,${0.5 * (1 - ph)})`; ctx.beginPath(); ctx.arc(b.x, b.y, 40 + (1 - ph) * 190, 0, TAU); ctx.stroke(); }
  if (!settings.reduceFlash) for (const p of Object.values(s.players) as any[]) {
    if (!p.alive) continue;
    ctx.strokeStyle = 'rgba(120,170,255,.35)'; ctx.setLineDash([6, 8]); ctx.lineDashOffset = -t * 40;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 10); ctx.lineTo(b.x, b.y + 30); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.restore();
}

function ghostTrail(ctx, b, t) {
  const x1 = b.x, x2 = b.gx ?? b.x, y = b.y;
  ctx.save(); ctx.fillStyle = 'rgba(200,240,255,.55)';
  for (let i = 0; i < 9; i++) {
    const u = i / 8, x = x1 + (x2 - x1) * u, yy = y + Math.sin(t * 5 + i) * 10 - 8;
    ctx.save(); ctx.translate(x, yy); ctx.rotate(Math.sin(t * 3 + i) * 0.8); ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.2, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.strokeStyle = `rgba(125,249,255,${0.5 + 0.4 * Math.sin(t * 8)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x2, y, 38, 0, TAU); ctx.stroke(); // where it will reappear
  ctx.restore();
}
