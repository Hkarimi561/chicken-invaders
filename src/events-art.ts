import { W, H } from '../shared/sim';
import { theme } from './theme';
import { radial } from './util';

// Original seasonal artwork, all drawn with canvas paths. Everything here reads theme.event.
const TIER_COL = [null, '#ef5350', '#ffa726', '#42a5f5', '#66bb6a'];

const heartPath = (ctx, x, y, s) => {
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.5, y - s * 0.2, x - s * 0.7, y - s * 1.1, x, y - s * 0.5);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.5, y - s * 0.2, x, y + s * 0.9);
};

function bat(ctx, x, y, k, ph) {
  const flap = Math.sin(ph);
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = 'rgba(15,5,30,.9)';
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(s * 3, 0);
    ctx.quadraticCurveTo(s * 14, -10 - flap * 8, s * 26, -2 - flap * 6);
    ctx.quadraticCurveTo(s * 20, 2, s * 16, 5);
    ctx.quadraticCurveTo(s * 11, 1, s * 8, 6);
    ctx.quadraticCurveTo(s * 5, 2, s * 3, 4);
    ctx.closePath(); ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(0, 3, 4, 6, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-3, -1); ctx.lineTo(-2, -6); ctx.lineTo(0, -2); ctx.lineTo(2, -6); ctx.lineTo(3, -1); ctx.fill();
  ctx.fillStyle = '#ffb000'; ctx.fillRect(-2.2, 1, 1.4, 1.4); ctx.fillRect(0.8, 1, 1.4, 1.4);
  ctx.restore();
}

function tree(ctx, x, y, h, t) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-4, -8, 8, 10);
  for (let i = 0; i < 3; i++) {
    const w = h * (0.34 - i * 0.07), yy = -8 - i * h * 0.26;
    ctx.fillStyle = i % 2 ? '#1e6b3a' : '#17582f';
    ctx.beginPath(); ctx.moveTo(-w, yy); ctx.lineTo(0, yy - h * 0.42); ctx.lineTo(w, yy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)'; // snow caps
    ctx.beginPath(); ctx.moveTo(-w * 0.45, yy - h * 0.22); ctx.lineTo(0, yy - h * 0.42); ctx.lineTo(w * 0.45, yy - h * 0.22); ctx.quadraticCurveTo(0, yy - h * 0.16, -w * 0.45, yy - h * 0.22); ctx.fill();
    for (let k = -1; k <= 1; k += 2) { ctx.fillStyle = ['#ff5252', '#ffd54f', '#64b5f6'][(i + (k > 0 ? 1 : 0)) % 3]; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3 + i * 2 + k); ctx.beginPath(); ctx.arc(k * w * 0.55, yy - 3, 2, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  }
  ctx.fillStyle = '#ffd54f'; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 3 : 7; ctx.lineTo(Math.cos(a) * r, -8 - h * 0.78 + Math.sin(a) * r); }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---------- behind the action (after the world, before sprites) ----------
export function eventBack(ctx, t, q) {
  const ev = theme.event;
  if (!ev) return;
  ctx.save();
  if (ev === 'halloween') {
    ctx.fillStyle = 'rgba(70,20,110,.16)'; ctx.fillRect(0, 0, W, H);
    const mx = 135, my = 98;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, mx, my, 10, 130, [[0, 'rgba(255,190,110,.35)'], [1, 'rgba(255,150,60,0)']]);
    ctx.beginPath(); ctx.arc(mx, my, 130, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = radial(ctx, mx - 12, my - 12, 2, 52, [[0, '#fff1cf'], [1, '#e8a95a']]);
    ctx.beginPath(); ctx.arc(mx, my, 46, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(150,90,30,.28)';
    for (const [dx, dy, r] of [[-14, -8, 9], [12, 10, 7], [-4, 18, 5]]) { ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, 7); ctx.fill(); }
    if (q >= 1) {
      for (let i = 0; i < 5; i++) { // bats flit across the sky
        const sp = 40 + i * 14, x = ((t * sp + i * 190) % (W + 160)) - 80, y = 70 + i * 55 + Math.sin(t * 1.3 + i) * 18;
        bat(ctx, x, y, 0.8 + (i % 3) * 0.25, t * 9 + i);
      }
      const fg = ctx.createLinearGradient(0, H - 170, 0, H); // ground fog
      fg.addColorStop(0, 'rgba(190,150,255,0)'); fg.addColorStop(1, 'rgba(190,150,255,.16)');
      ctx.fillStyle = fg; ctx.fillRect(0, H - 170, W, 170);
    }
  } else if (ev === 'christmas') {
    ctx.fillStyle = 'rgba(100,150,255,.10)'; ctx.fillRect(0, 0, W, H);
    tree(ctx, 60, H - 4, 120, t); tree(ctx, W - 60, H - 4, 120, t + 1);
    ctx.strokeStyle = 'rgba(20,30,20,.8)'; ctx.lineWidth = 2; // fairy-light string along the top edge
    ctx.beginPath();
    for (let x = 0; x <= W; x += 10) { const y = 10 + Math.sin(x / 55) * 9 + (x % 160) * 0; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    for (let i = 0, x = 20; x < W; x += 38, i++) {
      const y = 10 + Math.sin(x / 55) * 9 + 5, col = ['#ff5252', '#ffd54f', '#69f0ae', '#64b5f6'][i % 4];
      const on = 0.55 + 0.45 * Math.sin(t * 3 + i * 1.7);
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = col; ctx.globalAlpha = on * 0.35;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.5 + on * 0.5;
      ctx.beginPath(); ctx.ellipse(x, y, 3, 4.5, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
  } else if (ev === 'valentine') {
    ctx.fillStyle = 'rgba(255,90,150,.10)'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < (q >= 2 ? 14 : 7); i++) { // big soft hearts rising in the distance
      const sp = 14 + (i % 4) * 7, y = H + 40 - ((t * sp + i * 97) % (H + 80)), x = ((i * 131) % W) + Math.sin(t * 0.7 + i) * 18;
      ctx.fillStyle = 'rgba(255,120,170,' + (0.1 + (i % 3) * 0.05) + ')';
      heartPath(ctx, x, y, 18 + (i % 4) * 8); ctx.fill();
    }
  } else if (ev === 'nowruz') {
    ctx.fillStyle = 'rgba(120,230,150,.08)'; ctx.fillRect(0, 0, W, H);
    for (let x = -4, i = 0; x < W + 8; x += 11, i++) { // fresh sprouts and tulips along the bottom
      const h = 14 + ((i * 7) % 13), sway = Math.sin(t * 1.5 + i * 0.6) * 3;
      ctx.strokeStyle = i % 3 ? '#4caf50' : '#2e8b3e'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x, H); ctx.quadraticCurveTo(x + sway * 0.5, H - h * 0.6, x + sway, H - h); ctx.stroke();
      if (i % 9 === 4) {
        ctx.fillStyle = ['#ff5a7a', '#ffd54f', '#ff8a65', '#ce93d8'][Math.floor(i / 9) % 4];
        ctx.beginPath(); ctx.ellipse(x + sway, H - h - 4, 4, 6, 0, 0, 7); ctx.fill();
      }
    }
  }
  ctx.restore();
}

// ---------- in front of the action (snow, petals, hearts, wisps) ----------
export function eventFront(ctx, t, q) {
  const ev = theme.event;
  if (!ev || q < 1) return;
  const n = q >= 2 ? 1 : 0.45;
  ctx.save();
  if (ev === 'christmas') {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 70 * n; i++) {
      const sp = 28 + (i % 5) * 14, x = (((i * 97) % W) + Math.sin(t * 0.6 + i) * 22 + (t * 8 * ((i % 3) - 1))) % W, y = (t * sp + i * 53) % H;
      ctx.globalAlpha = 0.45 + (i % 4) * 0.12;
      ctx.beginPath(); ctx.arc((x + W) % W, y, 1.1 + (i % 3) * 0.8, 0, 7); ctx.fill();
    }
  } else if (ev === 'halloween') {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12 * n; i++) { // will-o-wisps drifting up
      const y = H - ((t * (16 + (i % 4) * 7) + i * 71) % (H + 30)), x = ((i * 113) % W) + Math.sin(t * 0.8 + i) * 24;
      ctx.fillStyle = radial(ctx, x, y, 0, 14, [[0, 'rgba(255,170,70,.4)'], [1, 'rgba(255,170,70,0)']]);
      ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.fill();
    }
  } else if (ev === 'valentine') {
    for (let i = 0; i < 9 * n; i++) {
      const y = H + 20 - ((t * (30 + (i % 4) * 10) + i * 83) % (H + 50)), x = ((i * 157) % W) + Math.sin(t + i) * 20;
      ctx.fillStyle = 'rgba(255,' + (90 + (i % 3) * 40) + ',160,.55)';
      heartPath(ctx, x, y, 5 + (i % 3) * 2); ctx.fill();
    }
  } else if (ev === 'nowruz') {
    for (let i = 0; i < 26 * n; i++) { // petals
      const sp = 22 + (i % 5) * 9, x = (((i * 89) % W) + t * 14 + Math.sin(t + i) * 18) % W, y = (t * sp + i * 61) % H;
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 1.2 + i);
      ctx.fillStyle = ['rgba(255,170,200,.75)', 'rgba(255,255,255,.7)', 'rgba(255,225,120,.7)'][i % 3];
      ctx.beginPath(); ctx.ellipse(0, 0, 4, 2, 0, 0, 7); ctx.fill(); ctx.restore();
    }
  }
  ctx.restore();
}

// ---------- chickens (drawn in the chicken's local coordinates, head top at about y = -22) ----------
export function eventHat(ctx, c, t) {
  const ev = theme.event;
  if (!ev || (c.boss && !c.ev)) return;
  const tc = TIER_COL[c.tier || 0];
  ctx.save();
  ctx.translate(0, c.boss ? -34 : -22);
  if (c.boss) ctx.scale(1.35, 1.35);
  if (ev === 'halloween') { // witch hat; the band shows the vest tier
    ctx.rotate(Math.sin(t * 3 + c.id) * 0.04);
    ctx.fillStyle = '#241238'; ctx.beginPath(); ctx.ellipse(0, 1, 15, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a1d63';
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.quadraticCurveTo(7, -12, 12, -25); ctx.quadraticCurveTo(-1, -16, -9, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = tc || '#ff9a2e'; ctx.fillRect(-8.6, -5, 17.2, 3.6);
    ctx.fillStyle = '#ffd54f'; ctx.fillRect(-2, -5.4, 4, 4.4);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.ellipse(-3, -12, 1.6, 6, 0.3, 0, 7); ctx.fill();
  } else if (ev === 'christmas') { // festive hat with a pom-pom that bobs
    ctx.rotate(-0.16 + Math.sin(t * 2.5 + c.id) * 0.03);
    ctx.fillStyle = '#d32f2f';
    ctx.beginPath(); ctx.moveTo(-11, 2); ctx.lineTo(11, 2); ctx.quadraticCurveTo(8, -14, 17, -19); ctx.quadraticCurveTo(0, -22, -11, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.ellipse(-3, -8, 1.6, 6, 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(-12.5, -1, 25, 6, 3); ctx.fill();
    if (tc) { ctx.fillStyle = tc; ctx.fillRect(-4, 0, 8, 4); }
    ctx.beginPath(); ctx.arc(17 + Math.sin(t * 4 + c.id) * 0.8, -19, 3.6, 0, 7); ctx.fill();
  } else if (ev === 'valentine') { // bow + a little floating heart
    ctx.fillStyle = '#ff5c93';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-11, -7); ctx.lineTo(-11, 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(11, -7); ctx.lineTo(11, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = tc || '#ff2d78'; ctx.beginPath(); ctx.arc(0, 0, 3.6, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,120,170,.85)'; heartPath(ctx, 14 + Math.sin(t * 2 + c.id) * 2, -14 - ((t * 10 + c.id * 3) % 12), 3.4); ctx.fill();
  } else if (ev === 'nowruz') { // flower crown
    for (let i = -2; i <= 2; i++) {
      const x = i * 5.5, y = 2 + Math.abs(i) * 1.6;
      ctx.fillStyle = '#3fa34d'; ctx.beginPath(); ctx.ellipse(x + 2.5, y + 2, 3.4, 1.4, 0.5, 0, 7); ctx.fill();
      ctx.fillStyle = ['#ff6f91', '#ffd54f', '#ffffff', '#b388ff', '#ff9a4d'][(i + 2 + (c.id % 5)) % 5];
      for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 2.3, y + Math.sin(a) * 2.3, 1.7, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#ffb300'; ctx.beginPath(); ctx.arc(x, y, 1.3, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

export const eventWingStops = () => (theme.event === 'halloween' ? [[0, '#9a74cc'], [1, '#3b1f5e']] : null);

/** Replaces the egg sprite (caller already translated/rotated). Returns true when it drew something. */
export function eventEgg(ctx, e, t) {
  const ev = theme.event;
  if (!ev) return false;
  const id = e.id || 0;
  if (ev === 'halloween') { // tiny pumpkins
    ctx.fillStyle = radial(ctx, -3, -3, 1, 12, [[0, '#ffc266'], [0.6, '#f57c00'], [1, '#a64a00']]);
    ctx.beginPath(); ctx.ellipse(0, 1, 9, 8, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(120,50,0,.55)'; ctx.lineWidth = 1;
    for (const x of [-4, 0, 4]) { ctx.beginPath(); ctx.ellipse(x * 0.6, 1, Math.abs(x) + 1, 8, 0, 0, 7); ctx.stroke(); }
    ctx.fillStyle = '#3f8f3a'; ctx.fillRect(-1.5, -9, 3, 4);
    return true;
  }
  if (ev === 'christmas') { // baubles
    const col = ['#e53935', '#2e7d32', '#ffb300'][id % 3];
    ctx.fillStyle = radial(ctx, -3, -3, 1, 12, [[0, '#ffffff'], [0.35, col], [1, '#3b0d0d']]);
    ctx.beginPath(); ctx.arc(0, 1, 8.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#cfd8dc'; ctx.fillRect(-2.5, -9, 5, 3.4);
    ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, -10.5, 2, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(0, 1, 5.5, 0.4, 2.2); ctx.stroke();
    return true;
  }
  if (ev === 'valentine') { // heart candies
    ctx.fillStyle = radial(ctx, -3, -3, 1, 12, [[0, '#ffd1e3'], [0.5, '#ff5c93'], [1, '#b0124a']]);
    heartPath(ctx, 0, 1, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(-4, -3, 1.6, 2.6, -0.6, 0, 7); ctx.fill();
    return true;
  }
  if (ev === 'nowruz') { // painted eggs
    const base = ['#ff7aa8', '#6ec6ff', '#ffd54f', '#8be28b'][id % 4];
    ctx.fillStyle = base; ctx.beginPath(); ctx.ellipse(0, 0, 8, 10.5, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, 8, 10.5, 0, 0, 7); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let x = -10, i = 0; x <= 10; x += 4, i++) ctx.lineTo(x, i % 2 ? -1 : 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    for (const [x, y] of [[-3, -6], [3, -6], [0, 7], [-4, 6], [4, 6]]) { ctx.beginPath(); ctx.arc(x, y, 1.2, 0, 7); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-3, -4, 1.8, 3.4, -0.4, 0, 7); ctx.fill();
    return true;
  }
  return false;
}

// ---------- your ship (local ship coordinates, drawn over the hull) ----------
export function eventShip(ctx, p, t) {
  const ev = theme.event;
  if (!ev) return;
  ctx.save();
  if (ev === 'halloween') {
    ctx.fillStyle = '#1b0f2e';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 3, -24); ctx.lineTo(s * 7, -31); ctx.lineTo(s * 8, -21); ctx.closePath(); ctx.fill(); }
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = radial(ctx, 0, 15, 0, 12, [[0, 'rgba(255,150,40,' + (0.55 + 0.25 * Math.sin(t * 6)) + ')'], [1, 'rgba(255,100,0,0)']]);
    ctx.beginPath(); ctx.arc(0, 15, 12, 0, 7); ctx.fill();
  } else if (ev === 'christmas') {
    for (let i = 0; i < 5; i++) { // blinking lights along both wings
      const u = (i + 0.5) / 5, col = ['#ff5252', '#ffd54f', '#69f0ae', '#64b5f6', '#ff80ab'][i], on = 0.45 + 0.55 * Math.abs(Math.sin(t * 4 + i));
      for (const s of [-1, 1]) {
        const x = s * (6 + 18 * u), y = -1 + 18 * u;
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = col; ctx.globalAlpha = on * 0.5; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = on; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#d32f2f'; ctx.beginPath(); ctx.moveTo(-5, -14); ctx.lineTo(5, -14); ctx.quadraticCurveTo(4, -22, 9, -24); ctx.quadraticCurveTo(-3, -24, -5, -14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(-6, -15, 12, 3); ctx.beginPath(); ctx.arc(9, -24, 2, 0, 7); ctx.fill();
  } else if (ev === 'valentine') {
    ctx.fillStyle = 'rgba(255,255,255,.9)'; heartPath(ctx, 0, 7, 5); ctx.fill();
    ctx.fillStyle = '#ff3d7f'; heartPath(ctx, 0, 7, 3.4); ctx.fill();
  } else if (ev === 'nowruz') {
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const x = s * (11 + i * 5), y = 5 + i * 6;
      ctx.fillStyle = ['#ff6f91', '#ffd54f', '#ffffff'][i];
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + t; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 2, y + Math.sin(a) * 2, 1.4, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#ffb300'; ctx.beginPath(); ctx.arc(x, y, 1.1, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

export const sparkColors = () => ({
  halloween: ['#ff9a2e', '#b26cff', '#ffffff'],
  christmas: ['#ff5252', '#6be07b', '#ffffff'],
  valentine: ['#ff7fae', '#ff3d7f', '#ffffff'],
  nowruz: ['#7be495', '#ff7fae', '#ffd54f'],
}[theme.event] || null);
