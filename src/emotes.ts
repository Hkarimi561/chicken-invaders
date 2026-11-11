// Team emotes: a quick cluck, heart, laugh, GG or help that floats over a pilot's ship for a couple of seconds.
// Purely cosmetic and not part of the simulation, so they never touch replays or fairness.
export const EMOTES = [
  { id: 'cluck', icon: '🐔', label: 'Cluck!' },
  { id: 'heart', icon: '❤️', label: 'Love' },
  { id: 'laugh', icon: '😂', label: 'Haha' },
  { id: 'gg', icon: '👏', label: 'GG' },
  { id: 'help', icon: '🆘', label: 'Help!' },
];
const LIFE = 2.4;
const live = new Map<string, { icon: string; t0: number }>();

export function showEmote(pid: string, id: string, now = performance.now() / 1000) {
  const e = EMOTES.find((x) => x.id === id);
  if (e && pid) live.set(pid, { icon: e.icon, t0: now });
}
export const clearEmotes = () => live.clear();

/** Draw each active emote above its pilot's ship (called with the canvas in game coordinates). */
export function drawEmotes(ctx, players: Record<string, any>, now = performance.now() / 1000) {
  for (const [pid, em] of live) {
    const age = now - em.t0;
    const p = players[pid];
    if (age > LIFE || !p) { if (age > LIFE) live.delete(pid); continue; }
    const rise = Math.min(1, age / 0.25), fade = Math.min(1, (LIFE - age) / 0.5);
    const x = p.x, y = p.y - 48 - age * 8;
    ctx.save(); ctx.globalAlpha = fade; ctx.translate(x, y); const sc = 0.6 + 0.4 * rise + (age < 0.25 ? 0.25 : 0); ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.strokeStyle = 'rgba(30,40,100,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-20, -20, 40, 36, 12); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, 16); ctx.lineTo(0, 26); ctx.lineTo(6, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillRect(-5, 14, 10, 4);
    ctx.font = '24px system-ui, "Segoe UI Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(em.icon, 0, -1);
    ctx.restore();
  }
}
