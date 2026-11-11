# Chicken Blasters

An original co-op space shooter against chickens. **Next.js + React + TypeScript** website, **Postgres**
(Supabase) database, username + password accounts, and a small Node game server for online rooms.
All art, sound and code are original and generated procedurally.

```
Browser ── Next.js app (Vercel) ── Postgres (Supabase)
   │            accounts, profiles, shop, runs, leaderboards, gallery   (app/, lib/)
   └─ WebSocket ─ Game server (Node, any host with long-running processes)  (game-server/)
                  rooms and the authoritative 60 Hz simulation; same database
```

Solo play, the daily challenge, boss rush, the shop, achievements, leaderboards and the pack gallery all work with
just the website and the database. **Online rooms need the game server**, because WebSockets cannot run on Vercel's
serverless functions; without it the Rooms screen simply says rooms are unavailable.

## Accounts

Create an account with just a **username** (3-16 letters, numbers, underscores; unique ignoring case) and a
**password** (6+ characters). No e-mail or other questions. Passwords are hashed with bcrypt; the session is a signed,
httpOnly cookie (30 days). Keys, unlocks, records and achievements live in your profile row, so they follow you to any
device you sign in on. Login attempts are rate limited.

## Run locally

```bash
npm install
cp .env.example .env.local      # optional: leave DATABASE_URL empty to use a JSON file (data/dev-db.json)
npm run dev                     # website http://localhost:3000 + game server on :3001
```

Without `DATABASE_URL` the data goes to `data/dev-db.json` (development only; refused in production).
Other scripts: `npm run build`, `npm start`, `npm run typecheck`, `npm test` (pure simulation tests, then the website and
game server end to end on throw-away ports), `npm run db:migrate`, `npm run icons`.

## Deploy: Supabase + Vercel

1. **Database (Supabase).** Create a project. In *Project Settings -> Database -> Connection string* copy the
   **Transaction pooler** string (port 6543) and put your password in it. Create the tables by pasting
   `db/schema.sql` into the SQL editor, or run `DATABASE_URL=... npm run db:migrate`. (Row level security is turned on with no
   policies, so the tables are not reachable through Supabase's public REST API; the app uses the direct connection.)
2. **Website (Vercel).** Import the repository. Framework: Next.js (auto-detected). Environment variables:
   - `DATABASE_URL`: the Supabase pooler string
   - `SESSION_SECRET`: 24+ random characters (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `GAME_SERVER_URL`: public address of the game server (step 3); leave it out to run without online rooms
3. **Game server (optional).** Run `game-server/` anywhere that keeps a process alive (Fly.io, Railway, Render, a VPS, ...):
   ```bash
   docker build -t chicken-game . && docker run -d -p 3001:3001 \
     -e DATABASE_URL=... -e SESSION_SECRET=... -e ALLOWED_ORIGIN=https://your-game.vercel.app chicken-game
   ```
   (`docker compose up --build` does the same with the values from your environment.) It needs the **same**
   `DATABASE_URL` and `SESSION_SECRET` as the website, and must be reachable over `https`/`wss`. Health check: `/health`.
   The browser asks the website for a five-minute token, then connects to the game server with it.

Environment reference: see `.env.example`. `EVENT_OVERRIDE=halloween` forces a seasonal event for testing.

## Gift cards and the admin page

- **Gift card** (menu): enter a code to add keys to your account. A code works once per account, can have a limited number of uses and an expiry date.
- **Admin** (menu, only for the account named `hamid`, hardcoded in `lib/auth.ts`): create, disable and delete gift cards, search users, give or take keys, and reset a user's password. Every admin endpoint re-checks on the server that the signed-in account is `hamid`; the button is only a convenience. After updating, run `db/schema.sql` again to add the gift card tables.

## Play

- Keyboard: WASD / arrows + Space. Mouse: move to steer, hold left button to fire. Touch: floating stick + FIRE.
- **Overheating:** holding fire builds heat (the bar under your ship). At the top the guns lock until they cool down.
  Release the trigger to cool faster; the *Cooling* upgrade slows heat build-up. **Ice cubes** (dropped by chickens) reset the
  cooldown at once and keep the guns cool for 5 seconds.
- **Meteor strikes:** every fourth wave (that is not a boss wave) the chickens stop laying eggs and rocks fall instead: a warning marker shows where, then the rock drops fast. Shoot a rock twice to break it. Egg waves are capped, so late waves no longer drown you in eggs.
- A weapon capsule lends its gun for 30 seconds if you fly a gun bought in the shop; the shop gun then comes back.
- Co-op: create a room, share the link or QR code. Fly over a downed teammate for 1.5s to revive them.
- Keys drop from chickens. Collect them in a run, claim them in the menu, and spend them in the
  Hangar & Shop on upgrades, guns, skins, paint and trails. Everyone starts with the standard plane.

## Leaderboard and rating

Menu -> *Leaderboard*. Two separate boards, each with *Rating*, *Best score*, *Best wave* and *This week*:

- **Online** runs are counted by the server's own simulation, so they are verified.
- **Solo** runs are simulated in your browser, so the server only accepts a score and wave that the elapsed
  time makes plausible (it caps both). Treat solo scores as best-effort.

**Rating** is the average of your best five runs (a run is worth its score plus 150 per wave), so one lucky run
cannot dominate. Your pilot name is public; nothing else about your account is. Results are stored with your profile in the database.

## Gyroscope steering (phones and tablets)

Tap the compass button in the game to steer by tilting the device (the pose you hold when you switch it on is the
centre; tap the recentre button to reset it). FIRE stays on screen. Browsers only expose motion sensors on **secure
pages**: the Vercel deployment is https, so it just works (iOS asks for motion permission the first time). Over plain
`http://<lan-ip>:3000` during development the button explains this; use `next dev --experimental-https` to test it locally.

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

## Game modes and variety

- **Daily challenge**: one fixed seed and mutator set per UTC day, same for everyone, with its own daily board.
- **Mutators** (solo, rooms, daily): modifiers such as fast chickens or thick vests that change the run and its score.
- **Bosses**: several boss kinds (swinger, mirror, splitter and more); **Boss rush** chains them with its own board.
- **Abilities and roles**: each pilot has a skill button (Space+Shift, or the on-screen skill key). Co-op roles
  (e.g. gunner, medic, tank) give each player a different strength.
- **Progression**: pilot XP and level, achievements, weekly goals and season stars from seasonal events.

## Rooms, spectating and replays

- *Rooms* lists public rooms; rooms can have a password, a mutator set, and quick play drops you in the best match.
- Spectators can watch any room. If your connection drops you have 30 seconds to rejoin the same seat automatically.
- Finished runs can be saved as **replays** (seed + inputs, re-simulated deterministically, so files are tiny).
  Export/import them as files; replays from an older sim version are refused.
- Resource packs can be shared in the community **Gallery**; the server re-validates every upload.

## Accessibility and settings

Settings has colour-blind patterns, reduced flashing, auto-fire, adjustable touch controls, separate volume
sliders (effects / music) and layered, per-event music. The UI is full screen; on touch devices a floating
joystick appears under your thumb anywhere on the left half of the screen.

## Install as an app (PWA)

In production the game is installable (manifest, icons, service worker) and single player works offline.
Needs https or localhost (Vercel provides https).

## Layout

- `app/` Next.js app (the page and the single API route); `lib/` server code: accounts, database stores, API handlers
- `db/schema.sql` the Postgres schema
- `shared/` game simulation (runs in the browser and on the game server), shop catalog, leaderboard and progression rules
- `src/` React UI, canvas renderer, effects, procedural audio
- `game-server/` WebSocket rooms server
- `public/` PWA manifest, service worker, icons, boss sound
- `scripts/` tests (`test-all.ts`), database migration, icon generator
