// Progression: achievements, XP and levels, weekly goals and season stars. Pure functions over a profile,
// used by the server to apply a finished run and by the client to display progress.
import { weekId, monthId, dayId, prevDayId, hash32, lcg } from './timeutil';

export const XP_STEP = 120; // level n starts at XP_STEP * (n-1)^2
export function levelOf(xp) {
  const x = Math.max(0, Math.floor(xp || 0));
  const level = 1 + Math.floor(Math.sqrt(x / XP_STEP));
  const floor = XP_STEP * (level - 1) ** 2, next = XP_STEP * level ** 2;
  return { level, xp: x, into: x - floor, need: next - floor };
}

// ---- achievements ----
// c = { run, life, event }: the finished run, lifetime totals (already including it) and the running event.
export const ACHIEVEMENTS = [
  { id: 'first_run', name: 'Cleared for takeoff', desc: 'Finish your first run', xp: 20, keys: 1, test: (c) => c.run.score > 0 },
  { id: 'wave5', name: 'Warming up', desc: 'Reach wave 5', xp: 30, keys: 2, test: (c) => c.run.wave >= 5 },
  { id: 'wave10', name: 'Double digits', desc: 'Reach wave 10', xp: 60, keys: 4, test: (c) => c.run.wave >= 10 },
  { id: 'wave20', name: 'Veteran pilot', desc: 'Reach wave 20', xp: 120, keys: 8, title: 'Veteran', test: (c) => c.run.wave >= 20 },
  { id: 'wave30', name: 'Ace of the skies', desc: 'Reach wave 30', xp: 250, keys: 15, title: 'Ace', test: (c) => c.run.wave >= 30 },
  { id: 'boss1', name: 'Crowned', desc: 'Defeat a boss', xp: 40, keys: 3, test: (c) => c.run.bosses >= 1 },
  { id: 'bosses10', name: 'Boss hunter', desc: 'Defeat 10 bosses in total', xp: 100, keys: 6, title: 'Boss Hunter', test: (c) => c.life.bosses >= 10 },
  { id: 'kills500', name: 'Chicken chaser', desc: 'Defeat 500 chickens in total', xp: 60, keys: 3, test: (c) => c.life.kills >= 500 },
  { id: 'kills5000', name: 'Exterminator', desc: 'Defeat 5,000 chickens in total', xp: 200, keys: 10, title: 'Exterminator', test: (c) => c.life.kills >= 5000 },
  { id: 'flawless3', name: 'Untouchable', desc: 'Clear 3 waves without a hit in one run', xp: 80, keys: 4, title: 'Untouchable', test: (c) => c.run.flawless >= 3 },
  { id: 'nova5', name: 'Power surge', desc: 'Use your ability 5 times in one run', xp: 50, keys: 3, test: (c) => c.run.novas >= 5 },
  { id: 'medic', name: 'Field medic', desc: 'Heal or revive 3 times in one run', xp: 70, keys: 4, title: 'Medic', test: (c) => c.run.revives + c.run.mends >= 3 },
  { id: 'mutator', name: 'Rule breaker', desc: 'Reach wave 8 with 2+ mutators on', xp: 90, keys: 5, title: 'Rule Breaker', test: (c) => c.run.wave >= 8 && c.run.mut >= 2 },
  { id: 'daily1', name: 'Daily driver', desc: 'Finish a daily challenge', xp: 40, keys: 3, test: (c) => c.life.dailies >= 1 },
  { id: 'daily7', name: 'Daily grind', desc: 'Finish 7 daily challenges', xp: 120, keys: 8, title: 'Grinder', test: (c) => c.life.dailies >= 7 },
  { id: 'streak3', name: 'On a roll', desc: 'Finish the daily challenge 3 days in a row', xp: 80, keys: 5, title: 'Regular', test: (c) => c.life.streak >= 3 },
  { id: 'rush3', name: 'Rush hour', desc: 'Defeat 3 bosses in one Boss Rush', xp: 100, keys: 6, title: 'Rusher', test: (c) => c.run.mode === 'rush' && c.run.bosses >= 3 },
  { id: 'keys100', name: 'Key collector', desc: 'Collect 100 keys in total', xp: 80, keys: 5, test: (c) => c.life.keys >= 100 },
  { id: 'veteran', name: 'Regular flyer', desc: 'Finish 25 runs', xp: 80, keys: 5, test: (c) => c.life.runs >= 25 },
  { id: 'festive', name: 'Festive spirit', desc: 'Finish a run during a seasonal event', xp: 40, keys: 3, test: (c) => !!c.event && c.run.score > 0 },
];

// ---- weekly goals ----
const GOAL_POOL = [
  { id: 'kills', text: (t) => `Defeat ${t} chickens`, stat: 'kills', agg: 'sum', targets: [120, 200, 300], reward: 4 },
  { id: 'bosses', text: (t) => `Defeat ${t} bosses`, stat: 'bosses', agg: 'sum', targets: [2, 3, 5], reward: 6 },
  { id: 'wave', text: (t) => `Reach wave ${t} in one run`, stat: 'wave', agg: 'max', targets: [8, 10, 14], reward: 6 },
  { id: 'keys', text: (t) => `Collect ${t} keys`, stat: 'keys', agg: 'sum', targets: [12, 20, 30], reward: 5 },
  { id: 'novas', text: (t) => `Use your ability ${t} times`, stat: 'novas', agg: 'sum', targets: [8, 12, 20], reward: 4 },
  { id: 'score', text: (t) => `Score ${t.toLocaleString('en-US')} in a single run`, stat: 'score', agg: 'max', targets: [3000, 6000, 10000], reward: 6 },
  { id: 'flawless', text: (t) => `Clear ${t} waves without being hit`, stat: 'flawless', agg: 'sum', targets: [4, 8, 12], reward: 5 },
  { id: 'dailies', text: (t) => `Finish ${t} daily challenges`, stat: 'daily', agg: 'sum', targets: [2, 3, 5], reward: 7 },
  { id: 'mutated', text: (t) => `Play ${t} runs with mutators on`, stat: 'mutRuns', agg: 'sum', targets: [2, 3, 4], reward: 5 },
];

/** Three goals for a week, the same for every pilot. */
export function weeklyGoals(week) {
  const seed = hash32('weekly:' + week), rnd = lcg(seed);
  const pool = [...GOAL_POOL];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 3).map((g) => {
    const target = g.targets[Math.floor(rnd() * g.targets.length)];
    return { id: g.id, text: g.text(target), target, stat: g.stat, agg: g.agg, reward: g.reward };
  });
}

// ---- season stars ----
export const SEASON_TIERS = [{ stars: 3, keys: 5 }, { stars: 6, keys: 10 }, { stars: 10, keys: 15 }, { stars: 15, keys: 25 }];

const num = (v, max = 1e9) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(0, Math.floor(Number(v)))) : 0);

export const defaultProgress = () => ({
  xp: 0, title: '', ach: {}, achNew: [],
  life: { runs: 0, kills: 0, bosses: 0, keys: 0, flawless: 0, novas: 0, dailies: 0, streak: 0, lastDaily: '' },
  weekly: { id: '', prog: {}, done: [], claimed: [] },
  season: { id: '', stars: 0, claimed: [] },
});

export function sanitizeProgress(raw) {
  const d = defaultProgress();
  const r = raw && typeof raw === 'object' ? raw : {};
  d.xp = num(r.xp);
  const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
  for (const [id, t] of Object.entries(r.ach && typeof r.ach === 'object' ? r.ach : {})) if (ids.has(id)) d.ach[id] = num(t, 9e15);
  d.achNew = (Array.isArray(r.achNew) ? r.achNew : []).filter((id) => d.ach[id]).slice(0, 40);
  const titles = new Set(ACHIEVEMENTS.filter((a) => a.title && d.ach[a.id]).map((a) => a.title));
  d.title = titles.has(r.title) ? r.title : '';
  for (const k of Object.keys(d.life)) if (k !== 'lastDaily') d.life[k] = num(r.life?.[k]);
  d.life.lastDaily = /^\d{4}-\d{2}-\d{2}$/.test(String(r.life?.lastDaily)) ? String(r.life.lastDaily) : '';
  const w = r.weekly && typeof r.weekly === 'object' ? r.weekly : {};
  d.weekly.id = /^\d{4}-W\d{2}$/.test(String(w.id)) ? String(w.id) : '';
  for (const [k, v] of Object.entries(w.prog && typeof w.prog === 'object' ? w.prog : {})) if (/^[a-z]{2,12}$/.test(k)) d.weekly.prog[k] = num(v);
  d.weekly.done = (Array.isArray(w.done) ? w.done : []).filter((x) => /^[a-z]{2,12}$/.test(String(x))).slice(0, 5);
  d.weekly.claimed = (Array.isArray(w.claimed) ? w.claimed : []).filter((x) => /^[a-z]{2,12}$/.test(String(x))).slice(0, 5);
  const s = r.season && typeof r.season === 'object' ? r.season : {};
  d.season.id = /^\d{4}-\d{2}$/.test(String(s.id)) ? String(s.id) : '';
  d.season.stars = num(s.stars, 999);
  d.season.claimed = (Array.isArray(s.claimed) ? s.claimed : []).map((x) => num(x, 99)).slice(0, 8);
  return d;
}

const statOf = (stat, run) => (stat === 'daily' ? (run.mode === 'daily' && run.dailyDone ? 1 : 0) : stat === 'mutRuns' ? (run.mut > 0 ? 1 : 0) : num(run[stat]));

/** Makes sure the weekly and season blocks belong to the current week/month. */
export function rollPeriods(p, date = new Date()) {
  const wk = weekId(date), mo = monthId(date);
  if (p.weekly.id !== wk) p.weekly = { id: wk, prog: {}, done: [], claimed: [] };
  if (p.season.id !== mo) p.season = { id: mo, stars: 0, claimed: [] };
}

/**
 * Applies a finished run to a profile: lifetime totals, XP, achievements, weekly goals, season stars,
 * and the daily-challenge reward. run = { mode, score, wave, kills, keys, bosses, flawless, novas, mends,
 * revives, mut (count), daily: dailyInfo|null }. Returns what changed so the UI can celebrate it.
 */
export function applyRun(p, run, date = new Date(), event = null) {
  rollPeriods(p, date);
  const before = levelOf(p.xp).level;
  const L = p.life;
  L.runs++; L.kills += num(run.kills); L.bosses += num(run.bosses); L.keys += num(run.keys); L.flawless += num(run.flawless); L.novas += num(run.novas);

  // daily challenge: the first decent run of each UTC day pays a reward and extends the streak
  let dailyDone = false, dailyReward = 0;
  const today = dayId(date);
  if (run.mode === 'daily' && run.daily && run.score > 0 && run.wave >= 3 && L.lastDaily !== today) {
    dailyDone = true; dailyReward = run.daily.reward;
    L.streak = L.lastDaily === prevDayId(date) ? L.streak + 1 : 1;
    L.lastDaily = today; L.dailies++;
    p.pending += dailyReward;
    p.season.stars++;
  }
  const r2 = { ...run, dailyDone };

  let xp = Math.floor(num(run.score) / 100) + num(run.wave) * 8;
  const unlocked = [];
  const ctx = { run: { ...r2, mut: num(run.mut), revives: num(run.revives), mends: num(run.mends) }, life: L, event };
  for (const a of ACHIEVEMENTS) {
    if (p.ach[a.id] || !a.test(ctx)) continue;
    p.ach[a.id] = date.getTime();
    p.achNew.push(a.id);
    unlocked.push(a.id);
    xp += a.xp; p.pending += a.keys;
  }

  // weekly goals
  const goalsDone = [];
  for (const g of weeklyGoals(p.weekly.id)) {
    const v = statOf(g.stat, r2);
    const cur = p.weekly.prog[g.id] || 0;
    p.weekly.prog[g.id] = Math.min(g.target, g.agg === 'max' ? Math.max(cur, v) : cur + v);
    if (p.weekly.prog[g.id] >= g.target && !p.weekly.done.includes(g.id)) { p.weekly.done.push(g.id); p.season.stars++; goalsDone.push(g.id); }
  }

  p.xp += xp;
  return { unlocked, goalsDone, xp, dailyDone, dailyReward, levelUp: levelOf(p.xp).level > before };
}

export function claimWeekly(p, goalId, date = new Date()) {
  rollPeriods(p, date);
  const g = weeklyGoals(p.weekly.id).find((x) => x.id === goalId);
  if (!g) return { ok: false, error: 'Unknown goal' };
  if (!p.weekly.done.includes(goalId)) return { ok: false, error: 'Goal not finished yet' };
  if (p.weekly.claimed.includes(goalId)) return { ok: false, error: 'Already claimed' };
  p.weekly.claimed.push(goalId);
  p.keys += g.reward;
  return { ok: true, keys: g.reward };
}

export function claimSeason(p, tier, date = new Date()) {
  rollPeriods(p, date);
  const t = SEASON_TIERS[tier];
  if (!t) return { ok: false, error: 'Unknown tier' };
  if (p.season.stars < t.stars) return { ok: false, error: 'Not enough stars yet' };
  if (p.season.claimed.includes(tier)) return { ok: false, error: 'Already claimed' };
  p.season.claimed.push(tier);
  p.keys += t.keys;
  return { ok: true, keys: t.keys };
}

export function setTitle(p, title) {
  if (!title) { p.title = ''; return { ok: true }; }
  const ok = ACHIEVEMENTS.some((a) => a.title === title && p.ach[a.id]);
  if (!ok) return { ok: false, error: 'You have not unlocked that title' };
  p.title = title;
  return { ok: true };
}
