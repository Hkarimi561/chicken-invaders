// Special skins for the newer bosses, their squad soldiers and the cloner's decoys.
// Everything is drawn in the chicken's local coordinates (body centre 0,2; eyes at +-6.5,-6; head top near -22).
const SKINNED = new Set(['colonel', 'bomber', 'timewarp', 'magnet', 'ghost', 'lava', 'diva', 'cloner', 'tank', 'iceq']);

/** True when this chicken gets one of the special skins below. */
export const hasSkin = (c) => !!c.sol || !!c.gold || ((c.boss || c.dec) && SKINNED.has(c.kind));
const kindOf = (c) => (c.sol ? 'sol' : c.gold ? 'gold' : c.kind);

const body = (ctx) => { ctx.beginPath(); ctx.ellipse(0, 2, 18, 20, 0, 0, 7); };
const TAU = Math.PI * 2;
const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

function tint(ctx, color, alpha) {
  ctx.save(); body(ctx); ctx.clip(); ctx.globalAlpha *= alpha; ctx.fillStyle = color; ctx.fillRect(-22, -24, 44, 52); ctx.restore();
}
function outline(ctx, w = 1.2) { ctx.strokeStyle = 'rgba(30,20,10,.7)'; ctx.lineWidth = w; ctx.stroke(); }
function gear(ctx, x, y, r, teeth, rot, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = col;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) { const a = (i / (teeth * 2)) * TAU, rr = i % 2 ? r * 0.8 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); outline(ctx, 1);
  ctx.fillStyle = 'rgba(25,25,50,.85)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, TAU); ctx.fill();
  ctx.restore();
}
function star(ctx, x, y, r, col) {
  ctx.fillStyle = col; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}

// ghost fade is eased per boss id so it floats in and out instead of popping
const fade = new Map<number, number>();
export function skinAlpha(c): number {
  if (c.kind !== 'ghost' || !c.boss) return 1;
  const goal = c.hid ? 0.1 : 0.8;
  const v = (fade.get(c.id) ?? goal) + (goal - (fade.get(c.id) ?? goal)) * 0.12;
  fade.set(c.id, v);
  return v;
}

/** After the body is painted: recolour and add belly art. `t` is seconds. */
export function bossBody(ctx, c, t) {
  const k = kindOf(c);
  if (k === 'sol') { tint(ctx, '#5a6b2c', 0.55); return; }
  if (k === 'gold') { tint(ctx, '#ffd54f', 0.78); return; }
  if (k === 'colonel') {
    tint(ctx, '#5a6b2c', 0.6);
    ctx.save(); body(ctx); ctx.clip(); ctx.fillStyle = 'rgba(30,45,15,.55)';
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(-14 + hash(i) * 28, -8 + hash(i + 9) * 30, 4 + hash(i + 3) * 4, 3 + hash(i + 5) * 3, hash(i) * 3, 0, TAU); ctx.fill(); }
    ctx.restore();
  } else if (k === 'bomber') {
    tint(ctx, '#e08a1e', 0.5);
  } else if (k === 'timewarp') {
    tint(ctx, '#5c6bc0', 0.55);
    ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(0, 12, 9, 0, TAU); ctx.fill(); outline(ctx, 1.4);
    ctx.strokeStyle = '#3a3a5a'; ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 7, 12 + Math.sin(a) * 7); ctx.lineTo(Math.cos(a) * 8.2, 12 + Math.sin(a) * 8.2); ctx.stroke(); }
    ctx.lineCap = 'round'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(Math.cos(t * 0.4) * 4.5, 12 + Math.sin(t * 0.4) * 4.5); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = '#c62828'; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(Math.cos(t * 3) * 7, 12 + Math.sin(t * 3) * 7); ctx.stroke();
  } else if (k === 'magnet') {
    ctx.save(); body(ctx); ctx.clip();
    ctx.fillStyle = 'rgba(210,40,40,.62)'; ctx.fillRect(-22, -24, 22, 52);
    ctx.fillStyle = 'rgba(40,90,220,.62)'; ctx.fillRect(0, -24, 22, 52);
    ctx.restore();
  } else if (k === 'ghost') {
    tint(ctx, '#bfe3ff', 0.65);
  } else if (k === 'lava') {
    tint(ctx, '#2a1512', 0.88);
    ctx.save(); body(ctx); ctx.clip();
    const glow = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.strokeStyle = `rgba(255,${120 + glow * 80 | 0},20,${0.6 + glow * 0.4})`; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, -4); ctx.lineTo(-6, 2); ctx.lineTo(-10, 10); ctx.lineTo(-2, 16);
    ctx.moveTo(10, -10); ctx.lineTo(4, -2); ctx.lineTo(12, 6); ctx.lineTo(6, 14); ctx.moveTo(-4, 2); ctx.lineTo(4, 6); ctx.stroke();
    ctx.restore();
  } else if (k === 'diva') {
    tint(ctx, '#d81b9b', 0.55);
    ctx.save(); body(ctx); ctx.clip();
    for (let i = 0; i < 16; i++) { ctx.fillStyle = ['#fff', '#ffd54f', '#80deea', '#f48fb1'][i % 4]; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5 + i * 2.1); ctx.fillRect(-16 + hash(i) * 32, -8 + hash(i + 4) * 32, 1.8, 1.8); }
    ctx.restore();
  } else if (k === 'cloner') {
    tint(ctx, '#00acc1', 0.5);
    ctx.save(); body(ctx); ctx.clip(); ctx.lineWidth = 1.4;
    for (const ph of [0, Math.PI]) { ctx.strokeStyle = ph ? '#ffee58' : '#ff7043'; ctx.beginPath(); for (let y = 2; y <= 26; y += 1.5) { const x = Math.sin(y * 0.55 + ph + t * 2) * 6; y === 2 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.restore();
  } else if (k === 'tank') {
    tint(ctx, '#78838f', 0.78);
    ctx.save(); body(ctx); ctx.clip();
    if (!c.open) for (let i = 0; i < (c.arm || 0); i++) { // front plates: one breaks for every eight absorbed hits
      const y = 2 + i * 8;
      ctx.fillStyle = '#aab4bf'; ctx.fillRect(-15, y, 30, 7); ctx.strokeStyle = 'rgba(20,25,30,.8)'; ctx.lineWidth = 1.2; ctx.strokeRect(-15, y, 30, 7);
      ctx.fillStyle = '#5c6570'; for (const x of [-12, 12]) { ctx.beginPath(); ctx.arc(x, y + 3.5, 1, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  } else if (k === 'iceq') {
    tint(ctx, '#9fdcff', 0.62);
    ctx.save(); body(ctx); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) { const x = -12 + hash(i) * 24, y = -4 + hash(i + 7) * 26; ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke(); }
    ctx.restore();
  }
}

/** Behind the wings and body. */
export function bossBack(ctx, c, t) {
  const k = kindOf(c);
  if (k === 'gold') { // sparkle trail behind the runner
    for (let i = 0; i < 8; i++) { const ph = (t * 3 + i / 8) % 1; ctx.globalAlpha = (1 - ph) * 0.9; ctx.fillStyle = i % 2 ? '#fff59d' : '#ffca28'; ctx.beginPath(); ctx.arc(-(c.dir || 1) * (10 + ph * 60), Math.sin(i * 2.3) * 14, 3.2 * (1 - ph) + 1, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  if (k === 'timewarp') { gear(ctx, -27, -4, 10, 9, t * 0.9, '#9fa8da'); gear(ctx, 27, 12, 8, 8, -t * 1.2, '#7986cb'); gear(ctx, 24, -14, 6, 7, t * 1.5, '#c5cae9'); }
  else if (k === 'bomber') { // twin egg-bomb tanks strapped on the back
    for (const s of [-1, 1]) { ctx.fillStyle = '#6d4c41'; ctx.beginPath(); ctx.roundRect(s * 20 - 5, -6, 10, 26, 4); ctx.fill(); outline(ctx);
      ctx.fillStyle = `rgba(255,${150 + Math.sin(t * 20) * 60 | 0},40,.9)`; ctx.beginPath(); ctx.moveTo(s * 20 - 3, 20); ctx.lineTo(s * 20 + 3, 20); ctx.lineTo(s * 20, 30 + Math.sin(t * 25 + s) * 4); ctx.fill(); }
  } else if (k === 'ghost') { // ragged tail instead of legs
    ctx.fillStyle = 'rgba(200,235,255,.55)'; ctx.beginPath(); ctx.moveTo(-16, 14);
    for (let i = 0; i <= 6; i++) ctx.lineTo(-16 + i * 5.3, 30 + (i % 2 ? 8 : 0) + Math.sin(t * 4 + i) * 3);
    ctx.lineTo(16, 14); ctx.closePath(); ctx.fill();
  } else if (k === 'lava') { // heat aura
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + t * 1.4; ctx.fillStyle = `rgba(255,${90 + 40 * Math.sin(t * 6 + i) | 0},10,.35)`; ctx.beginPath(); ctx.arc(Math.cos(a) * 24, 6 + Math.sin(a) * 22, 7 + 2 * Math.sin(t * 8 + i), 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
  } else if (k === 'diva') { // disco-ball glitter halo
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + t * 0.8, r = 30 + 4 * Math.sin(t * 3 + i); ctx.fillStyle = ['#ffd54f', '#80deea', '#f48fb1', '#fff'][i % 4]; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6 + i * 1.7); ctx.fillRect(Math.cos(a) * r - 1.5, -4 + Math.sin(a) * r - 1.5, 3, 3); }
    ctx.globalAlpha = 1;
  } else if (k === 'tank') { // caterpillar treads on both sides
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#2b2f33'; ctx.beginPath(); ctx.roundRect(s * 21 - 4, -6, 8, 34, 4); ctx.fill(); outline(ctx);
      ctx.strokeStyle = '#8a949e'; ctx.lineWidth = 1.2; for (let i = 0; i < 6; i++) { const y = -4 + ((i * 6 + t * 24) % 34); ctx.beginPath(); ctx.moveTo(s * 21 - 4, y); ctx.lineTo(s * 21 + 4, y); ctx.stroke(); }
    }
  } else if (k === 'iceq') { // icy cape
    ctx.fillStyle = 'rgba(160,220,255,.8)'; ctx.beginPath(); ctx.moveTo(-14, 2); ctx.lineTo(14, 2); ctx.lineTo(30, 38); ctx.lineTo(18, 32); ctx.lineTo(8, 42); ctx.lineTo(0, 34); ctx.lineTo(-8, 42); ctx.lineTo(-18, 32); ctx.lineTo(-30, 38); ctx.closePath(); ctx.fill(); outline(ctx, 1);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, 34); ctx.moveTo(-8, 8); ctx.lineTo(-14, 32); ctx.moveTo(8, 8); ctx.lineTo(14, 32); ctx.stroke();
  }
}

/** Over the face: hats, goggles, masks, jewellery. Call after the eyes and beak. */
export function bossFront(ctx, c, t) {
  const k = kindOf(c);
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (k === 'gold') { // royal crown, shiny shades and a bling medallion
    ctx.fillStyle = '#ff8f00'; ctx.beginPath(); ctx.moveTo(-13, -17); ctx.lineTo(-13, -30); ctx.lineTo(-6, -23); ctx.lineTo(0, -34); ctx.lineTo(6, -23); ctx.lineTo(13, -30); ctx.lineTo(13, -17); ctx.closePath(); ctx.fill(); outline(ctx);
    ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.arc(0, -22, 2.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(-12, -10, 10, 6); ctx.fillRect(2, -10, 10, 6); ctx.fillRect(-2, -8.5, 4, 1.6);
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(-10, -9.5, 3, 1.4); ctx.fillRect(4, -9.5, 3, 1.4);
    ctx.fillStyle = '#fff59d'; ctx.beginPath(); ctx.arc(0, 18, 3.5, 0, TAU); ctx.fill(); outline(ctx, 1);
  } else if (k === 'sol') { // helmet, chin strap, star; the leader also has a plume and a bigger star
    ctx.fillStyle = '#4a5a22'; ctx.beginPath(); ctx.moveTo(-17, -9); ctx.quadraticCurveTo(-16, -30, 0, -30); ctx.quadraticCurveTo(16, -30, 17, -9); ctx.closePath(); ctx.fill(); outline(ctx);
    ctx.fillStyle = '#3a4619'; ctx.fillRect(-19, -10, 38, 3.5);
    star(ctx, 0, -20, c.ld ? 5 : 3.5, c.ld ? '#ffd54f' : '#e0e0e0');
    if (c.ld) { ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.moveTo(-2, -29); ctx.quadraticCurveTo(0, -44 + Math.sin(t * 5) * 2, 8, -40); ctx.quadraticCurveTo(3, -34, 3, -29); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = '#2a3412'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-15, -8); ctx.lineTo(-11, 12); ctx.moveTo(15, -8); ctx.lineTo(11, 12); ctx.stroke();
  } else if (k === 'colonel') { // peaked cap, epaulettes, medals, moustache
    ctx.fillStyle = '#3f4a1d'; ctx.beginPath(); ctx.moveTo(-18, -14); ctx.quadraticCurveTo(-18, -34, 0, -34); ctx.quadraticCurveTo(18, -34, 18, -14); ctx.closePath(); ctx.fill(); outline(ctx);
    ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.ellipse(0, -14, 22, 4.5, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#ffd54f'; ctx.fillRect(-18, -19, 36, 3); star(ctx, 0, -26, 4.5, '#ffd54f');
    for (const s of [-1, 1]) { ctx.fillStyle = '#ffd54f'; ctx.fillRect(s * 17 - 5, 0, 10, 4); ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 1; for (let i = -4; i <= 4; i += 2) { ctx.beginPath(); ctx.moveTo(s * 17 + i, 4); ctx.lineTo(s * 17 + i, 8); ctx.stroke(); } }
    ['#e53935', '#42a5f5', '#ffd54f'].forEach((col, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-9 + i * 4.5, 15, 2, 0, TAU); ctx.fill(); });
    ctx.fillStyle = '#3a2a14'; ctx.beginPath(); ctx.moveTo(-10, 8); ctx.quadraticCurveTo(-4, 4, 0, 8); ctx.quadraticCurveTo(4, 4, 10, 8); ctx.quadraticCurveTo(4, 12, 0, 9.5); ctx.quadraticCurveTo(-4, 12, -10, 8); ctx.fill();
  } else if (k === 'bomber') { // aviator cap + goggles, bandolier of mini bombs, scarf
    ctx.fillStyle = '#6d4c41'; ctx.beginPath(); ctx.moveTo(-18, -4); ctx.quadraticCurveTo(-19, -30, 0, -30); ctx.quadraticCurveTo(19, -30, 18, -4); ctx.lineTo(14, -10); ctx.lineTo(-14, -10); ctx.closePath(); ctx.fill(); outline(ctx);
    ctx.beginPath(); ctx.ellipse(-19, 0, 4, 9, 0.1, 0, TAU); ctx.ellipse(19, 0, 4, 9, -0.1, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2b1d14'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-18, -14); ctx.lineTo(18, -14); ctx.stroke();
    for (const x of [-7, 7]) { ctx.fillStyle = '#90caf9'; ctx.beginPath(); ctx.arc(x, -17, 4.5, 0, TAU); ctx.fill(); ctx.strokeStyle = '#2b1d14'; ctx.lineWidth = 1.8; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, -19.5, 1.6, 1.6); }
    ctx.strokeStyle = '#4e342e'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(-15, 4); ctx.lineTo(14, 26); ctx.stroke();
    for (let i = 0; i < 4; i++) { const u = 0.15 + i * 0.23; ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.ellipse(-15 + 29 * u, 4 + 22 * u, 2.4, 3.2, 0.6, 0, TAU); ctx.fill(); outline(ctx, 0.8); }
    ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(10, 12); ctx.lineTo(12 + Math.sin(t * 8) * 2, 22); ctx.lineTo(4, 17); ctx.lineTo(-4, 24 + Math.sin(t * 9) * 2); ctx.lineTo(-10, 16); ctx.closePath(); ctx.fill();
  } else if (k === 'timewarp') { // purple top hat with a ticking clock
    ctx.fillStyle = '#4527a0'; ctx.beginPath(); ctx.ellipse(0, -16, 22, 4.5, 0, 0, TAU); ctx.fill(); outline(ctx);
    ctx.fillRect(-13, -36, 26, 20); outline(ctx);
    ctx.fillStyle = '#ffd54f'; ctx.fillRect(-13, -21, 26, 4);
    ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(0, -28, 6, 0, TAU); ctx.fill(); outline(ctx, 1);
    ctx.strokeStyle = '#3a3a5a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(Math.cos(-t * 2) * 4.5, -28 + Math.sin(-t * 2) * 4.5); ctx.moveTo(0, -28); ctx.lineTo(Math.cos(t * 0.3) * 3, -28 + Math.sin(t * 0.3) * 3); ctx.stroke();
    ctx.fillStyle = 'rgba(160,190,255,.9)'; for (const x of [-6.5, 6.5]) { ctx.beginPath(); ctx.arc(x, -6, 1.6, 0, TAU); ctx.fill(); }
  } else if (k === 'magnet') { // horseshoe magnet with crackling sparks
    ctx.lineWidth = 7; ctx.strokeStyle = '#d32f2f'; ctx.beginPath(); ctx.arc(0, -28, 11, Math.PI, Math.PI * 1.5); ctx.stroke();
    ctx.strokeStyle = '#1e5bd6'; ctx.beginPath(); ctx.arc(0, -28, 11, Math.PI * 1.5, 0); ctx.stroke();
    ctx.lineWidth = 7; ctx.strokeStyle = '#d32f2f'; ctx.beginPath(); ctx.moveTo(-11, -28); ctx.lineTo(-11, -19); ctx.stroke();
    ctx.strokeStyle = '#1e5bd6'; ctx.beginPath(); ctx.moveTo(11, -28); ctx.lineTo(11, -19); ctx.stroke();
    ctx.fillStyle = '#eceff1'; ctx.fillRect(-14.5, -21, 7, 3.5); ctx.fillRect(7.5, -21, 7, 3.5);
    if (Math.floor(t * 12) % 2 || c.pl) { ctx.strokeStyle = '#fff59d'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-11, -17); ctx.lineTo(-6, -13); ctx.lineTo(-2, -17); ctx.lineTo(2, -13); ctx.lineTo(6, -17); ctx.lineTo(11, -17); ctx.stroke(); }
  } else if (k === 'ghost') { // hollow glowing eyes and a wailing mouth
    for (const x of [-6.5, 6.5]) { ctx.fillStyle = '#07121c'; ctx.beginPath(); ctx.ellipse(x, -6, 5.2, 6.4, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#7df9ff'; ctx.beginPath(); ctx.arc(x, -5 + Math.sin(t * 3) * 0.8, 1.8, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#07121c'; ctx.beginPath(); ctx.ellipse(0, 13, 3.4, 4.5 + Math.sin(t * 4) * 1.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(190,240,255,.6)'; ctx.beginPath(); ctx.moveTo(-8, -20); ctx.quadraticCurveTo(-10, -34, -2, -38 + Math.sin(t * 4) * 2); ctx.quadraticCurveTo(0, -28, 3, -34); ctx.quadraticCurveTo(10, -30, 8, -20); ctx.closePath(); ctx.fill();
  } else if (k === 'lava') { // flame crest and burning eyes
    for (const [x, h, ph] of [[-8, 16, 0], [0, 24, 1.3], [8, 15, 2.1]]) {
      const hh = h + Math.sin(t * 9 + ph) * 4;
      ctx.fillStyle = '#ff5a14'; ctx.beginPath(); ctx.moveTo(x - 6, -17); ctx.quadraticCurveTo(x - 6, -17 - hh * 0.6, x, -17 - hh); ctx.quadraticCurveTo(x + 6, -17 - hh * 0.6, x + 6, -17); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.moveTo(x - 3, -17); ctx.quadraticCurveTo(x - 3, -17 - hh * 0.4, x, -17 - hh * 0.65); ctx.quadraticCurveTo(x + 3, -17 - hh * 0.4, x + 3, -17); ctx.closePath(); ctx.fill();
    }
    for (const x of [-6.5, 6.5]) { ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.ellipse(x, -6, 4.6, 5.2, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#7a1200'; ctx.fillRect(x - 0.9, -10, 1.8, 8); }
  } else if (k === 'diva') { // big afro, star shades, feather boa
    const cols = ['#8e24aa', '#ab47bc', '#7b1fa2'];
    for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI, r = 20; ctx.fillStyle = cols[i % 3]; ctx.beginPath(); ctx.arc(Math.cos(a) * r, -8 + Math.sin(a) * r * 1.05, 8, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#ab47bc'; ctx.beginPath(); ctx.ellipse(0, -18, 15, 7, 0, 0, TAU); ctx.fill();
    for (const x of [-6.5, 6.5]) { star(ctx, x, -6, 7.5, '#ffd54f'); ctx.strokeStyle = '#7a5b00'; ctx.lineWidth = 0.9; ctx.stroke(); star(ctx, x, -6, 3, `hsl(${(t * 220 + x * 30) % 360},90%,60%)`); }
    ctx.fillStyle = '#f48fb1'; for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.arc(i * 4, 14 + Math.abs(i) * 0.9 + Math.sin(t * 5 + i) * 0.8, 4.2, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#f8bbd0'; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(i * 4.4 + 1, 12.6 + Math.abs(i) * 0.9, 2.2, 0, TAU); ctx.fill(); }
  } else if (k === 'cloner') { // mad-scientist frizz, goggles, lab coat collar
    ctx.fillStyle = '#f5f5f5';
    for (let i = -5; i <= 5; i++) { const x = i * 3.4, h = 9 + hash(i + 20) * 8; ctx.beginPath(); ctx.moveTo(x - 2.5, -18); ctx.lineTo(x + (i % 2 ? 2 : -2) + Math.sin(t * 3 + i) * 1, -18 - h); ctx.lineTo(x + 2.5, -18); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = '#37474f'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-18, -9); ctx.lineTo(18, -9); ctx.stroke();
    for (const x of [-6.5, 6.5]) { ctx.fillStyle = 'rgba(120,255,160,.45)'; ctx.beginPath(); ctx.arc(x, -6, 6.3, 0, TAU); ctx.fill(); ctx.strokeStyle = '#37474f'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(-2, 14); ctx.lineTo(-10, 26); ctx.closePath(); ctx.moveTo(14, 10); ctx.lineTo(2, 14); ctx.lineTo(10, 26); ctx.closePath(); ctx.fill(); outline(ctx, 1);
    const blinkEvery = c.dec ? 1.7 : 3.4; // tell: the real one blinks half as often
    if ((t + c.id * 0.37) % blinkEvery < 0.1) { ctx.fillStyle = '#e6d5b8'; for (const x of [-6.5, 6.5]) { ctx.beginPath(); ctx.ellipse(x, -6, 6, 6.5, 0, 0, TAU); ctx.fill(); } }
  } else if (k === 'tank') { // steel helmet with a visor, shoulder plates
    ctx.fillStyle = '#6f7a86'; ctx.beginPath(); ctx.moveTo(-19, -9); ctx.quadraticCurveTo(-19, -34, 0, -34); ctx.quadraticCurveTo(19, -34, 19, -9); ctx.closePath(); ctx.fill(); outline(ctx);
    ctx.fillStyle = '#4f5964'; ctx.fillRect(-20, -12, 40, 4);
    ctx.fillStyle = '#cfd8dc'; for (const x of [-12, -4, 4, 12]) { ctx.beginPath(); ctx.arc(x, -10, 1, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#8f9aa6'; ctx.fillRect(-3, -34, 6, 10);
    for (const s of [-1, 1]) { ctx.fillStyle = '#8f9aa6'; ctx.beginPath(); ctx.ellipse(s * 17, 1, 7, 5, s * 0.5, 0, TAU); ctx.fill(); outline(ctx); }
    if (c.warn && Math.floor(t * 10) % 2) { ctx.fillStyle = 'rgba(255,60,60,.85)'; ctx.fillRect(-14, -26, 28, 5); }
    if (c.open) { ctx.strokeStyle = '#ff7043'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 6, 22, 0.3, Math.PI - 0.3); ctx.stroke(); }
  } else if (k === 'iceq') { // crystal crown, snowflake brooch
    ctx.fillStyle = '#d6f3ff';
    for (const [x, h] of [[-12, 9], [-6, 15], [0, 20], [6, 15], [12, 9]]) { ctx.beginPath(); ctx.moveTo(x - 3.6, -17); ctx.lineTo(x, -17 - h); ctx.lineTo(x + 3.6, -17); ctx.closePath(); ctx.fill(); outline(ctx, 1); }
    ctx.fillStyle = '#4fc3f7'; ctx.fillRect(-14, -19, 28, 4);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(-1.2, -34, 2.4, 2.4);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI + t * 0.5; ctx.moveTo(Math.cos(a) * 5, 14 + Math.sin(a) * 5); ctx.lineTo(-Math.cos(a) * 5, 14 - Math.sin(a) * 5); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,160,.35)'; for (const x of [-12, 12]) { ctx.beginPath(); ctx.arc(x, 0, 3.2, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}
