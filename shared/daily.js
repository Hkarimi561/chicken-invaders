// The daily challenge: one seeded run per UTC day, identical for everyone, with its own leaderboard.
import { MUT_IDS } from './sim.js';
import { dayId, hash32, lcg } from './timeutil.js';

/** { id, seed, mut, reward }: same inputs always give the same challenge. */
export function dailyInfo(date = new Date()) {
  const id = dayId(date);
  const seed = hash32('chicken-blasters:' + id);
  const rnd = lcg(seed);
  const ids = [...MUT_IDS];
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const mut = ids.slice(0, 1 + (seed % 2)); // one or two rule changes
  return { id, seed, mut, reward: 3 + mut.length };
}
