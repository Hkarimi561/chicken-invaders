import { useEffect, useMemo, useRef } from 'react';
import qrcode from 'qrcode-generator';
import { W, H, createState, addPlayer, step, WEAPONS } from '../shared/sim';
import { PALETTE, SKINS, TRAIL_INFO, SHOP_GUN_IDS } from '../shared/catalog';
import { draw, drawShipPreview } from './render';
import { resetFx } from './fx';
import { quality, IS_TOUCH } from './util';
import { startQuality } from './perf';

export function QR({ text }: Record<string, any>) {
  const src = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createDataURL(5, 3);
  }, [text]);
  return <img className="qr" src={src} alt="QR code to join this room" />;
}

// Animated preview of a loadout on a small canvas (`still` draws one frame, for catalogue thumbnails).
export function ShipView({ opts, size = 120, still = false }: Record<string, any>) {
  const cv = useRef(null);
  const key = JSON.stringify(opts);
  useEffect(() => {
    const ctx = cv.current.getContext('2d');
    const o = JSON.parse(key);
    if (still) { drawShipPreview(ctx, size, size, { ...o, scale: o.scale || size / 70 }, 1.3); return undefined; }
    let raf;
    const loop = (now) => { drawShipPreview(ctx, size, size, o, now / 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [key, size, still]);
  return <canvas ref={cv} width={size} height={size} className={still ? 'thumb' : 'preview'} />;
}

export const shipOpts = (l) => ({ color: l.color || PALETTE[0], skin: l.skin, trail: l.trail, weapon: l.gun || 'blaster' });
export const Keys = ({ n }: Record<string, any>) => <span className="keychip">🔑 {n}</span>;

// Attract mode: a bot pilot plays a random wave in the background of the menu, showing off shop gear.
export function Attract() {
  const cv = useRef(null);
  useEffect(() => {
    const ctx = cv.current.getContext('2d');
    quality.level = IS_TOUCH ? 0 : Math.min(startQuality(), 1); // the menu backdrop is decoration: keep it cheap
    let s, startWave, raf, acc = 0, last = performance.now(), skip = 0;
    ctx.setTransform(0.5, 0, 0, 0.5, 0, 0); // drawn at a quarter of the pixels: it sits behind blurred panels anyway
    const pick = (a) => a[(Math.random() * a.length) | 0];
    const fresh = () => {
      resetFx();
      s = createState();
      startWave = Math.floor(Math.random() * 28);
      s.wave = startWave; s.cleared = startWave > 0;
      addPlayer(s, 'bot', 'Bot', { color: pick(PALETTE), skin: pick(SKINS), trail: pick(Object.keys(TRAIL_INFO)), gun: pick([null, ...SHOP_GUN_IDS]) });
      const b = s.players.bot;
      b.lives = 99; b.power = 1 + ((Math.random() * 4) | 0);
      if (Math.random() < 0.5) b.weapon = pick(WEAPONS);
    };
    const think = () => {
      const p = s.players.bot, i = p.input;
      let target = null, bd = 1e9;
      for (const c of s.chickens) if (!(c.ent < 1) && c.y < p.y - 40) { const d = Math.abs(c.x - p.x) + (p.y - c.y) * 0.2; if (d < bd) { bd = d; target = c; } }
      let tx = target ? target.x : W / 2, dodge = 0;
      for (const e of s.eggs) if (e.y > p.y - 140 && e.y < p.y + 10 && Math.abs(e.x - p.x) < 36) dodge = e.x > p.x ? -1 : 1;
      if (dodge) tx = p.x + dodge * 80;
      i.left = +(tx < p.x - 8); i.right = +(tx > p.x + 8); i.up = 0; i.down = +(p.y < H - 70); i.fire = 1;
    };
    fresh();
    const frame = (now) => {
      acc += Math.min(0.1, (now - last) / 1000); last = now;
      while (acc >= 1 / 60) { think(); step(s, 1 / 60); acc -= 1 / 60; }
      if ((skip++ & 1) === 0) draw(ctx, s, 'bot', now / 1000, { silent: true }); // ~30 fps is plenty for a backdrop
      if (s.over || s.wave - startWave >= 3) fresh();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); resetFx(); };
  }, []);
  return <canvas ref={cv} width={W / 2} height={H / 2} className="attract" aria-hidden="true" />;
}
