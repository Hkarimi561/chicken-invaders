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

## Layout

- `shared/` game simulation (runs in the browser and on the server) and the shop catalog
- `server/` Express + WebSocket server, profile API
- `src/` React UI, canvas renderer, effects, procedural audio
- `scripts/smoke.js` headless tests
