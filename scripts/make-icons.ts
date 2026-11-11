// @ts-nocheck
// Generates the app icons (public/icons/*.png) with no image tools: draws an original chicken-and-ship emblem
// pixel by pixel (3x3 supersampling for smooth edges) and encodes PNGs with Node's built-in zlib.
// Run: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
fs.mkdirSync(out, { recursive: true });

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const tri = (ax, ay, bx, by, cx, cy) => (x, y) => {
  const d = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = d(x, y, ax, ay, bx, by), d2 = d(x, y, bx, by, cx, cy), d3 = d(x, y, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

// Layers in 512x512 space, drawn back to front.
const layers = [
  [ell(125, 300, 38, 70), '#e8d9b0'], [ell(387, 300, 38, 70), '#e8d9b0'],               // wings
  [ell(256, 292, 152, 142), '#fff7e0'], [ell(228, 262, 90, 70), '#ffffff'],              // body + highlight
  [ell(216, 148, 28, 28), '#e53935'], [ell(256, 132, 32, 34), '#e53935'], [ell(296, 148, 28, 28), '#e53935'], // comb
  [ell(215, 252, 23, 25), '#ffffff'], [ell(297, 252, 23, 25), '#ffffff'],                // eyes
  [ell(219, 256, 11, 12), '#111111'], [ell(293, 256, 11, 12), '#111111'],
  [tri(234, 288, 278, 288, 256, 332), '#ff9800'],                                        // beak
  [tri(256, 392, 296, 462, 256, 442), '#4fc3f7'], [tri(256, 392, 216, 462, 256, 442), '#29a8e0'], // little ship
];

function color(x, y) { // x,y in 512 space
  const dx = x - 256, dy = y - 190, t = Math.min(1, Math.hypot(dx, dy) / 400);
  const a = hex('#3949ab'), b = hex('#0a0f2a');
  let c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (const [inside, col] of layers) if (inside(x, y)) c = hex(col);
  return c;
}

function crc32(buf) { return zlib.crc32 ? zlib.crc32(buf) : (() => { let c, crc = -1; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ -1) >>> 0; })(); }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

function png(size, scaleContent) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const SS = 3;
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        // map the pixel into 512 space; scaleContent < 1 shrinks the emblem toward the centre (maskable safe zone)
        const u = ((px + (sx + 0.5) / SS) / size) * 512, v = ((py + (sy + 0.5) / SS) / size) * 512;
        const x = 256 + (u - 256) / scaleContent, y = 256 + (v - 256) / scaleContent;
        const c = color(x, y);
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = py * (size * 3 + 1) + 1 + px * 3, n = SS * SS;
      raw[o] = Math.round(r / n); raw[o + 1] = Math.round(g / n); raw[o + 2] = Math.round(b / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const files = [
  ['icon-192.png', 192, 1], ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.78], // emblem kept inside the 80% safe zone so any mask shape works
  ['apple-touch-icon.png', 180, 0.92],
];
for (const [name, size, k] of files) { fs.writeFileSync(path.join(out, name), png(size, k)); console.log('wrote', name); }
