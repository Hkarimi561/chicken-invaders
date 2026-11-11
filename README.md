# Chicken Blasters

An original co-op space shooter against chickens, built with React and Node. Single player and
multiplayer (web and LAN) in the browser. All art, sound and code are original and generated procedurally.

## Run

```bash
npm install
npm run build
npm start          # http://localhost:3000 (also prints your LAN address)
```

Development with hot reload: `npm run dev` (client on port 5173, game server on 3000).
Tests: start the server, then `npm test`.

## Docker

```bash
docker compose up --build -d     # http://localhost:3000, or http://<machine-ip>:3000 from other devices
```

Or without compose:

```bash
docker build -t chicken-blasters .
docker run -d -p 3000:3000 -v chicken-profiles:/data --name chicken-blasters chicken-blasters
```

The image is a two-stage build (Vite bundles the client, the runtime stage keeps only the server and
production dependencies) and runs as a non-root user with a health check on `/api/info`.
Player profiles (keys, unlocks, profile codes) are stored in `/data`: keep the volume to keep progress.
Environment: `PORT` (default 3000), `DATA_DIR` (default `/data` in the image).

## Play

- Keyboard: WASD / arrows + Space. Mouse: move to steer, hold left button to fire. Touch: on-screen stick + FIRE.
- Co-op: create a room, share the link or QR code. Fly over a downed teammate for 1.5s to revive them.
- Keys drop from chickens. Collect them in a run, claim them in the menu, and spend them in the
  Hangar & Shop on upgrades, guns, skins, paint and trails. Everyone starts with the standard plane.
- Profiles are stored on the server (`data/profiles.json`, not committed). The secret profile code in the
  shop lets you use the same account on another device.

## Seasonal events

The game restyles itself by date: **Halloween** (Oct 15 – Nov 2), **Winter Holidays** (Dec 10 – Jan 3),
**Valentine's** (Feb 7 – 15) and **Nowruz** (Mar 15 – Apr 4). An event changes the chickens' accessories,
the eggs, the background and foreground effects, your ship's decorations and the music flavour, and it
puts a limited-time ship skin on sale in the shop (Events tab). Event skins are yours to keep afterwards.

- Menu → *Seasonal theme*: Automatic (follows the date), Off, or force any event to preview it
  (also `?event=halloween` in the address bar).
- Event skins are only sold while the **server's** calendar says the event is running.
  Set `EVENT_OVERRIDE=halloween` (or `christmas`, `valentine`, `nowruz`) on the server to force one for testing.

## Resource packs

Menu → *Resource packs* opens a pack editor. A pack can replace sprites (chicken, chick, boss, mother hen,
egg, bullet, your ship, the five pick-ups, the background), sounds (shoot, chicken down, hit, pick-up,
new wave, looping music), recolour the vests, bullets and HUD, tint the whole screen, and switch on chunky
pixel-art rendering (2×–6×). Anything you leave empty keeps the default look.

- Packs are stored in your browser (IndexedDB) and only change how **you** see and hear the game.
- *Export* saves a `.cbpack.json` file you can share; *Import* loads one.
- Packs are data only (never code). Imports accept PNG/JPEG/WebP/GIF images and common audio formats as
  base64 data URLs, `#rrggbb` colours and a few options; everything else is dropped, and oversized or
  malformed files are rejected (see `shared/packfmt.js`). Images are resized on upload (256 px, backgrounds
  1024 px) and sounds must be under about 500 KB.

Pack file format (`format: 1`):

```json
{
  "format": 1, "name": "My pack", "author": "me",
  "images": { "chicken": { "src": "data:image/png;base64,...", "scale": 1 }, "egg": "data:image/png;base64,..." },
  "sounds": { "shoot": "data:audio/mpeg;base64,..." },
  "colors": { "accent": "#38bdf8", "bullet": "#f472b6", "overlay": "#00ff66", "overlayAlpha": 0.1,
              "vests": ["#fb7185", "#fbbf24", "#38bdf8", "#4ade80"] },
  "options": { "pixel": 1, "tierGlow": true }
}
```

Image slots: `chicken chick boss mother egg bullet ship gift_power gift_life gift_food gift_wpn gift_key background`.
Sound slots: `shoot kill hit gift wave music`.

## Layout

- `shared/` game simulation (runs in the browser and on the server) and the shop catalog
- `server/` Express + WebSocket server, profile API
- `src/` React UI, canvas renderer, effects, procedural audio
- `scripts/smoke.js` headless tests
