// Run records, rating and leaderboards. Pure logic shared by the server and the tests.
//
// Every profile keeps a record per mode:
//   solo   - played in the browser; the server only accepts a capped, plausible score
//   online - played in a room; the server's own simulation counted the score
//   daily  - the seeded daily challenge (browser-played, capped like solo)
//   rush   - Boss Rush (browser-played, capped like solo)
// Rating = the average of a pilot's best five runs ("points" = score + 150 per wave), so a single lucky
// run cannot dominate and new pilots climb as they play more good runs.
import { weekId, dayId } from './timeutil.js';
import { levelOf } from './progress.js';
export { weekId };

export const MODES = ['solo', 'online', 'daily', 'rush'];
export const BOARDS = ['rating', 'score', 'wave', 'week', 'today'];
export const TOP_RUNS = 5;

export const points = (score, wave) => Math.max(0, Math.floor(score)) + Math.max(0, Math.floor(wave)) * 150;

const emptyPeriod = () => ({ id: '', points: 0, score: 0, wave: 0 });
export const emptyRec = () => ({ best: 0, bestWave: 0, runs: 0, top: [], week: emptyPeriod(), day: emptyPeriod() });

/** Public display name: no control characters or angle brackets, collapsed spaces, 14 characters. */
export const cleanName = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Pilot';

const int = (v, max = 1e9) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(0, Math.floor(Number(v)))) : 0);

function bump(slot, id, pts, score, wave) {
  const cur = slot.id === id ? slot : { id, points: 0, score: 0, wave: 0 };
  return pts > cur.points ? { id, points: pts, score, wave } : cur;
}

/** Adds a finished run to a record. Returns false when the run is not worth recording. */
export function recordRun(rec, run, date = new Date()) {
  const score = int(run.score), wave = int(run.wave, 999);
  if (score <= 0) return false;
  const pts = points(score, wave);
  rec.runs += 1;
  rec.best = Math.max(rec.best, score);
  rec.bestWave = Math.max(rec.bestWave, wave);
  rec.top.push(pts);
  rec.top.sort((a, b) => b - a);
  rec.top.length = Math.min(TOP_RUNS, rec.top.length);
  rec.week = bump(rec.week, weekId(date), pts, score, wave);
  rec.day = bump(rec.day, dayId(date), pts, score, wave); // "today" board (UTC day)
  return true;
}

export const ratingOf = (rec) => Math.round(rec.top.reduce((a, b) => a + b, 0) / TOP_RUNS);

const cleanPeriod = (raw, re) => {
  const w = raw && typeof raw === 'object' ? raw : {};
  return { id: re.test(String(w.id)) ? String(w.id) : '', points: int(w.points), score: int(w.score), wave: int(w.wave, 999) };
};

export function sanitizeRec(raw) {
  const d = emptyRec();
  const r = raw && typeof raw === 'object' ? raw : {};
  d.best = int(r.best); d.bestWave = int(r.bestWave, 999); d.runs = int(r.runs);
  d.top = (Array.isArray(r.top) ? r.top : []).map((v) => int(v)).filter((v) => v > 0).sort((a, b) => b - a).slice(0, TOP_RUNS);
  d.week = cleanPeriod(r.week, /^\d{4}-W\d{2}$/);
  d.day = cleanPeriod(r.day, /^\d{4}-\d{2}-\d{2}$/);
  return d;
}

/**
 * Builds one leaderboard. `profiles` is an iterable of [id, profile]. Public output never contains ids:
 * the requesting pilot's own rows are marked with `you` and their position is returned in `me`.
 */
export function buildBoard(profiles, mode, board, selfId, date = new Date(), limit = 50) {
  const m = MODES.includes(mode) ? mode : 'solo';
  const b = BOARDS.includes(board) ? board : 'rating';
  const wk = weekId(date), day = dayId(date);
  const rows = [];
  for (const [id, p] of profiles) {
    const rec = p.rec && p.rec[m];
    if (!rec || rec.runs <= 0) continue;
    const weekPoints = rec.week.id === wk ? rec.week.points : 0;
    const todayPoints = rec.day.id === day ? rec.day.points : 0;
    const value = b === 'rating' ? ratingOf(rec) : b === 'score' ? rec.best : b === 'wave' ? rec.bestWave : b === 'week' ? weekPoints : todayPoints;
    if (value <= 0) continue;
    rows.push({
      id, value, name: cleanName(p.name), title: p.title || '', level: levelOf(p.xp || 0).level,
      rating: ratingOf(rec), score: rec.best, wave: rec.bestWave, runs: rec.runs,
      weekPoints, todayPoints, todayScore: rec.day.id === day ? rec.day.score : 0,
    });
  }
  rows.sort((x, y) => y.value - x.value || y.rating - x.rating || x.name.localeCompare(y.name));
  const strip = ({ id, ...pub }, i) => ({ rank: i + 1, ...pub, you: id === selfId });
  const all = rows.map(strip);
  return {
    mode: m, board: b, week: wk, day, total: rows.length,
    entries: all.slice(0, limit),
    me: all.find((e) => e.you) || null,
  };
}
