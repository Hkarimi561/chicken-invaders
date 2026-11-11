// Resource packs: runtime state read by the renderer, storage (IndexedDB), activation and upload helpers.
// Packs are data only (images, sounds, colours, options) and are always validated with sanitizePack().
import { sanitizePack, emptyPack, LIMITS } from '../shared/packfmt';
import * as sfx from './audio';

/** What the renderer reads each frame. Empty = the default look. */
export const pack: any = { id: 'builtin:default', name: 'Default', images: {}, colors: {}, opts: {} };

export const getImg = (slot) => pack.images[slot] || null;

/** Draws a sprite centred on the current origin, fitted into `size` px (times the slot's scale). */
export function drawSprite(ctx, slot, size) {
  const im = pack.images[slot];
  if (!im) return false;
  const iw = im.el.naturalWidth, ih = im.el.naturalHeight;
  if (!iw || !ih) return false;
  const k = (size * im.scale) / Math.max(iw, ih);
  ctx.drawImage(im.el, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
  return true;
}

/** Which uploaded image (if any) stands in for this chicken. */
export function chickenSlot(c) {
  const im = pack.images;
  if (c.boss) return c.mother ? (im.mother && 'mother') || (im.boss && 'boss') || (im.chicken && 'chicken') || null : (im.boss && 'boss') || (im.chicken && 'chicken') || null;
  if (c.chick) return (im.chick && 'chick') || (im.chicken && 'chicken') || null;
  return im.chicken ? 'chicken' : null;
}

// ---------- built-in example packs ----------
const mk = (id, name, desc, patch) => {
  const p = emptyPack(name);
  Object.assign(p.colors, patch.colors || {});
  Object.assign(p.options, patch.options || {});
  return { ...p, id, builtin: true, author: 'Chicken Blasters', desc };
};
export const BUILTIN = [
  mk('builtin:default', 'Default', 'The original look.', {}),
  mk('builtin:retro', 'Retro pixels', 'Chunky 3x pixel-art rendering.', { options: { pixel: 3 } }),
  mk('builtin:night', 'Night vision', 'Green tint, lime bullets, glowing vests.', {
    colors: { overlay: '#00ff66', overlayAlpha: 0.1, bullet: '#b6ff00', accent: '#7dffb0', vests: ['#9aff6b', '#6bffb4', '#6bd6ff', '#d8ff6b'] },
  }),
  mk('builtin:candy', 'Candy colours', 'Pastel vests and pink bullets.', {
    colors: { bullet: '#ff9ad5', accent: '#ff9ad5', vests: ['#ff7aa8', '#ffd54f', '#7ad7ff', '#b388ff'] },
  }),
];

// ---------- activation ----------
export async function activatePack(p) {
  const clean = p ? { ...sanitizePack(p), id: p.id } : { ...emptyPack('Default'), id: 'builtin:default' };
  const images: Record<string, any> = {};
  await Promise.all(Object.entries(clean.images as Record<string, any>).map(async ([slot, v]) => {
    const el = new Image();
    el.src = v.src;
    try { await el.decode(); images[slot] = { el, scale: v.scale }; } catch { /* a broken image is skipped, the default is used */ }
  }));
  const bufs = {};
  await Promise.all(Object.entries(clean.sounds).map(async ([slot, src]) => {
    try { bufs[slot] = await sfx.decodeDataUrl(src); } catch { /* skip */ }
  }));
  pack.id = clean.id || null;
  pack.name = clean.name;
  pack.images = images;
  pack.colors = clean.colors;
  pack.opts = clean.options;
  sfx.setPackSounds(bufs);
}

// ---------- storage (IndexedDB) ----------
const DB = 'cb-packs';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('packs', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const tx = async (mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<any> => {
  const db: IDBDatabase = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('packs', mode);
    const req = fn(t.objectStore('packs'));
    t.oncomplete = () => { db.close(); resolve((req as IDBRequest | undefined)?.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
};
export const listPacks = async () => {
  try { return ((await tx('readonly', (s) => s.getAll())) || []).filter((p) => p && p.id); } catch { return []; }
};
export const savePack = (p) => tx('readwrite', (s) => s.put(p));
export const deletePack = (id) => tx('readwrite', (s) => s.delete(id));

export const newId = () => 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const getActiveId = () => { try { return localStorage.getItem('cb-pack') || 'builtin:default'; } catch { return 'builtin:default'; } };
export const setActiveId = (id) => { try { localStorage.setItem('cb-pack', id); } catch { /* ignore */ } };

/** Loads and activates whichever pack the player picked last. */
export async function loadActivePack() {
  const id = getActiveId();
  let p = BUILTIN.find((b) => b.id === id);
  if (!p) p = (await listPacks()).find((x) => x.id === id);
  try { await activatePack(p || BUILTIN[0]); } catch { await activatePack(null); }
}

// ---------- uploads / import / export ----------
export async function imageFileToData(file, maxSide = 256) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Choose a PNG, JPEG, WebP or GIF image');
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  let out = cv.toDataURL('image/png');
  if (out.length > LIMITS.img) out = cv.toDataURL('image/webp', 0.85);
  if (out.length > LIMITS.img) throw new Error('That image is too large even after resizing');
  return out;
}

export async function audioFileToData(file) {
  if (!file.type.startsWith('audio/')) throw new Error('Choose an audio file (MP3, OGG, WAV, ...)');
  if (file.size > 520000) throw new Error('Sound files must be under about 500 KB');
  await sfx.decodeBuffer(await file.arrayBuffer()); // proves the browser can actually play it
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function exportPack(p) {
  const clean = sanitizePack(p);
  const url = URL.createObjectURL(new Blob([JSON.stringify(clean)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = clean.name.replace(/[^\w-]+/g, '_') + '.cbpack.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function importPackFile(file) {
  if (file.size > 9_000_000) throw new Error('That file is too large to be a resource pack');
  let raw;
  try { raw = JSON.parse(await file.text()); } catch { throw new Error('That file is not valid JSON'); }
  return { ...sanitizePack(raw), id: newId() }; // throws a readable error on anything unexpected
}
