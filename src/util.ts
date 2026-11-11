export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => clamp(Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt)), 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function radial(ctx, x, y, r0, r1, stops, cx = x, cy = y) {
  const g = ctx.createRadialGradient(x, y, r0, cx, cy, r1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

export function shadowEllipse(ctx, x, y, rx, ry, a = 0.35) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill();
}

/** Render quality: 2 = full effects, 1 = no foreground/lens/glow + cached backdrop + flat chickens, 0 = minimal. Adapts at runtime. */
export const quality = { level: 2 };
export const IS_TOUCH = typeof window !== 'undefined' && ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);

/** Fullscreen helpers. requestFullscreen must be called from a user gesture (a tap or click). */
export function enterFullscreen() {
  try {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    const p = el.requestFullscreen({ navigationUI: 'hide' });
    if (p && p.then) p.then(() => { try { (window.screen.orientation as any)?.lock?.('landscape').catch(() => {}); } catch { /* not supported */ } }).catch(() => {});
  } catch { /* not allowed here */ }
}
export function exitFullscreen() {
  try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch { /* ignore */ }
}
export function toggleFullscreen() { if (document.fullscreenElement) exitFullscreen(); else enterFullscreen(); }
