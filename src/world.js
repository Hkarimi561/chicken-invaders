import { W, H } from '../shared/sim.js';
import { radial, clamp } from './util.js';
import { getImg } from './packs.js';

// Six themed backdrops; the world changes every 5 waves. `kind` selects extra scenery.
const WORLDS = [
  { kind: 'nebula', sky: ['#04061a', '#0a1038', '#1a1148'], flare: '170,190,255',
    neb: [{ x: 180, y: 160, r: 260, c: '110,60,200', s: 8 }, { x: 640, y: 380, r: 300, c: '30,110,190', s: 12 }, { x: 420, y: 520, r: 220, c: '190,60,120', s: 10 }],
    planet: { x: 650, y: 120, r: 62, c: ['#6a7bd8', '#2c3a8c', '#0d1240'], ring: true } },
  { kind: 'rocks', sky: ['#120706', '#2a1408', '#3d1c10'], flare: '255,190,120',
    neb: [{ x: 200, y: 200, r: 280, c: '230,110,40', s: 9 }, { x: 620, y: 420, r: 300, c: '170,50,50', s: 12 }],
    planet: { x: 140, y: 110, r: 46, c: ['#d08a52', '#7a4426', '#2a1209'], ring: false } },
  { kind: 'ice', sky: ['#031a22', '#06303a', '#0b4a52'], flare: '150,255,220',
    neb: [{ x: 300, y: 150, r: 300, c: '60,220,180', s: 10 }, { x: 600, y: 380, r: 280, c: '80,140,255', s: 13 }],
    planet: { x: 600, y: 140, r: 78, c: ['#e8f4ff', '#8fb4d6', '#26425e'], ring: false } },
  { kind: 'farm', sky: ['#081a3a', '#14456a', '#2e7a6a'], flare: '255,240,160',
    neb: [{ x: 220, y: 140, r: 250, c: '120,210,255', s: 11 }, { x: 640, y: 260, r: 220, c: '255,230,150', s: 14 }],
    planet: null },
  { kind: 'city', sky: ['#0d0024', '#2a0a56', '#7a1a7a'], flare: '255,120,230',
    neb: [{ x: 160, y: 140, r: 260, c: '255,60,200', s: 9 }, { x: 650, y: 200, r: 280, c: '60,200,255', s: 12 }],
    planet: null },
  { kind: 'lava', sky: ['#160303', '#3a0c05', '#7a2205'], flare: '255,170,80',
    neb: [{ x: 250, y: 380, r: 320, c: '255,90,20', s: 8 }, { x: 600, y: 300, r: 260, c: '200,40,20', s: 12 }],
    planet: null },
];
export const worldIndex = (wave) => Math.floor((Math.max(1, wave) - 1) / 5) % WORLDS.length;

const layers = [
  { n: 40, speed: 14, size: 1.0, a: 0.35, par: 5 },
  { n: 28, speed: 34, size: 1.6, a: 0.6, par: 12 },
  { n: 16, speed: 70, size: 2.4, a: 0.95, par: 22 },
].map((l, li) => ({
  ...l,
  pts: Array.from({ length: l.n }, (_, i) => ({ x: (i * 137.5 + li * 53) % W, y: (i * 91.7 + li * 29) % H, tw: i * 0.7 })),
}));

// ---------- asteroid belt ----------
const rocks = Array.from({ length: 11 }, (_, i) => ({
  x: (i * 211) % W, y: (i * 163) % H, r: 14 + ((i * 7) % 5) * 7, sp: 18 + (i % 4) * 14, rs: ((i % 3) - 1) * 0.4 + 0.2, flash: 0,
  pts: Array.from({ length: 9 }, (_, k) => 0.7 + (((i * 31 + k * 17) % 10) / 10) * 0.5),
}));
const rockXY = (r, t) => ({ x: r.x + Math.sin(t * 0.2 + r.r) * 12, y: ((r.y + t * r.sp) % (H + 120)) - 60 });

function drawRock(ctx, r, t, ox) {
  const { x, y } = rockXY(r, t);
  ctx.save(); ctx.translate(x + ox, y); ctx.rotate(t * r.rs);
  const path = (dx, dy) => {
    ctx.beginPath();
    r.pts.forEach((k, i) => {
      const a = (i / r.pts.length) * Math.PI * 2;
      const px = Math.cos(a) * r.r * k + dx, py = Math.sin(a) * r.r * k + dy;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.closePath();
  };
  ctx.fillStyle = '#1b0e08'; path(3, 4); ctx.fill();
  ctx.fillStyle = radial(ctx, -r.r * 0.3, -r.r * 0.3, 1, r.r * 1.3, [[0, '#b58a6a'], [0.6, '#6a4730'], [1, '#2a170d']]);
  path(0, 0); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.arc(r.r * 0.2, r.r * 0.1, r.r * 0.22, 0, 7); ctx.fill();
  if (r.flash > 0) { ctx.fillStyle = `rgba(255,210,140,${r.flash * 2})`; path(0, 0); ctx.fill(); }
  ctx.restore();
}

// ---------- scenery per world ----------
function farm(ctx, t, ox) {
  // glowing planet limb with field patchwork
  const cx = W / 2 + ox * 0.5, cy = H + 380, R = 520;
  ctx.fillStyle = radial(ctx, cx, cy - R, 30, R * 1.1, [[0, '#8bd05a'], [0.55, '#3f8d3a'], [1, '#12351c']], cx, cy);
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
  for (let i = 1; i < 9; i++) {
    ctx.strokeStyle = i % 2 ? 'rgba(255,230,120,.16)' : 'rgba(20,70,30,.25)'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(cx, cy, R - i * 16, 0, 7); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(190,255,200,.45)'; ctx.lineWidth = 3; // atmosphere rim
  ctx.beginPath(); ctx.arc(cx, cy, R + 1, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  const topY = (x) => cy - Math.sqrt(Math.max(0, R * R - (x - cx) ** 2));
  const barn = (x) => { // barn + silo silhouettes standing on the limb
    const y = topY(x), tilt = (x - cx) / R;
    ctx.save(); ctx.translate(x, y + 3); ctx.rotate(tilt);
    ctx.fillStyle = '#5a1212'; ctx.fillRect(-16, -22, 32, 22);
    ctx.fillStyle = '#3a0c0c'; ctx.beginPath(); ctx.moveTo(-19, -22); ctx.lineTo(0, -36); ctx.lineTo(19, -22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e6d6b0'; ctx.fillRect(-4, -14, 8, 14);
    ctx.fillStyle = '#9aa7b3'; ctx.fillRect(22, -34, 10, 34); // silo
    ctx.beginPath(); ctx.arc(27, -34, 5, Math.PI, 0); ctx.fill();
    ctx.restore();
  };
  barn(cx - 190 + ox * 0.2); barn(cx + 150 + ox * 0.2);
  for (let i = 0; i < 6; i++) { // hay bales drifting in orbit (shaded rolls)
    const x = ((i * 157 + t * (6 + i * 2)) % (W + 80)) - 40 + ox, y = 90 + ((i * 83) % 260) + Math.sin(t * 0.5 + i) * 10;
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.3 + i);
    ctx.fillStyle = '#6b4a14'; ctx.beginPath(); ctx.arc(2.5, 3, 15, 0, 7); ctx.fill();
    ctx.fillStyle = radial(ctx, -4, -4, 1, 18, [[0, '#ffe9a0'], [0.6, '#d9a93a'], [1, '#8a6212']]);
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,10,.5)'; ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.arc(0, 0, k * 4, 0, 7); ctx.stroke(); }
    ctx.restore();
  }
  for (let i = 0; i < 3; i++) { // scarecrow satellites
    const x = 140 + i * 250 + Math.sin(t * 0.25 + i * 2) * 40 + ox * 1.2, y = 120 + i * 70 + Math.cos(t * 0.3 + i) * 14;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.4 + i) * 0.3);
    ctx.fillStyle = '#1a1208'; ctx.fillRect(-1.5, -14, 3, 30); ctx.fillRect(-16, -6, 32, 3);
    ctx.beginPath(); ctx.arc(0, -17, 5, 0, 7); ctx.fill();
    ctx.fillRect(-9, -24, 18, 3); ctx.beginPath(); ctx.moveTo(-5, -24); ctx.lineTo(0, -34); ctx.lineTo(5, -24); ctx.fill();
    ctx.strokeStyle = '#d9b44a'; ctx.lineWidth = 1.5; // straw
    for (const sx of [-16, 16]) { ctx.beginPath(); ctx.moveTo(sx, -5); ctx.lineTo(sx + Math.sign(sx) * 4, 2); ctx.stroke(); }
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,255,255,.08)'; // slow clouds
  for (let i = 0; i < 4; i++) {
    const x = ((i * 260 + t * 8) % (W + 300)) - 150 + ox * 0.4, y = 60 + i * 90;
    for (const [dx, dy, r] of [[0, 0, 36], [30, 6, 28], [-30, 8, 26], [10, -12, 24]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, 7); ctx.fill(); }
  }
}

function city(ctx, t, ox, beat) {
  const hy = H * 0.72;
  const sg = radial(ctx, W / 2, hy, 10, 120, [[0, '#fff7a8'], [0.45, '#ff9a4d'], [1, '#ff2d9a']], W / 2, hy);
  ctx.save(); ctx.beginPath(); ctx.arc(W / 2 + ox * 0.3, hy - 10, 110, Math.PI, 0); ctx.clip();
  ctx.fillStyle = sg; ctx.fillRect(0, hy - 130, W, 130);
  ctx.fillStyle = 'rgba(30,0,60,.92)'; // retro scan bars
  for (let i = 0; i < 6; i++) ctx.fillRect(0, hy - 70 + i * 12, W, 2 + i * 1.5);
  ctx.restore();
  // skyline
  for (let i = 0; i < 18; i++) {
    const bw = 28 + (i * 13) % 34, bh = 40 + ((i * 47) % 100), bx = i * 46 - 10 + ox * 0.6;
    ctx.fillStyle = '#0a0220'; ctx.fillRect(bx, hy - bh, bw, bh);
    ctx.fillStyle = 'rgba(120,60,200,.25)'; ctx.fillRect(bx + bw - 3, hy - bh, 3, bh); // lit edge
    for (let wy = hy - bh + 6; wy < hy - 6; wy += 9)
      for (let wx = bx + 4; wx < bx + bw - 6; wx += 8) {
        const on = ((wx * 7 + wy * 13 + Math.floor(t * 0.6 + i)) % 5) < 2;
        if (on) { ctx.fillStyle = (wx + wy) % 3 ? 'rgba(80,230,255,.85)' : 'rgba(255,90,200,.85)'; ctx.fillRect(wx, wy, 3, 4); }
      }
  }
  // grid floor
  const fg = ctx.createLinearGradient(0, hy, 0, H);
  fg.addColorStop(0, '#2a0a50'); fg.addColorStop(1, '#0a0220');
  ctx.fillStyle = fg; ctx.fillRect(-20, hy, W + 40, H - hy);
  ctx.strokeStyle = `rgba(255,70,210,${0.35 + beat * 0.35})`; ctx.lineWidth = 1.2;
  for (let i = -14; i <= 14; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + ox, hy); ctx.lineTo(W / 2 + i * 130 + ox * 2, H); ctx.stroke(); }
  for (let k = 0; k < 9; k++) {
    const u = ((k + (t * 0.35) % 1) / 9), y = hy + (H - hy) * u * u;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = radial(ctx, W / 2, hy, 0, 260, [[0, `rgba(255,80,200,${0.3 + beat * 0.2})`], [1, 'rgba(255,80,200,0)']]);
  ctx.fillRect(0, hy - 120, W, 240);
  ctx.globalCompositeOperation = 'source-over';
}

function lava(ctx, t, ox, beat) {
  const fy = H - 70;
  const volcano = (x, w, h) => {
    ctx.fillStyle = '#1a0805';
    ctx.beginPath(); ctx.moveTo(x - w, fy); ctx.lineTo(x - w * 0.18, fy - h); ctx.lineTo(x + w * 0.18, fy - h); ctx.lineTo(x + w, fy); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, x, fy - h, 0, w * 0.6, [[0, `rgba(255,150,40,${0.8 + beat * 0.2})`], [1, 'rgba(255,60,10,0)']]);
    ctx.beginPath(); ctx.arc(x, fy - h, w * 0.6, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,100,20,.55)'; ctx.lineWidth = 2.5; // lava streaks
    for (const k of [-0.1, 0.05, 0.12]) { ctx.beginPath(); ctx.moveTo(x + k * w, fy - h); ctx.lineTo(x + k * w * 3.4, fy - 8); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
  };
  volcano(130 + ox * 0.5, 150, 150); volcano(480 + ox * 0.5, 190, 190); volcano(720 + ox * 0.5, 120, 110);
  const lg = ctx.createLinearGradient(0, fy, 0, H);
  lg.addColorStop(0, '#ff7a18'); lg.addColorStop(0.5, '#d83a05'); lg.addColorStop(1, '#5a0f02');
  ctx.fillStyle = lg; ctx.fillRect(-20, fy, W + 40, H - fy + 20);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 12; i++) { // churning lava blobs
    const bx = (i * 83 + Math.sin(t * 0.7 + i) * 30) % W, by = fy + 10 + ((i * 29) % 50) + Math.sin(t * 1.3 + i) * 5;
    ctx.fillStyle = radial(ctx, bx, by, 0, 34, [[0, 'rgba(255,230,120,.7)'], [1, 'rgba(255,100,20,0)']]);
    ctx.beginPath(); ctx.ellipse(bx, by, 36, 13, 0, 0, 7); ctx.fill();
  }
  ctx.fillStyle = radial(ctx, W / 2, fy, 0, 420, [[0, `rgba(255,110,30,${0.28 + beat * 0.15})`], [1, 'rgba(255,60,10,0)']]);
  ctx.fillRect(0, fy - 300, W, 380);
  for (let i = 0; i < 40; i++) { // rising embers
    const sp = 30 + (i % 5) * 14;
    const x = ((i * 97) % W) + Math.sin(t + i) * 14 + ox * 0.8, y = H - ((t * sp + i * 53) % (H + 40));
    ctx.fillStyle = `rgba(255,${120 + (i % 4) * 30},40,${0.45 + 0.3 * Math.sin(t * 3 + i)})`;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- main background ----------
let lastT = 0;
const backdrops = new Map(); // cache for quality <= 1: sky/nebula/planet (+ frozen scenery at quality 0)

/** Sky gradient, nebulae, aurora and planet. */
function paintSky(ctx, t, w, px, beat, flare) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, w.sky[0]); g.addColorStop(0.6, w.sky[1]); g.addColorStop(1, w.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(-40, -40, W + 80, H + 80);

  ctx.globalCompositeOperation = 'lighter';
  for (const n of w.neb) { // nebulae breathe with the music
    const ox = Math.sin(t / n.s) * 30 - px * 6, oy = (t * 6) % 60;
    const a = 0.28 * (1 + 0.55 * beat);
    ctx.fillStyle = radial(ctx, n.x + ox, n.y + oy, 0, n.r * (1 + 0.04 * beat), [[0, 'rgba(' + n.c + ',' + a + ')'], [1, 'rgba(' + n.c + ',0)']]);
    ctx.fillRect(-40, -40, W + 80, H + 80);
  }
  if (w.kind === 'ice') { // aurora ribbons flare up on boss kills
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 90 + i * 34 + Math.sin(x / 90 + t * 0.6 + i * 1.7) * 26);
      ctx.lineTo(W, 0); ctx.closePath();
      const ag = ctx.createLinearGradient(0, 0, 0, 240);
      const base = [0.16, 0.14, 0.12][i] * (1 + flare * 3.5 + beat * 0.4);
      ag.addColorStop(0, 'rgba(0,0,0,0)');
      ag.addColorStop(1, ['rgba(80,255,190,' + base + ')', 'rgba(110,170,255,' + base + ')', 'rgba(190,110,255,' + base + ')'][i]);
      ctx.fillStyle = ag; ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  const p = w.planet;
  if (p) {
    const py = p.y + Math.sin(t / 20) * 4, pox = -px * 10;
    ctx.fillStyle = radial(ctx, p.x + pox - p.r * 0.3, py - p.r * 0.3, 4, p.r * 1.1, [[0, p.c[0]], [0.6, p.c[1]], [1, p.c[2]]]);
    ctx.beginPath(); ctx.arc(p.x + pox, py, p.r, 0, 7); ctx.fill();
    if (p.ring) {
      ctx.strokeStyle = 'rgba(160,180,255,.25)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(p.x + pox, py, p.r * 1.6, p.r * 0.32, -0.35, 0, 7); ctx.stroke();
    }
  }
}

function paintScenery(ctx, t, w, env, dt) {
  const sceneOx = -(env.px || 0) * 16, beat = env.beat || 0;
  if (w.kind === 'rocks') {
    for (const r of rocks) {
      if (r.flash > 0) r.flash = Math.max(0, r.flash - dt);
      const { x, y } = rockXY(r, t);
      for (const b of env.bullets || []) {
        if ((b.x - (x + sceneOx)) ** 2 + (b.y - y) ** 2 < (r.r + 3) ** 2) { // bullets strike rocks
          if (r.flash < 0.1) env.spark?.(b.x, b.y);
          r.flash = 0.3;
        }
      }
      drawRock(ctx, r, t, sceneOx);
    }
  } else if (w.kind === 'farm') farm(ctx, t, sceneOx);
  else if (w.kind === 'city') city(ctx, t, sceneOx, beat);
  else if (w.kind === 'lava') lava(ctx, t, sceneOx, beat);
}

function paintStars(ctx, t, w, px, calm) {
  const dim = w.kind === 'city' || w.kind === 'lava' ? 0.6 : 1;
  for (const l of layers) {
    for (const q of l.pts) {
      ctx.globalAlpha = calm ? l.a * 0.8 * dim : l.a * (0.7 + 0.3 * Math.sin(t * 2 + q.tw)) * dim;
      ctx.fillStyle = '#dfe6ff';
      ctx.fillRect(((q.x - px * l.par) % W + W) % W, (q.y + t * l.speed) % H, l.size, l.size * (l.speed > 30 ? 2.2 : 1));
    }
  }
  ctx.globalAlpha = 1;
}

function getBackdrop(widx, withScenery) {
  const key = widx + (withScenery ? 's' : 'n');
  let c = backdrops.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    paintSky(g, 0, WORLDS[widx], 0, 0, 0);
    if (withScenery) paintScenery(g, 0, WORLDS[widx], {}, 0);
    backdrops.set(key, c);
  }
  return c;
}

/**
 * env.q is the render quality: 2 paints everything live; 1 blits a cached sky and animates only the
 * scenery; 0 blits a fully cached backdrop (scenery frozen) and only moves the stars.
 */
export function drawWorld(ctx, t, wave, env = {}) {
  const dt = clamp(t - lastT, 0, 0.1); lastT = t;
  const wi = worldIndex(wave), w = WORLDS[wi];
  const q = env.q === undefined ? 2 : env.q, px = env.px || 0, flare = env.flare || 0;

  const bg = getImg('background'); // a pack's own backdrop replaces the generated world
  if (bg) {
    const iw = bg.el.naturalWidth, ih = bg.el.naturalHeight, k = Math.max(W / iw, (H + 80) / ih) * bg.scale;
    const w2 = iw * k, h2 = ih * k, yy = ((t * 10) % 80) - 80;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(bg.el, (W - w2) / 2 - px * 8, yy + (H + 80 - h2) / 2, w2, h2);
    paintStars(ctx, t, w, px, true);
    return;
  }

  if (q >= 2) { paintSky(ctx, t, w, px, env.beat || 0, flare); paintScenery(ctx, t, w, env, dt); }
  else if (q === 1) { ctx.drawImage(getBackdrop(wi, false), 0, 0); paintScenery(ctx, t, w, env, dt); }
  else ctx.drawImage(getBackdrop(wi, true), 0, 0);

  paintStars(ctx, t, w, px, q < 2);

  if (q >= 2 && flare > 0.02) { // boss-kill flash tinted to the world
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(' + w.flare + ',' + flare * 0.35 + ')'; ctx.fillRect(-40, -40, W + 80, H + 80);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------- foreground: fast streaks + out-of-focus debris, parallaxing the opposite way ----------
export function drawForeground(ctx, t, wave, env = {}) {
  const w = WORLDS[worldIndex(wave)];
  const px = env.px || 0;
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) { // speed streaks
    const sp = 520 + (i % 5) * 140, len = 50 + (i % 4) * 30;
    const x = ((i * 59) % W) + px * 36, y = ((t * sp + i * 97) % (H + 260)) - 130;
    ctx.strokeStyle = `rgba(200,220,255,${0.05 + (i % 3) * 0.03})`; ctx.lineWidth = 1 + (i % 3) * 0.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
  }
  const tint = { rocks: '40,20,12', lava: '60,10,4', city: '30,0,50', farm: '8,30,20', ice: '2,25,32', nebula: '5,5,30' }[w.kind];
  for (let i = 0; i < 3; i++) { // bokeh debris drifting past the camera
    const sp = 150 + i * 50, r = 40 + i * 22;
    const x = ((i * 307 + 120) % W) + px * 60, y = ((t * sp + i * 311) % (H + 400)) - 200;
    ctx.fillStyle = radial(ctx, x, y, 0, r, [[0, `rgba(${tint},.28)`], [0.7, `rgba(${tint},.16)`], [1, `rgba(${tint},0)`]]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 22; i++) { // dust specks
    const x = ((i * 83) % W) + px * 28 + Math.sin(t + i) * 6, y = ((t * (90 + (i % 4) * 40) + i * 53) % (H + 20));
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.globalCompositeOperation = 'source-over';
}
