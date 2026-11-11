// Run records, rating and leaderboards. Pure logic shared by the server and the tests.
//
// Every profile keeps a record per mode:
//   solo   - played in the browser; the server only accepts a capped, plausible score
//   online - played in a room; the server's own simulation counted the score
// Rating = the average of a pilot's best five runs ("points" = score + 150 per wave), so a single lucky
// run cannot dominate and new pilots climb as they play more good runs.
export const MODES = ['solo', 'online'];
export const BOARDS = ['rating', 'score', 'wave', 'week'];
export const TOP_RUNS = 5;

export const points = (score, wave) => Math.max(0, Math.floor(score)) + Math.max(0, Math.floor(wave)) * 150;

export const emptyRec = () => ({ best: 0, bestWave: 0, runs: 0, top: [], week: { id: '', points: 0, score: 0, wave: 0 } });

/** ISO-8601 week label such as "2026-W46". */
export function weekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday of this week decides the year
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

/** Public display name: no control characters or angle brackets, collapsed spaces, 14 characters. */
export const cleanName = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Pilot';

const int = (v, max = 1e9) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(0, Math.floor(Number(v)))) : 0);

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
  const wk = weekId(date);
  if (rec.week.id !== wk) rec.week = { id: wk, points: 0, score: 0, wave: 0 };
  if (pts > rec.week.points) rec.week = { id: wk, points: pts, score, wave };
  return true;
}

export const ratingOf = (rec) => Math.round(rec.top.reduce((a, b) => a + b, 0) / TOP_RUNS);

export function sanitizeRec(raw) {
  const d = emptyRec();
  const r = raw && typeof raw === 'object' ? raw : {};
  d.best = int(r.best); d.bestWave = int(r.bestWave, 999); d.runs = int(r.runs);
  d.top = (Array.isArray(r.top) ? r.top : []).map((v) => int(v)).filter((v) => v > 0).sort((a, b) => b - a).slice(0, TOP_RUNS);
  const w = r.week && typeof r.week === 'object' ? r.week : {};
  d.week = { id: /^\d{4}-W\d{2}$/.test(String(w.id)) ? String(w.id) : '', points: int(w.points), score: int(w.score), wave: int(w.wave, 999) };
  return d;
}

/**
 * Builds one leaderboard. `profiles` is an iterable of [id, profile]. Public output never contains ids:
 * the requesting pilot's own rows are marked with `you` and their position is returned in `me`.
 */
export function buildBoard(profiles, mode, board, selfId, date = new Date(), limit = 50) {
  const m = MODES.includes(mode) ? mode : 'solo';
  const b = BOARDS.includes(board) ? board : 'rating';
  const wk = weekId(date);
  const rows = [];
  for (const [id, p] of profiles) {
    const rec = p.rec && p.rec[m];
    if (!rec || rec.runs <= 0) continue;
    const weekPoints = rec.week.id === wk ? rec.week.points : 0;
    const value = b === 'rating' ? ratingOf(rec) : b === 'score' ? rec.best : b === 'wave' ? rec.bestWave : weekPoints;
    if (value <= 0) continue;
    rows.push({
      id, value, name: cleanName(p.name), rating: ratingOf(rec), score: rec.best, wave: rec.bestWave, runs: rec.runs,
      weekPoints, weekScore: rec.week.id === wk ? rec.week.score : 0,
    });
  }
  rows.sort((x, y) => y.value - x.value || y.rating - x.rating || x.name.localeCompare(y.name));
  const strip = ({ id, ...pub }, i) => ({ rank: i + 1, ...pub, you: id === selfId });
  const all = rows.map(strip);
  return {
    mode: m, board: b, week: wk, total: rows.length,
    entries: all.slice(0, limit),
    me: all.find((e) => e.you) || null,
  };
}
