import { theme } from './theme';
import { settings } from './settings';
import { quality } from './util';
const lite = () => quality.level < 2; // low quality: no clipping (clip paths are slow on old GPUs)

// Ten funny chicken characters. Each regular chicken wears one, picked from its id so it stays the same
// for its whole life. Drawn in the chicken's local coordinates (body centre 0,2; eyes at +-6.5,-6; head top near -22).
export const COSTUMES = ['pirate', 'astronaut', 'ninja', 'cowboy', 'hero', 'wizard', 'zombie', 'party', 'sleepy', 'robot'] as const;

export function costumeOf(c): number {
  if (!settings.costumes || theme.event || c.boss || c.chick || c.mother || c.mini || c.dec || c.sol) return -1;
  return Math.abs(c.id | 0) % COSTUMES.length;
}

const body = (ctx) => { ctx.beginPath(); ctx.ellipse(0, 2, 18, 20, 0, 0, 7); };

/** Behind the wings and body (capes). */
export function costumeBack(ctx, c, t) {
  if (costumeOf(c) !== 4) return;
  const sway = Math.sin(t * 5 + c.id) * 3;
  ctx.fillStyle = '#c62828';
  ctx.beginPath(); ctx.moveTo(-14, 4); ctx.lineTo(14, 4); ctx.quadraticCurveTo(24 + sway, 24, 20 + sway * 1.5, 40); ctx.lineTo(-20 + sway * 1.5, 40); ctx.quadraticCurveTo(-24 + sway, 24, -14, 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8e1b1b'; ctx.beginPath(); ctx.moveTo(14, 4); ctx.quadraticCurveTo(24 + sway, 24, 20 + sway * 1.5, 40); ctx.lineTo(12 + sway, 38); ctx.quadraticCurveTo(16, 20, 10, 4); ctx.closePath(); ctx.fill();
}

/** On top of the face (hats, masks, glasses). Call after the eyes and beak. */
export function costumeFront(ctx, c, t) {
  const k = costumeOf(c);
  if (k < 0) return;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const outline = (w = 1.4) => { ctx.strokeStyle = 'rgba(40,25,10,.75)'; ctx.lineWidth = w; ctx.stroke(); };
  if (k === 0) { // pirate: bandana and eyepatch
    ctx.fillStyle = '#d32f2f';
    ctx.beginPath(); ctx.moveTo(-15, -13); ctx.quadraticCurveTo(0, -27, 15, -13); ctx.lineTo(14, -9); ctx.quadraticCurveTo(0, -17, -14, -9); ctx.closePath(); ctx.fill(); outline();
    ctx.fillStyle = '#fff'; for (const x of [-7, 0, 7]) { ctx.beginPath(); ctx.arc(x, -15 - (x === 0 ? 1.5 : 0), 1, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(14, -11); ctx.lineTo(21, -6 + Math.sin(t * 6 + c.id) * 2); ctx.moveTo(14, -11); ctx.lineTo(20, -14); ctx.stroke();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(6.5, -6); ctx.lineTo(-14, -10); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(6.5, -6, 5.4, 0, 7); ctx.fill();
  } else if (k === 1) { // astronaut: glass bubble
    ctx.fillStyle = 'rgba(160,210,255,.28)'; ctx.beginPath(); ctx.arc(0, -4, 20, 0, 7); ctx.fill();
    ctx.strokeStyle = '#9aa7b6'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -4, 15, 3.6, 4.5); ctx.stroke();
    ctx.fillStyle = '#cfd6df'; ctx.fillRect(-12, 12, 24, 5);
    ctx.fillStyle = '#ef5350'; ctx.beginPath(); ctx.arc(-5, 14.5, 1.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#42a5f5'; ctx.beginPath(); ctx.arc(2, 14.5, 1.5, 0, 7); ctx.fill();
  } else if (k === 2) { // ninja: mask, red headband with a tail
    ctx.save(); if (!lite()) { body(ctx); ctx.clip(); }
    ctx.fillStyle = '#1b1b24'; ctx.fillRect(-17, -22, 34, 9);
    ctx.fillStyle = '#e53935'; ctx.fillRect(-17, -13, 34, 3);
    ctx.restore();
    ctx.strokeStyle = '#e53935'; ctx.lineWidth = 3; const w = Math.sin(t * 7 + c.id) * 3;
    ctx.beginPath(); ctx.moveTo(17, -12); ctx.lineTo(27, -9 + w); ctx.moveTo(17, -12); ctx.lineTo(26, -15 - w); ctx.stroke();
    ctx.strokeStyle = '#1b1b24'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-12, -9); ctx.lineTo(-3, -5.5); ctx.moveTo(12, -9); ctx.lineTo(3, -5.5); ctx.stroke();
  } else if (k === 3) { // cowboy hat with a star
    ctx.fillStyle = '#8b5a2b'; ctx.beginPath(); ctx.ellipse(0, -18, 25, 4.5, 0, 0, 7); ctx.fill(); outline();
    ctx.fillStyle = '#a9712f'; ctx.beginPath(); ctx.moveTo(-11, -18); ctx.quadraticCurveTo(-13, -34, -5, -31); ctx.quadraticCurveTo(0, -27, 5, -31); ctx.quadraticCurveTo(13, -34, 11, -18); ctx.closePath(); ctx.fill(); outline();
    ctx.fillStyle = '#4e2f12'; ctx.fillRect(-11, -22, 22, 3);
    ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(0, -20.5, 2.4, 0, 7); ctx.fill();
  } else if (k === 4) { // superhero mask and chest badge
    ctx.fillStyle = '#2a5bd7';
    ctx.beginPath(); ctx.moveTo(-14, -9); ctx.quadraticCurveTo(0, -14, 14, -9); ctx.lineTo(12, -1); ctx.quadraticCurveTo(0, -5, -12, -1); ctx.closePath(); ctx.fill(); outline(1);
    for (const x of [-6.5, 6.5]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, -6, 3.6, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, -5.8, 1.5, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(5, 18); ctx.lineTo(0, 25); ctx.lineTo(-5, 18); ctx.closePath(); ctx.fill(); outline(1);
  } else if (k === 5) { // wizard: pointy star hat and long beard
    ctx.fillStyle = '#f5f5f5'; ctx.beginPath(); ctx.moveTo(-9, 9); ctx.quadraticCurveTo(0, 38 + Math.sin(t * 3 + c.id) * 1.5, 9, 9); ctx.quadraticCurveTo(0, 5, -9, 9); ctx.closePath(); ctx.fill(); outline(1);
    ctx.fillStyle = '#5e35b1'; ctx.beginPath(); ctx.ellipse(0, -18, 20, 4, 0, 0, 7); ctx.fill(); outline();
    ctx.beginPath(); ctx.moveTo(-12, -18); ctx.lineTo(10, -18); ctx.quadraticCurveTo(4, -30, 13, -46); ctx.quadraticCurveTo(-8, -34, -12, -18); ctx.closePath(); ctx.fill(); outline();
    ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(0, -26, 2, 0, 7); ctx.arc(7, -35, 1.4, 0, 7); ctx.fill();
  } else if (k === 6) { // zombie: green skin, stitches, X eye
    ctx.save(); if (!lite()) { body(ctx); ctx.clip(); } ctx.fillStyle = 'rgba(110,190,95,.55)'; ctx.fillRect(-17, -22, 34, 30); ctx.restore();
    ctx.fillStyle = '#e8f5e9'; ctx.beginPath(); ctx.arc(-6.5, -6, 4.8, 0, 7); ctx.fill();
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-9.5, -9); ctx.lineTo(-3.5, -3); ctx.moveTo(-3.5, -9); ctx.lineTo(-9.5, -3); ctx.stroke();
    ctx.strokeStyle = '#2e4d2a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-1, -17); ctx.lineTo(13, -12);
    for (let i = 0; i < 4; i++) { const x = 1 + i * 3.4, y = -16.2 + i * 1.2; ctx.moveTo(x, y - 2); ctx.lineTo(x + 0.4, y + 2); }
    ctx.stroke();
  } else if (k === 7) { // party: cone hat and orbiting confetti
    ctx.fillStyle = '#ec4899'; ctx.beginPath(); ctx.moveTo(-10, -18); ctx.lineTo(10, -18); ctx.lineTo(1, -42); ctx.closePath(); ctx.fill(); outline();
    ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-6, -26); ctx.lineTo(5, -29); ctx.moveTo(-3, -34); ctx.lineTo(3, -36); ctx.stroke();
    ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(1, -43 + Math.sin(t * 6 + c.id), 3, 0, 7); ctx.fill();
    const cols = ['#42a5f5', '#ef5350', '#66bb6a', '#ffd54f', '#ec4899'];
    for (let i = 0; i < 5; i++) { const a = t * 1.5 + c.id + i * 1.26; ctx.fillStyle = cols[i]; ctx.fillRect(Math.cos(a) * 27 - 1.5, Math.sin(a) * 18 - 3, 3, 3); }
  } else if (k === 8) { // sleepy: nightcap, shut eyes and floating z
    ctx.fillStyle = '#f6ecd9'; for (const x of [-6.5, 6.5]) { ctx.beginPath(); ctx.ellipse(x, -6, 5.2, 5.6, 0, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#3a2a14'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(-6.5, -6.5, 3.3, 0.2, Math.PI - 0.2); ctx.moveTo(10, -6.5); ctx.arc(6.5, -6.5, 3.3, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = '#5b8def'; ctx.beginPath(); ctx.moveTo(-14, -14); ctx.quadraticCurveTo(-6, -32, 14, -26); ctx.quadraticCurveTo(24, -18, 22, -6); ctx.lineTo(14, -12); ctx.quadraticCurveTo(0, -20, -14, -14); ctx.closePath(); ctx.fill(); outline();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(22, -4 + Math.sin(t * 3 + c.id), 3.2, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = 'bold 10px sans-serif';
    const z = (t * 0.8 + c.id * 0.37) % 1; ctx.globalAlpha = 1 - z; ctx.fillText('z', 14 + z * 6, -24 - z * 12); ctx.globalAlpha = 1;
  } else if (k === 9) { // robot: antenna, LED eyes, bolts, grille
    ctx.save(); if (!lite()) { body(ctx); ctx.clip(); } ctx.fillStyle = 'rgba(150,170,190,.5)'; ctx.fillRect(-17, -22, 34, 50); ctx.restore();
    ctx.strokeStyle = '#78879a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, -31); ctx.stroke();
    ctx.fillStyle = Math.floor(t * 3 + c.id) % 2 ? '#ff5252' : '#7a1f1f'; ctx.beginPath(); ctx.arc(0, -33, 3, 0, 7); ctx.fill();
    for (const x of [-6.5, 6.5]) { ctx.fillStyle = '#7ee8ff'; ctx.fillRect(x - 4, -10, 8, 8); ctx.strokeStyle = '#25323f'; ctx.lineWidth = 1.2; ctx.strokeRect(x - 4, -10, 8, 8); ctx.fillStyle = '#25323f'; ctx.fillRect(x - 1.2, -7.2, 2.4, 2.4); }
    ctx.fillStyle = '#78879a'; ctx.beginPath(); ctx.arc(-16, -2, 2.2, 0, 7); ctx.arc(16, -2, 2.2, 0, 7); ctx.fill();
    ctx.strokeStyle = '#4a5666'; ctx.lineWidth = 1.2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-6, 15 + i * 3.5); ctx.lineTo(6, 15 + i * 3.5); ctx.stroke(); }
  }
  ctx.restore();
}
