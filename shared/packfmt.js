// Resource pack format + strict validation. A pack is DATA ONLY: images, sounds, colours and a few
// options. It can never contain code. Everything that comes from a file or from storage goes through
// sanitizePack(), which copies only allow-listed fields and checks every value.
export const IMAGE_SLOTS = [
  { id: 'chicken', label: 'Chicken', hint: 'Regular enemies' },
  { id: 'chick', label: 'Chick', hint: "The mother hen's chicks (falls back to Chicken)" },
  { id: 'boss', label: 'Boss', hint: 'Boss waves (falls back to Chicken)' },
  { id: 'mother', label: 'Mother hen', hint: 'Every 10th wave (falls back to Boss)' },
  { id: 'egg', label: 'Egg', hint: 'Enemy projectiles' },
  { id: 'bullet', label: 'Bullet', hint: 'Your shots (turns to face where it flies)' },
  { id: 'ship', label: 'Spaceship', hint: 'Your plane (replaces hull, wings and skin)' },
  { id: 'gift_power', label: 'Power-up gift', hint: 'Weapon power drop' },
  { id: 'gift_life', label: 'Life', hint: 'Extra life drop' },
  { id: 'gift_food', label: 'Food', hint: 'Bonus points drop' },
  { id: 'gift_wpn', label: 'Weapon capsule', hint: 'New weapon drop' },
  { id: 'gift_key', label: 'Key', hint: 'Shop currency drop' },
  { id: 'background', label: 'Background', hint: 'Replaces the world backdrop' },
];
export const SOUND_SLOTS = [
  { id: 'shoot', label: 'Shoot' },
  { id: 'kill', label: 'Chicken down' },
  { id: 'hit', label: 'You are hit' },
  { id: 'gift', label: 'Pick-up' },
  { id: 'wave', label: 'New wave' },
  { id: 'music', label: 'Music (loops)' },
];
export const LIMITS = { name: 40, author: 40, img: 900_000, snd: 800_000, total: 8_000_000 };

const IMG_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const SND_RE = /^data:audio\/(mpeg|mp3|ogg|wav|x-wav|wave|webm|mp4|aac|x-m4a|m4a);base64,[A-Za-z0-9+/]+={0,2}$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const emptyPack = (name = 'My pack') => ({
  format: 1, name, author: '', images: {}, sounds: {},
  colors: { accent: null, bullet: null, overlay: null, overlayAlpha: 0, vests: [null, null, null, null] },
  options: { pixel: 1, tierGlow: true },
});

export function sanitizePack(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('This is not a resource pack file');
  const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').slice(0, n).trim();
  const out = emptyPack(str(raw.name, LIMITS.name) || 'Untitled pack');
  out.author = str(raw.author, LIMITS.author);
  let total = 0;

  const imgs = raw.images && typeof raw.images === 'object' ? raw.images : {};
  for (const slot of IMAGE_SLOTS) {
    if (!has(imgs, slot.id) || !imgs[slot.id]) continue;
    const v = imgs[slot.id];
    const src = typeof v === 'string' ? v : v.src;
    if (typeof src !== 'string' || !IMG_RE.test(src)) throw new Error(`Image "${slot.label}" must be a PNG, JPEG, WebP or GIF`);
    if (src.length > LIMITS.img) throw new Error(`Image "${slot.label}" is too large`);
    total += src.length;
    out.images[slot.id] = { src, scale: clamp(Number(typeof v === 'object' ? v.scale : 1) || 1, 0.3, 3) };
  }

  const snds = raw.sounds && typeof raw.sounds === 'object' ? raw.sounds : {};
  for (const slot of SOUND_SLOTS) {
    if (!has(snds, slot.id) || !snds[slot.id]) continue;
    const v = snds[slot.id];
    const src = typeof v === 'string' ? v : v.src;
    if (typeof src !== 'string' || !SND_RE.test(src)) throw new Error(`Sound "${slot.label}" must be an MP3, OGG, WAV, WebM or AAC audio file`);
    if (src.length > LIMITS.snd) throw new Error(`Sound "${slot.label}" is too large`);
    total += src.length;
    out.sounds[slot.id] = src;
  }
  if (total > LIMITS.total) throw new Error('The pack is too large overall (limit about 6 MB)');

  const c = raw.colors && typeof raw.colors === 'object' ? raw.colors : {};
  const hex = (v) => (typeof v === 'string' && HEX_RE.test(v) ? v.toLowerCase() : null);
  out.colors.accent = hex(c.accent);
  out.colors.bullet = hex(c.bullet);
  out.colors.overlay = hex(c.overlay);
  out.colors.overlayAlpha = clamp(Number(c.overlayAlpha) || 0, 0, 0.6);
  const vests = Array.isArray(c.vests) ? c.vests : [];
  out.colors.vests = [0, 1, 2, 3].map((i) => hex(vests[i]));

  const o = raw.options && typeof raw.options === 'object' ? raw.options : {};
  out.options.pixel = clamp(Math.round(Number(o.pixel) || 1), 1, 6);
  out.options.tierGlow = o.tierGlow !== false;
  return out;
}
