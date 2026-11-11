// Calendar helpers shared by the leaderboard, daily challenge and weekly goals.

/** ISO-8601 week label such as "2026-W46" (local time). */
export function weekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday of this week decides the year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

/** "2026-11" (local time): the season-star period. */
export const monthId = (date = new Date()) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');

/** "2026-11-12" in UTC, so everyone in the world shares the same daily challenge. */
export const dayId = (date = new Date()) => date.toISOString().slice(0, 10);

export const prevDayId = (date = new Date()) => dayId(new Date(date.getTime() - 86400000));

/** Small deterministic string hash (FNV-1a) and a seeded generator. */
export function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
