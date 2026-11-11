// Visuals for the fun features: boss/rooster speech bubbles, dance-break notes, the chicken-of-the-day star, and the
// revive dance (a victory spin with confetti).
const TAU = Math.PI * 2;

/** Speech bubble above a chicken. (x, y) is the top of its head in canvas coordinates. */
export function speech(ctx, x, y, text, life) {
  if (!text) return;
  const a = Math.min(1, life / 0.4, (2.8 - life) / 0.2 + 0.2);
  ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.font = 'bold 15px system-ui, sans-serif';
  const w = Math.min(330, ctx.measureText(text).width + 24), h = 30;
  const bx = Math.max(w / 2 + 6, Math.min(800 - w / 2 - 6, x)), by = Math.max(h + 10, y);
  ctx.fillStyle = 'rgba(255,255,255,.97)'; ctx.strokeStyle = 'rgba(40,50,130,.85)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(bx - w / 2, by - h - 12, w, h, 12); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 8, by - 12.5); ctx.lineTo(x, by - 1); ctx.lineTo(x + 8, by - 12.5); ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,.97)'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.97)'; ctx.fillRect(x - 7, by - 14, 14, 4);
  ctx.fillStyle = '#1a1f4d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx, by - h / 2 - 12, w - 14);
  ctx.restore();
}

/** Floating music notes around a dancing boss (local scaled coordinates, origin at the boss). */
export function danceNotes(ctx, t, k) {
  ctx.save(); ctx.font = `${Math.round(14 * k)}px system-ui, "Segoe UI Emoji", sans-serif`; ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    const ph = (t * 1.3 + i * 0.2) % 1, side = i % 2 ? 1 : -1;
    ctx.globalAlpha = 1 - ph; ctx.fillText(['♪', '♫', '★', '♪', '♫'][i], side * (22 + (i * 7) % 16) * 1.2, -20 - ph * 36);
  }
  ctx.restore();
}

/** A shining star over a chicken of today's costume. */
export function cotdStar(ctx, x, y, t) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 4 + x) * 2); ctx.rotate(Math.sin(t * 2 + x) * 0.2);
  ctx.fillStyle = '#ffd54f'; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU, rr = i % 2 ? 4 : 9; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}

/** Revive dance: confetti spraying around the rescuer's ship. `left` counts down from 1.4 s. */
export function reviveConfetti(ctx, p, t) {
  const age = 1.4 - p.dn, cols = ['#ff5252', '#ffd54f', '#69f0ae', '#40c4ff', '#ea80fc', '#fff'];
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + i * 0.7, sp = 40 + (i % 5) * 18, r = age * sp, y = Math.sin(age * 3 + i) * 8 + age * age * 40;
    ctx.globalAlpha = Math.max(0, 1 - age / 1.4); ctx.fillStyle = cols[i % cols.length];
    ctx.save(); ctx.translate(p.x + Math.cos(a) * r, p.y - 10 + Math.sin(a) * r * 0.6 + y); ctx.rotate(t * 8 + i); ctx.fillRect(-2.5, -1.2, 5, 2.4); ctx.restore();
  }
  ctx.restore();
}
