import { H, W } from '../shared/sim';
import type { State, Player } from '../shared/types';
import { clamp, quality } from './util';
import { settings } from './settings';
import * as sfx from './audio';
import { sparkColors } from './events-art';
import { TRAIL_INFO } from '../shared/catalog';

// Client-only effects. Events are inferred by diffing consecutive states, so
// the same code works for single player and server snapshots.
let parts = [];
let prev = null;
let shake = 0;
let flare = 0;              // background flash (boss kill)
let hitStop = 0, slowMo = 0; // time effects (single player only)
let combo = { n: 0, last: -99, best: 0 };
let base = {};              // per-player stat baselines at wave start
let summary = null;         // frozen end-of-wave stats
const burstDone = new Set();
const lostAt = {};          // player id -> time a life was lost (heart-crack animation)

const VEST_COL = [null, '#ef5350', '#ffa726', '#42a5f5', '#66bb6a'];

export function resetFx() {
  parts = []; prev = null; shake = 0; flare = 0; hitStop = 0; slowMo = 0;
  combo = { n: 0, last: -99, best: 0 }; base = {}; summary = null; burstDone.clear();
  for (const k in lostAt) delete lostAt[k];
}
export const shakeAmount = () => shake;
export const addShake = (v) => { shake = Math.max(shake, v); };
export const getFlare = () => flare;
export const getSummary = () => summary;
export const heartLostAt = (id) => lostAt[id];
export const getCombo = (t) => (t - combo.last < 2 ? combo : null);
export const lensRings = () => parts.filter((p) => p.type === 'ring' && p.lens);

/** Returns the factor to scale simulation time by this frame (hit-stop / slow-mo). */
export function timeScale(realDt) {
  if (settings.reduceFlash) { hitStop = 0; slowMo = 0; return 1; }
  if (hitStop > 0) { hitStop -= realDt; return 0; }
  if (slowMo > 0) { slowMo -= realDt; return 0.28; }
  return 1;
}

export function burst(x, y, n, colors, speed = 220, size = 4, life = 0.7, type = 'spark') {
  if (parts.length > (quality.level >= 2 ? 800 : quality.level === 1 ? 300 : 120)) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.9);
    parts.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (type === 'feather' ? 40 : 0),
      life, max: life * (0.6 + Math.random() * 0.6), size: size * (0.5 + Math.random()),
      c: colors[(Math.random() * colors.length) | 0], type, rot: Math.random() * 6,
    });
  }
}
function ring(x, y, speed, life, color, w = 3, lens = false) {
  parts.push({ type: 'ring', x, y, r: 6, vr: speed, life, max: life, c: color, w, lens });
}
function text(x, y, txt, color, size = 16, life = 0.95) {
  parts.push({ type: 'text', x, y, vx: 0, vy: -55, life, max: life, txt, c: color, size, rot: 0 });
}

const GIFT_COL = { power: ['#ffd54f', '#fff'], life: ['#ff5277', '#fff'], food: ['#ff9800', '#fff'], wpn: ['#80d8ff', '#fff'], ice: ['#b3e5fc', '#ffffff'], key: ['#ffd54f', '#fff8c4'] };
const GIFT_TXT = { power: '+POWER', life: '+1 LIFE', food: '+100', key: '+1 KEY', ice: 'COOLED!' };
const WPN_TXT = { blaster: 'BLASTER', pulse: 'PULSE', laser: 'LASER', missile: 'MISSILE' };
export const COMBO_COL = (n) => (n >= 40 ? '#18ffff' : n >= 20 ? '#ff4df0' : n >= 10 ? '#ff9100' : n >= 5 ? '#ffd740' : '#ffffff');

function snapshotBase(s: State) {
  base = {};
  for (const p of Object.values(s.players)) base[p.id] = { shots: p.shots || 0, hits: p.hits || 0, kills: p.kills || 0 };
}
function computeSummary(s: State) {
  let shots = 0, hits = 0, kills = 0;
  for (const p of Object.values(s.players)) {
    const b = base[p.id] || { shots: 0, hits: 0, kills: 0 };
    shots += (p.shots || 0) - b.shots; hits += (p.hits || 0) - b.hits; kills += (p.kills || 0) - b.kills;
  }
  const acc = shots > 0 ? clamp(hits / shots, 0, 1) : 0;
  const flawless = !!s.flaw;
  return { wave: s.wave, kills, acc, flawless, stars: 1 + (acc >= 0.6 ? 1 : 0) + (flawless ? 1 : 0), bestCombo: combo.best };
}

export function detectEvents(s: State, me, t, silent = false) {
  const snd = silent ? { shoot() {}, kill() {}, hit() {}, gift() {}, revive() {}, wave() {}, flawless() {}, gameOver() {}, combo() {}, splat() {}, crack() {}, star() {}, ability() {}, bossLaser() {}, explode() {} } : sfx;
  const boss = s.chickens.find((c) => c.boss);
  const cur = {
    chickens: new Map(s.chickens.map((c) => [c.id, c])),
    chickHp: new Map(s.chickens.map((c) => [c.id, c.hp])),
    gifts: new Map(s.gifts.map((g) => [g.id, g])),
    eggs: new Map(s.eggs.map((e) => [e.id, { x: e.x, y: e.y }])),
    meteors: new Map((s.meteors || []).map((m) => [m.id, { x: m.x, y: m.y, r: m.r, warn: m.warn }])),
    players: Object.fromEntries(Object.values(s.players).map((p) => [p.id, { alive: p.alive, lives: p.lives, cd: p.cd, x: p.x, y: p.y, inv: p.inv, color: p.color }])),
    wave: s.wave, over: s.over, cleared: s.cleared, ph: boss ? boss.ph : 0, sh: boss ? boss.sh : 0, boss: !!boss,
    pulses: new Set((s.fxPulse || []).map((p) => p.id)), beam: !!(boss && boss.beam),
  };

  if (prev && !s.over) {
    // chicken hits: knock off vest shards; deaths: bursts, score text, combo
    for (const c of s.chickens) {
      const ph = prev.chickHp.get(c.id);
      if (ph !== undefined && c.hp < ph && !c.boss) {
        burst(c.x, c.y, 6, [VEST_COL[c.tier] || '#ffffff', '#fff'], 150, 3.2, 0.7, 'shard');
        snd.crack();
      }
    }
    for (const [id, c] of prev.chickens) {
      if (cur.chickens.has(id) || burstDone.has(id)) continue;
      burstDone.add(id);
      const isBoss = !!c.boss;
      burst(c.x, c.y, isBoss ? 70 : 14, ['#ffffff', '#f4e4c8', '#ffcc80'], isBoss ? 380 : 200, isBoss ? 8 : 5, 1.1, 'feather');
      burst(c.x, c.y, isBoss ? 50 : 10, (sparkColors() || ['#ffee58', '#ff9800', '#ff5722']), isBoss ? 420 : 240, 3, 0.5, 'spark');
      ring(c.x, c.y, isBoss ? 620 : 170, isBoss ? 0.9 : 0.35, isBoss ? 'rgba(255,220,150,.9)' : 'rgba(255,230,180,.6)', isBoss ? 6 : 2, isBoss);
      if (isBoss) {
        ring(c.x, c.y, 380, 1.2, 'rgba(255,120,60,.8)', 4, true);
        addShake(18); flare = 1; slowMo = 0.9; hitStop = 0.12;
      }
      if (c.chick) continue; // chicks vanishing with the mother: no score/combo
      const pts = isBoss ? 500 : 10 * (c.max || 1);
      combo.n = t - combo.last < 2 ? combo.n + 1 : 1; combo.last = t; combo.best = Math.max(combo.best, combo.n);
      text(c.x, c.y - 10, `+${pts}`, c.tier >= 3 || isBoss ? '#ffd54f' : '#ffffff', isBoss ? 34 : 14 + (c.max || 1) * 1.6);
      if (combo.n >= 3) snd.combo(combo.n);
      if ([5, 10, 20, 40].includes(combo.n)) {
        text(W / 2, 110, `COMBO x${combo.n}!`, COMBO_COL(combo.n), 30, 1.3);
        ring(W / 2, 110, 300, 0.6, COMBO_COL(combo.n), 3);
      }
      snd.kill(isBoss);
    }
    for (const [id, m] of prev.meteors || []) { // a rock was shot down or hit a pilot (rocks that leave the screen just vanish)
      if (cur.meteors.has(id) || m.warn > 0 || m.y > H - 10 || m.x < 0 || m.x > W) continue;
      burst(m.x, m.y, 16, ['#ffcc80', '#ff7043', '#8d6e63', '#fff'], 260, 4, 0.7, 'spark');
      burst(m.x, m.y, 8, ['#6d4c41', '#8d6e63'], 160, 5, 0.9, 'shard');
      ring(m.x, m.y, 260, 0.45, 'rgba(255,160,80,.8)', 3);
      addShake(4);
    }
    for (const [id, g] of prev.gifts) {
      if (!cur.gifts.has(id) && g.y < H - 10) {
        burst(g.x, g.y, 16, GIFT_COL[g.k] || ['#fff'], 200, 3, 0.6);
        text(g.x, g.y - 12, g.k === 'wpn' ? WPN_TXT[g.w] : GIFT_TXT[g.k], '#b3e5fc', 13, 1);
        snd.gift(g.k);
      }
    }
    // eggs: splat on the floor, crack on shields, shatter on hulls
    for (const [id, e] of prev.eggs) {
      if (cur.eggs.has(id)) continue;
      if (e.y > H - 34) {
        parts.push({ type: 'splat', x: e.x, y: H - 5, size: 9 + Math.random() * 6, life: 3.5, max: 3.5, c: '#ffb300', rot: 0 });
        burst(e.x, H - 8, 6, ['#ffe082', '#fff'], 120, 2.5, 0.5, 'drip');
        snd.splat();
      } else {
        let hitP = null;
        for (const p of Object.values(s.players)) if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 < 36 * 36) hitP = p;
        if (hitP) {
          const shielded = hitP.inv > 0.1;
          burst(e.x, e.y, shielded ? 10 : 8, shielded ? ['#80d8ff', '#e1f5fe'] : ['#fff', '#f3e5cf', '#ffb300'], 170, 3, 0.5, shielded ? 'spark' : 'shard');
          if (shielded) ring(hitP.x, hitP.y, 120, 0.3, 'rgba(128,216,255,.8)', 2);
        }
      }
    }
    for (const p of Object.values(s.players)) {
      const o = prev.players[p.id];
      if (!o) continue;
      if (p.alive && p.cd > o.cd + 0.02) {
        snd.shoot(p.weapon, p.id === me);
        burst(p.x, p.y - 24, p.weapon === 'missile' ? 8 : 3, p.weapon === 'missile' ? ['#fff3c4', '#ffab40', '#b0bec5'] : ['#fff7b0', p.color], p.weapon === 'missile' ? 130 : 90, p.weapon === 'missile' ? 4 : 2.5, 0.22);
      }
      if (p.lives < o.lives) {
        lostAt[p.id] = t;
        addShake(p.id === me ? 12 : 6);
        burst(p.x, p.y, 28, [p.color, '#fff', '#ffb300'], 300, 4, 0.8);
        ring(p.x, p.y, 420, 0.55, p.color, 4, true);
        snd.hit(p.id === me);
      }
      if (o.alive && !p.alive) { // plane destroyed: fireball, debris, smoke, shockwave
        burst(p.x, p.y, 60, ['#fff3c4', '#ffab40', '#ff5722', '#b71c1c'], 420, 6, 1.1);
        burst(p.x, p.y, 26, [p.color, '#cfd8dc', '#455a64'], 300, 5, 1.3, 'shard');
        burst(p.x, p.y, 14, ['#37474f', '#607d8b'], 90, 9, 1.4, 'smoke');
        ring(p.x, p.y, 520, 0.8, 'rgba(255,170,60,.9)', 6, true);
        ring(p.x, p.y, 300, 0.6, 'rgba(255,255,255,.8)', 3);
        addShake(p.id === me ? 20 : 10);
        snd.explode(p.id === me);
      }
      if (!o.alive && p.alive) {
        burst(p.x, p.y, 36, ['#80d8ff', '#fff', p.color], 260, 4, 0.9);
        ring(p.x, p.y, 380, 0.8, 'rgba(128,216,255,.9)', 4, true);
        snd.revive();
      }
    }
    // role abilities and the sweeper laser
    for (const pl of s.fxPulse || []) {
      if (prev.pulses.has(pl.id)) continue;
      snd.ability(pl.kind);
      addShake(pl.kind === 'nova' ? 8 : 3);
      const col = pl.kind === 'nova' ? '#ffb347' : pl.kind === 'aegis' ? '#90caf9' : '#69f0ae';
      text(pl.x, pl.y - 34, pl.kind === 'nova' ? 'NOVA!' : pl.kind === 'aegis' ? 'AEGIS' : 'MEND', col, 22, 1);
      burst(pl.x, pl.y, 24, [col, '#fff'], 260, 4, 0.7);
    }
    if (boss && boss.beam && !prev.beam) snd.bossLaser();
    // boss phase change: freeze-frame + lens ring
    if (boss && prev.boss && boss.ph > prev.ph) {
      hitStop = 0.08; addShake(14);
      ring(boss.x, boss.y, 560, 0.8, 'rgba(255,90,60,.9)', 5, true);
      burst(boss.x, boss.y, 30, ['#ff5252', '#ffab40', '#fff'], 320, 5, 0.8);
    }
    if (s.wave > prev.wave) { burstDone.clear(); snd.wave(s.wave % 5 === 0); }
    else if (s.bt > 1.9 && s.banner.startsWith('Flawless')) snd.flawless();
  }
  if (prev && s.wave > prev.wave) { snapshotBase(s); summary = null; }
  if (prev && s.wave < prev.wave) { snapshotBase(s); summary = null; combo = { n: 0, last: -99, best: 0 }; }
  if (!prev) snapshotBase(s);
  if (prev && s.cleared && !prev.cleared && !s.over && s.wave > 0) {
    summary = computeSummary(s);
    summary.at = t;
    for (let i = 0; i < summary.stars; i++) setTimeout(() => snd.star(i), 450 + i * 260);
  }
  if (prev && s.over && !prev.over) snd.gameOver();
  prev = cur;
}

// per-frame ambient effects: engine trails, missile smoke
export function ambient(s: State) {
  for (const p of Object.values(s.players)) {
    if (p.alive && Math.random() < (quality.level >= 2 ? 0.6 : quality.level === 1 ? 0.25 : 0)) {
      parts.push({ x: p.x + (Math.random() - 0.5) * 6, y: p.y + 16, vx: (Math.random() - 0.5) * 20, vy: 90 + Math.random() * 60, life: 0.3, max: 0.3, size: 3, c: p.trail === 'rainbow' ? 'hsl(' + ((performance.now() / 6) % 360) + ',90%,60%)' : ((TRAIL_INFO[p.trail] && TRAIL_INFO[p.trail].hex) || '#ffb347'), type: 'spark', rot: 0 });
    }
  }
  for (const b of s.bullets) {
    if (b.w === 'm' && quality.level > 0) parts.push({ x: b.x, y: b.y + 8, vx: (Math.random() - 0.5) * 20, vy: 30, life: 0.5, max: 0.5, size: 4, c: '#b0bec5', type: 'smoke', rot: 0 });
  }
  // charging chickens leave motion streaks
  for (const c of s.chickens) {
    if (quality.level > 0 && c.dv && Math.random() < 0.5) parts.push({ x: c.x + (Math.random() - 0.5) * 16, y: c.y - 14, vx: 0, vy: -30, life: 0.25, max: 0.25, size: 2.5, c: '#ff8a80', type: 'spark', rot: 0 });
  }
}

export function spark(x, y, color = '#ffd180') { burst(x, y, 5, [color, '#fff'], 120, 2.5, 0.3); }

export function updateParts(dt) {
  for (const p of parts) {
    p.life -= dt;
    if (p.type === 'ring') { p.r += p.vr * dt; p.vr *= 0.94; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.type === 'splat') continue;
    p.vx *= 0.97;
    const g = p.type === 'feather' ? 90 : p.type === 'shard' ? 420 : p.type === 'drip' ? 500 : 0;
    p.vy = p.vy * 0.97 + g * dt; p.rot += dt * 6;
  }
  parts = parts.filter((p) => p.life > 0);
  shake *= 0.9;
  flare *= 0.94;
}

export function drawParts(ctx) {
  for (const p of parts) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = p.type === 'smoke' ? a * 0.4 : a;
    ctx.fillStyle = p.c;
    if (p.type === 'feather') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.beginPath(); ctx.ellipse(0, 0, p.size * 1.6, p.size * 0.6, 0, 0, 7); ctx.fill();
      ctx.restore();
    } else if (p.type === 'shard') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
      ctx.restore();
    } else if (p.type === 'smoke') {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (2 - a), 0, 7); ctx.fill();
    } else if (p.type === 'ring') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = p.c; ctx.lineWidth = p.w * a + 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.type === 'text') {
      const pop = 1 + Math.max(0, a - 0.8) * 2.5;
      ctx.font = `bold ${p.size * pop}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,20,.8)'; ctx.strokeText(p.txt, p.x, p.y);
      ctx.fillStyle = p.c; ctx.fillText(p.txt, p.x, p.y);
    } else if (p.type === 'splat') {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * 0.3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * 0.45, p.size * 0.16, 0, 0, 7); ctx.fill();
    } else if (p.type === 'drip') {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.7, 0, 7); ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a + 0.5, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.globalAlpha = 1;
}
