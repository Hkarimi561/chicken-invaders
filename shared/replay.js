// Replays: a run is stored as the seed plus the player's input changes, and played back by re-simulating.
// This works because the simulation is deterministic: same seed + same inputs on the same ticks = same game.
import { createState, addPlayer, setInput, step, emptyInput, SIM_VERSION } from './sim.js';

export const REPLAY_FORMAT = 1;
export const MAX_REPLAY_TICKS = 60 * 60 * 20; // 20 minutes

/** meta: { seed, mut, rush, daily, event, startWave, name, loadout }. */
export function newReplay(meta) {
  return { format: REPLAY_FORMAT, ver: SIM_VERSION, meta: { ...meta }, inputs: [], ticks: 0, score: 0, wave: 0, when: Date.now(), _last: '' };
}

const pack = (i) => [i.left | 0, i.right | 0, i.up | 0, i.down | 0, i.fire | 0, i.ab | 0, Number.isFinite(i.tx) ? Math.round(i.tx) : null, Number.isFinite(i.ty) ? Math.round(i.ty) : null];
const unpack = (a) => ({ left: a[1], right: a[2], up: a[3], down: a[4], fire: a[5], ab: a[6], tx: a[7], ty: a[8] });

/** Call once per simulation tick with the input that is about to be applied; only changes are stored. */
export function recordInput(rep, tick, input) {
  const a = pack(input), key = a.join();
  if (key === rep._last) return;
  rep._last = key;
  rep.inputs.push([tick, ...a]);
}

/** Cleans a replay that came from a file or storage: numbers only, bounded sizes. */
export function sanitizeReplay(raw) {
  if (!raw || typeof raw !== 'object' || raw.format !== REPLAY_FORMAT) throw new Error('This is not a replay file');
  if (raw.ver !== SIM_VERSION) throw new Error('This replay was recorded on an older version of the game and can no longer be played');
  const m = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const n = (v, max) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)));
  const inputs = (Array.isArray(raw.inputs) ? raw.inputs : []).slice(0, 400000).map((r) => {
    if (!Array.isArray(r) || r.length !== 9) throw new Error('This replay file is damaged');
    return [n(r[0], MAX_REPLAY_TICKS), r[1] ? 1 : 0, r[2] ? 1 : 0, r[3] ? 1 : 0, r[4] ? 1 : 0, r[5] ? 1 : 0, r[6] ? 1 : 0, Number.isFinite(r[7]) ? n(r[7], 1000) : null, Number.isFinite(r[8]) ? n(r[8], 1000) : null];
  });
  return {
    format: REPLAY_FORMAT, ver: SIM_VERSION,
    meta: {
      seed: n(m.seed, 4294967295), mut: Array.isArray(m.mut) ? m.mut.map(String).slice(0, 8) : [], rush: !!m.rush, daily: !!m.daily,
      event: typeof m.event === 'string' ? m.event.slice(0, 12) : null, startWave: n(m.startWave, 999),
      name: String(m.name || 'Pilot').slice(0, 14), loadout: m.loadout && typeof m.loadout === 'object' ? m.loadout : {},
    },
    inputs, ticks: n(raw.ticks, MAX_REPLAY_TICKS), score: n(raw.score, 1e9), wave: n(raw.wave, 999), when: n(raw.when, 9e15),
  };
}

/** Builds the starting state of a replay. */
export function replayStart(rep) {
  const m = rep.meta;
  const s = createState(m.seed, { mut: m.mut, rush: m.rush, daily: m.daily, event: m.event });
  s.wave = m.startWave || 0; s.cleared = s.wave > 0;
  addPlayer(s, 'me', m.name, m.loadout);
  return s;
}

/** Cursor-based playback: applies the recorded inputs that are due on this tick, then steps. */
export function replayTick(s, rep, cur) {
  while (cur.i < rep.inputs.length && rep.inputs[cur.i][0] <= cur.tick) { setInput(s, 'me', unpack(rep.inputs[cur.i])); cur.i++; }
  step(s, 1 / 60);
  cur.tick++;
}

/** Plays a whole replay without rendering (used by tests and for verification). */
export function runReplay(rep) {
  const s = replayStart(rep);
  const cur = { i: 0, tick: 0 };
  setInput(s, 'me', emptyInput());
  while (cur.tick < rep.ticks && !s.over) replayTick(s, rep, cur);
  return { state: s, ticks: cur.tick };
}
