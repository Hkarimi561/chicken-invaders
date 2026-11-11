// Tests for the second feature batch: mutators, roles and abilities, boss kinds, boss rush, daily seed,
// replays, progression, rooms (public/password/quick/spectate/reconnect) and the community pack gallery.
// Needs the server running (npm start). Run with: node scripts/smoke2.js
import { WebSocket } from 'ws';
import {
  createState, addPlayer, step, setInput, emptyInput, W, H, BOSS_KINDS, SIM_VERSION, MUT_IDS,
} from '../shared/sim.js';
import { dailyInfo } from '../shared/daily.js';
import { dayId } from '../shared/timeutil.js';
import {
  levelOf, applyRun, weeklyGoals, claimWeekly, claimSeason, setTitle, defaultProgress, sanitizeProgress, ACHIEVEMENTS, SEASON_TIERS,
} from '../shared/progress.js';
import { defaultProfile } from '../shared/catalog.js';
import { emptyRec, recordRun, buildBoard } from '../shared/leaderboard.js';
import { newReplay, recordInput, runReplay, sanitizeReplay } from '../shared/replay.js';

const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- mutators
{
  const m = createState(1, { mut: ['bogus', 'glass', 'heavy', 'glass'] });
  assert(m.mut.join() === 'glass,heavy' && Math.abs(m.smul - 1.4) < 1e-9 && m.kmul === 1.5, 'mutators are validated, de-duplicated and priced');
  addPlayer(m, 'a', 'A');
  assert(m.players.a.lives === 1, 'glass hull: one life');
  m.delay = 0; step(m, 1 / 60);
  assert(m.chickens.every((c) => c.hp === c.tier + 2), 'thick hides: +1 hit point');

  const count = (opts) => { const s = createState(3, opts); addPlayer(s, 'a', 'A'); s.wave = 5; s.cleared = true; s.delay = 0; step(s, 1 / 60); return s.chickens.length; };
  assert(count({ mut: ['swarm'] }) > count({}), 'swarm: more chickens');

  const eggs = (mut) => { const s = createState(4, { mut }); addPlayer(s, 'a', 'A'); s.wave = 11; s.cleared = true; s.delay = 0; for (let i = 0; i < 900; i++) { s.players.a.lives = 1e6; step(s, 1 / 60); } return s.nid; };
  assert(eggs(['rapid']) > eggs([]), 'egg storm: chickens lay more');

  const drift = (mut) => { const s = createState(5, { mut }); addPlayer(s, 'a', 'A'); s.wave = 3; s.cleared = true; s.delay = 0; for (let i = 0; i < 90; i++) step(s, 1 / 60); return Math.abs(s.gx); };
  assert(drift(['fast']) > drift([]) * 1.2, 'hyperdrive: chickens move faster');

  const gifts = (mut) => {
    const s = createState(9, { mut }); addPlayer(s, 'a', 'A'); s.players.a.lives = 1e6; s.delay = 99; s.hw = 200; s.pattern = 'grid';
    for (let i = 0; i < 160; i++) {
      s.chickens.push({ id: 5000 + i, x: 0, y: 0, ox: 0, oy: 0, hp: 1, max: 1, tier: 0, r: 22, fl: 0, dv: 0, ent: 1 });
      s.bullets.push({ x: W / 2 + s.gx, y: 80 + s.gy, vx: 0, vy: 0, o: 'a', w: 'b', d: 5 });
      step(s, 1 / 60);
    }
    return s.gifts;
  };
  assert(gifts([]).some((g) => g.k !== 'key'), 'baseline: chickens drop power-ups');
  assert(gifts(['drought']).every((g) => g.k === 'key'), 'drought: only keys fall');
}

// ---------------------------------------------------------------- roles + abilities
{
  const t = createState(2);
  addPlayer(t, 't', 'T', { role: 'tank' }); addPlayer(t, 's', 'S', { role: 'striker' }); addPlayer(t, 'x', 'X', { role: 'nope' });
  assert(t.players.t.lives === 4 && t.players.x.role === 'ace', 'tank has +1 life; unknown roles become ace');
  t.delay = 99;
  setInput(t, 's', { ...emptyInput(), fire: 1 }); setInput(t, 'x', { ...emptyInput(), fire: 1 });
  step(t, 1 / 60);
  assert(t.players.s.cd < t.players.x.cd - 0.01, 'striker fires faster');

  const revive = (reviverRole) => {
    const s = createState(2); addPlayer(s, 'r', 'R', { role: reviverRole }); addPlayer(s, 'd', 'D'); s.delay = 99;
    s.players.d.alive = false; s.players.d.lives = 0; s.players.d.x = s.players.r.x + 10; s.players.d.y = s.players.r.y;
    for (let i = 0; i < 50; i++) step(s, 1 / 60); // 0.83s
    return s.players.d.alive;
  };
  assert(revive('medic') && !revive('ace'), 'medic revives allies twice as fast');

  const nova = createState(5); addPlayer(nova, 'a', 'A'); nova.delay = 99; nova.hw = 200;
  for (const ox of [-60, 0, 60]) nova.chickens.push({ id: 100 + ox, x: 0, y: 0, ox, oy: 0, hp: 3, max: 3, tier: 2, r: 22, fl: 0, dv: 0, ent: 1 });
  for (let i = 0; i < 5; i++) nova.eggs.push({ id: 900 + i, x: 300 + i * 20, y: 300, vx: 0, vy: 0 });
  nova.players.a.input = { ...emptyInput(), ab: 1 };
  step(nova, 1 / 60);
  assert(nova.players.a.st.novas === 0 && nova.chickens.length === 3 && nova.eggs.length === 5, 'the ability does nothing until it is charged');
  nova.players.a.input = { ...emptyInput(), ab: 0 }; step(nova, 1 / 60); // release the early press: it is edge-triggered
  nova.players.a.charge = 100;
  nova.players.a.input = { ...emptyInput(), ab: 1 };
  step(nova, 1 / 60);
  assert(nova.chickens.length === 0 && nova.eggs.length === 0 && nova.players.a.st.novas === 1 && nova.fxPulse.some((p) => p.kind === 'nova'), 'Nova damages every chicken and wipes the eggs');
  assert(nova.players.a.charge < 100 && nova.players.a.charge > 0, 'charge resets, then kills recharge it');
  nova.players.a.charge = 100; step(nova, 1 / 60);
  assert(nova.players.a.st.novas === 1, 'holding the button does not re-trigger');
  nova.players.a.input = { ...emptyInput(), ab: 0 }; step(nova, 1 / 60);
  nova.players.a.input = { ...emptyInput(), ab: 1 }; step(nova, 1 / 60);
  assert(nova.players.a.st.novas === 2, 'releasing and pressing again triggers it');

  const aegis = createState(6);
  addPlayer(aegis, 't', 'T', { role: 'tank' }); addPlayer(aegis, 'n', 'N'); addPlayer(aegis, 'f', 'F');
  aegis.delay = 99; Object.assign(aegis.players.t, { x: 400, y: 500, charge: 100, inv: 0 }); Object.assign(aegis.players.n, { x: 450, y: 500, inv: 0 }); Object.assign(aegis.players.f, { x: 40, y: 500, inv: 0 });
  aegis.eggs.push({ id: 1, x: 420, y: 480, vx: 0, vy: 0 }, { id: 2, x: 40, y: 400, vx: 0, vy: 0 });
  aegis.players.t.input = { ...emptyInput(), ab: 1 };
  step(aegis, 1 / 60);
  assert(aegis.players.n.inv > 2.9 && aegis.players.f.inv === 0, 'Aegis shields allies in range only');
  assert(aegis.eggs.length === 1 && aegis.eggs[0].id === 2, 'Aegis destroys nearby eggs');

  const mend = createState(7);
  addPlayer(mend, 'm', 'M', { role: 'medic' }); addPlayer(mend, 'h', 'H'); addPlayer(mend, 'd', 'D');
  mend.delay = 99; Object.assign(mend.players.m, { x: 400, y: 500, charge: 100 }); mend.players.h.x = 450; mend.players.h.y = 500; mend.players.h.lives = 1;
  Object.assign(mend.players.d, { x: 380, y: 520, alive: false, lives: 0 });
  mend.players.m.input = { ...emptyInput(), ab: 1 };
  step(mend, 1 / 60);
  assert(mend.players.h.lives === 2 && mend.players.d.alive && mend.players.m.st.mends >= 1 && mend.players.m.st.revives === 1, 'Mend heals and revives everyone nearby');
}

// ---------------------------------------------------------------- bosses
{
  const spawned = (wave, opts = {}) => { const s = createState(1, opts); addPlayer(s, 'a', 'A'); s.wave = wave - 1; s.cleared = true; s.delay = 0; step(s, 1 / 60); return s; };
  for (const [w, k] of [[5, 'rooster'], [10, 'mother'], [15, 'sweeper'], [20, 'splitter'], [25, 'mirror'], [30, 'rooster']])
    assert(spawned(w).chickens.find((c) => c.boss).kind === k, `wave ${w} boss is ${k}`);
  assert(BOSS_KINDS.length === 5, 'five boss kinds');

  // no boss may teleport (the swing/slide must be continuous across phase changes)
  for (const wave of [15, 20, 25]) {
    const b = spawned(wave); b.players.a.x = 150;
    const boss = b.chickens.find((c) => c.boss);
    for (let i = 0; i < 240; i++) step(b, 1 / 60);
    b.t += 100;
    let worst = 0, last = boss.x;
    for (let i = 0; i < 700; i++) {
      if (i === 100) boss.hp = Math.floor(boss.max * 0.6);
      if (i === 300) boss.hp = Math.floor(boss.max * 0.3);
      b.players.a.lives = 9999; b.players.a.x = 150;
      step(b, 1 / 60);
      worst = Math.max(worst, Math.abs(boss.x - last)); last = boss.x;
    }
    assert(worst < 8, `${boss.kind} moves continuously (worst ${worst.toFixed(1)}px)`);
  }

  const sw = spawned(15); for (let i = 0; i < 240; i++) step(sw, 1 / 60);
  const sboss = sw.chickens.find((c) => c.boss);
  sboss.beam = { t: 1.85, dir: 1, a: 0, on: false };
  Object.assign(sw.players.a, { x: sboss.x, y: sboss.y + 200, inv: 0, lives: 3 });
  step(sw, 1 / 60);
  assert(sw.players.a.lives === 2, 'the sweeper laser hurts a pilot standing in the beam');
  const safe = spawned(15); for (let i = 0; i < 240; i++) step(safe, 1 / 60);
  const sb2 = safe.chickens.find((c) => c.boss); sb2.beam = { t: 1.85, dir: 1, a: 0, on: false };
  Object.assign(safe.players.a, { x: sb2.x + 160, y: sb2.y + 200, inv: 0, lives: 3 });
  step(safe, 1 / 60);
  assert(safe.players.a.lives === 3, 'standing beside the beam is safe');

  const sp = spawned(20); for (let i = 0; i < 240; i++) step(sp, 1 / 60);
  const spb = sp.chickens.find((c) => c.boss);
  assert(!sp.chickens.some((c) => c.mini) && spb.sh === 0, 'the splitter starts whole and vulnerable');
  spb.hp = Math.floor(spb.max * 0.6); step(sp, 1 / 60);
  assert(sp.chickens.filter((c) => c.mini).length === 2 && spb.sh === 1, 'at 66% it splits in two and becomes invulnerable');
  spb.hp = Math.floor(spb.max * 0.3); step(sp, 1 / 60);
  assert(sp.chickens.filter((c) => c.mini).length === 4, 'at 33% it splits again');
  sp.chickens = sp.chickens.filter((c) => !c.mini); step(sp, 1 / 60);
  assert(spb.sh === 0, 'with its pieces gone it can be hurt again');

  const mi = spawned(25); for (let i = 0; i < 240; i++) step(mi, 1 / 60);
  const mb = mi.chickens.find((c) => c.boss);
  mi.players.a.x = 100; for (let i = 0; i < 300; i++) { mi.players.a.lives = 99; step(mi, 1 / 60); }
  assert(mb.x > W / 2 + 100, 'the mirror boss slides to the opposite side from the pilot');

  // boss rush
  const rush = createState(1, { rush: true }); addPlayer(rush, 'a', 'A'); rush.delay = 0; step(rush, 1 / 60);
  const r1 = rush.chickens.find((c) => c.boss);
  assert(rush.chickens.length === 1 && r1.kind === 'rooster' && rush.banner.startsWith('Boss Rush'), 'boss rush starts with a boss, no minions');
  for (let i = 0; i < 120; i++) step(rush, 1 / 60);
  r1.hp = 1; rush.bullets.push({ x: r1.x, y: r1.y, vx: 0, vy: 0, o: 'a', w: 'b', d: 1 }); step(rush, 1 / 60);
  assert(rush.chickens.length === 0 && rush.players.a.st.bosses === 1 && rush.players.a.lives === 4, 'defeating a rush boss counts and restores a life');
  for (let i = 0; i < 200; i++) step(rush, 1 / 60);
  assert(rush.wave === 2 && rush.chickens.find((c) => c.boss).kind === 'mother', 'the next rush boss is the mother hen');

  // event boss pays extra keys
  const ev = spawned(5, { event: 'halloween' }); for (let i = 0; i < 120; i++) step(ev, 1 / 60);
  const eb = ev.chickens.find((c) => c.boss);
  assert(eb.ev === 'halloween', 'boss carries the event costume flag');
  eb.hp = 1; ev.bullets.push({ x: eb.x, y: eb.y, vx: 0, vy: 0, o: 'a', w: 'b', d: 1 }); step(ev, 1 / 60);
  assert(ev.gifts.filter((g) => g.k === 'key').length === 5, 'an event boss drops 2 bonus keys');
}

// ---------------------------------------------------------------- daily + replays
{
  const d1 = dailyInfo(new Date('2026-11-12T10:00:00Z')), d2 = dailyInfo(new Date('2026-11-12T23:59:00Z')), d3 = dailyInfo(new Date('2026-11-13T00:01:00Z'));
  assert(JSON.stringify(d1) === JSON.stringify(d2) && d1.seed !== d3.seed, 'the daily challenge is the same all UTC day and changes at midnight');
  assert(d1.mut.length >= 1 && d1.mut.length <= 2 && d1.mut.every((m) => MUT_IDS.includes(m)), 'daily mutators are valid');

  const script = (tick) => ({ left: tick % 120 < 60 ? 1 : 0, right: tick % 120 >= 60 ? 1 : 0, up: 0, down: 0, fire: 1, ab: tick % 400 === 399 ? 1 : 0, tx: tick > 500 && tick < 700 ? 200 + (tick % 50) * 6 : null, ty: tick > 500 && tick < 700 ? 480 : null });
  const rep = newReplay({ seed: d1.seed, mut: d1.mut, rush: false, daily: true, event: null, startWave: 0, name: 'Rec', loadout: { gun: 'arc', skin: 'plain' } });
  const live = createState(d1.seed, { mut: d1.mut, daily: true });
  addPlayer(live, 'me', 'Rec', { gun: 'arc' });
  for (let tick = 0; tick < 2400 && !live.over; tick++) {
    const inp = script(tick);
    live.players.me.lives = Math.max(live.players.me.lives, 2); // keep the run alive for the whole script
    recordInput(rep, tick, inp); setInput(live, 'me', { ...inp }); step(live, 1 / 60);
    rep.ticks = tick + 1;
  }
  // the lives top-up above is part of the live run only; replay must apply it too, so compare via a lives-neutral run
  const live2 = createState(d1.seed, { mut: d1.mut, daily: true }); addPlayer(live2, 'me', 'Rec', { gun: 'arc' });
  const rep2 = newReplay({ seed: d1.seed, mut: d1.mut, rush: false, daily: true, event: null, startWave: 0, name: 'Rec', loadout: { gun: 'arc' } });
  let t2 = 0;
  for (; t2 < 2400 && !live2.over; t2++) { const inp = script(t2); recordInput(rep2, t2, inp); setInput(live2, 'me', { ...inp }); step(live2, 1 / 60); }
  rep2.ticks = t2; rep2.score = live2.players.me.score; rep2.wave = live2.wave;
  const again = runReplay(sanitizeReplay(JSON.parse(JSON.stringify(rep2)))).state;
  assert(JSON.stringify(again) === JSON.stringify(live2), 'a replay reproduces the run exactly (same seed + same inputs)');
  assert(rep2.inputs.length < t2, 'only input changes are stored');
  let threw = false; try { sanitizeReplay({ ...rep2, ver: SIM_VERSION - 1 }); } catch { threw = true; }
  assert(threw, 'replays from another simulation version are refused');
}

// ---------------------------------------------------------------- progression + leaderboard modes
{
  assert(levelOf(0).level === 1 && levelOf(119).level === 1 && levelOf(120).level === 2 && levelOf(480).level === 3, 'level thresholds');
  const p = { ...defaultProfile() };
  const date = new Date('2026-11-12T12:00:00Z');
  const r = applyRun(p, { mode: 'solo', score: 4200, wave: 9, kills: 80, keys: 3, bosses: 1, flawless: 1, novas: 2, revives: 0, mends: 0, mut: 0 }, date);
  assert(['first_run', 'wave5', 'boss1'].every((id) => r.unlocked.includes(id)) && !r.unlocked.includes('wave10'), 'achievements unlock from a run');
  assert(p.xp > 0 && p.life.kills === 80 && p.life.runs === 1 && p.achNew.length === 3, 'XP, lifetime totals and "new" markers');
  const again = applyRun(p, { mode: 'solo', score: 100, wave: 1, kills: 1, keys: 0, bosses: 0, flawless: 0, novas: 0, revives: 0, mends: 0, mut: 0 }, date);
  assert(again.unlocked.length === 0, 'achievements unlock once');

  // daily reward: once per UTC day, streak across days
  const dp = { ...defaultProfile() }; const info = dailyInfo(date);
  const run = { mode: 'daily', score: 900, wave: 4, kills: 20, keys: 0, bosses: 0, flawless: 0, novas: 0, revives: 0, mends: 0, mut: info.mut.length, daily: info };
  const a1 = applyRun(dp, run, date);
  assert(a1.dailyDone && a1.dailyReward === info.reward && dp.pending >= info.reward && dp.life.streak === 1, 'first daily of the day pays out');
  assert(!applyRun(dp, run, date).dailyDone, 'the daily pays once per day');
  const next = new Date(date.getTime() + 86400000);
  applyRun(dp, { ...run, daily: dailyInfo(next) }, next);
  assert(dp.life.streak === 2 && dp.life.dailies === 2, 'consecutive days extend the streak');

  // weekly goals + season
  const wp = { ...defaultProfile() };
  const goals = weeklyGoals('2026-W46');
  assert(goals.length === 3 && new Set(goals.map((g) => g.id)).size === 3 && JSON.stringify(goals) === JSON.stringify(weeklyGoals('2026-W46')), 'three distinct weekly goals, the same for everyone');
  const big = { mode: 'solo', score: 50000, wave: 30, kills: 900, keys: 40, bosses: 9, flawless: 20, novas: 40, revives: 0, mends: 0, mut: 2, daily: null };
  const res = applyRun(wp, big, new Date('2026-11-12T12:00:00Z'));
  assert(res.goalsDone.length >= 1 && wp.season.stars >= res.goalsDone.length, 'finishing weekly goals earns season stars');
  const done = wp.weekly.done[0];
  const before = wp.keys;
  assert(claimWeekly(wp, done).ok && wp.keys > before && !claimWeekly(wp, done).ok, 'a finished goal can be claimed once');
  const notDone = weeklyGoals(wp.weekly.id).find((g) => !wp.weekly.done.includes(g.id));
  if (notDone) assert(!claimWeekly(wp, notDone.id).ok, 'an unfinished goal cannot be claimed');
  wp.season.stars = 6;
  assert(claimSeason(wp, 0).ok && claimSeason(wp, 1).ok && !claimSeason(wp, 0).ok && !claimSeason(wp, 2).ok && SEASON_TIERS.length === 4, 'season tiers unlock by stars and claim once');
  assert(setTitle(wp, 'Veteran').ok === !!wp.ach.wave20 && !setTitle(wp, 'Not A Title').ok && setTitle(wp, '').ok, 'titles require the matching achievement');
  assert(ACHIEVEMENTS.length >= 18, 'a healthy list of achievements');
  const dirty = sanitizeProgress({ xp: -5, title: 'Hacker', ach: { first_run: 1, bogus: 2 }, weekly: { id: 'x', prog: { __proto__: 1, kills: 99999999999 } }, life: { runs: 'many' } });
  assert(dirty.xp === 0 && dirty.title === '' && !('bogus' in dirty.ach) && dirty.weekly.id === '' && dirty.life.runs === 0, 'progress is sanitised');

  // leaderboard: daily + rush modes and the today board
  const rec = emptyRec(); recordRun(rec, { score: 900, wave: 4 }, date);
  const mk = (name, daily) => ({ name, xp: 130, title: 'Ace', rec: { solo: emptyRec(), online: emptyRec(), daily, rush: emptyRec() } });
  const old = emptyRec(); recordRun(old, { score: 5000, wave: 9 }, new Date('2026-01-05T12:00:00Z'));
  const profiles = new Map([['aaaaaaaaaaaaaaaaaaaaaaaa', mk('Dee', rec)], ['bbbbbbbbbbbbbbbbbbbbbbbb', mk('Old', old)]]);
  const today = buildBoard(profiles, 'daily', 'today', null, date);
  assert(today.entries.map((e) => e.name).join() === 'Dee' && today.entries[0].level === 2 && today.entries[0].title === 'Ace', 'the daily "today" board only shows today and carries level/title');
  assert(buildBoard(profiles, 'daily', 'rating', null, date).entries.length === 2 && buildBoard(profiles, 'rush', 'rating', null, date).entries.length === 0, 'daily and rush are separate boards');
}

// ---------------------------------------------------------------- server: HTTP
const PORT = process.env.PORT || 3000;
const base = 'http://localhost:' + PORT;
const call = async (path, body) => {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const newPid = async () => (await call('/api/profile', {})).body.id;

{
  const daily = (await call('/api/daily')).body;
  assert(JSON.stringify(daily) === JSON.stringify(dailyInfo(new Date())) && daily.id === dayId(new Date()), 'the server publishes the same daily challenge as the shared code');

  const pid = await newPid();
  const st = await call('/api/run/start', { id: pid, kind: 'solo', mut: ['fast', 'bogus', 'fast'] });
  assert(st.body.kind === 'solo' && st.body.mut.join() === 'fast' && st.body.seed === null, 'solo run: mutators validated, no fixed seed');
  const sd = await call('/api/run/start', { id: pid, kind: 'daily', mut: ['glass'] });
  assert(sd.body.kind === 'daily' && sd.body.seed === daily.seed && sd.body.mut.join() === daily.mut.join(), 'daily run: seed and rules come from the server, not the client');
  const sr = await call('/api/run/start', { id: pid, kind: 'rush' });
  assert(sr.body.kind === 'rush', 'boss rush run');
  assert((await call('/api/run/start', { id: pid, kind: 'nope' })).body.kind === 'solo', 'unknown kinds fall back to solo');

  // the daily pays out once the run is long enough to be plausible (wave 3 needs ~4s)
  await sleep(4300);
  const end = await call('/api/run/end', { id: pid, runId: sd.body.runId, keys: 0, wave: 3, score: 700, kills: 12, name: 'Dailyer', stats: { bosses: 0, flawless: 1 } });
  assert(end.status === 200 && end.body.result.dailyDone && end.body.profile.life.streak === 1, 'a finished daily pays its reward and starts a streak');
  assert(end.body.profile.rec.daily.runs === 1 && end.body.profile.achNew.includes('daily1'), 'daily run recorded with its achievement');
  const lb = await call('/api/leaderboard', { id: pid, mode: 'daily', board: 'today' });
  assert(lb.body.entries.some((e) => e.you && e.score > 0) && !JSON.stringify(lb.body).includes(pid), 'the daily board lists the run without exposing the profile code');
  const r2 = await call('/api/run/end', { id: pid, runId: sr.body.runId, keys: 0, wave: 99, score: 999999, kills: 99999, stats: { bosses: 99 } });
  assert(r2.body.wave <= 1 && r2.body.score <= 3000, 'rush wave cap is stricter (a boss takes much longer than a wave); got wave ' + r2.body.wave + ', score ' + r2.body.score);
  assert(r2.body.profile.life.bosses <= 2, 'reported stats are capped by time');

  // progression endpoints
  assert((await call('/api/weekly/claim', { id: pid, goal: 'kills' })).status === 400, 'cannot claim an unfinished weekly goal');
  assert((await call('/api/season/claim', { id: pid, tier: 0 })).status === 400, 'cannot claim a season tier without stars');
  assert((await call('/api/title', { id: pid, title: 'Ace' })).status === 400, 'cannot take an unearned title');
  const seen = await call('/api/ach/seen', { id: pid });
  assert(seen.body.profile.achNew.length === 0, 'new-achievement markers can be acknowledged');
}

// ---------------------------------------------------------------- server: rooms
const open = (url = 'ws://localhost:' + PORT + '/ws') => new Promise((res, rej) => { const w = new WebSocket(url); w.msgs = []; w.on('message', (d) => w.msgs.push(JSON.parse(d))); w.on('open', () => res(w)); w.on('error', rej); });
const waitFor = async (w, pred, ms = 3000) => { const t0 = Date.now(); for (;;) { const m = w.msgs.find(pred); if (m) return m; if (Date.now() - t0 > ms) throw new Error('timeout waiting for message'); await sleep(25); } };
const sockets = [];
const join = async (msg) => { const w = await open(); sockets.push(w); w.send(JSON.stringify(msg)); return w; };

{
  const pidA = await newPid();
  // public room with settings
  const A = await join({ t: 'join', name: 'HostA', pid: pidA, role: 'medic', create: true, settings: { name: 'Test lobby', public: true, mut: ['rapid', 'bogus'], max: 3 } });
  const rA = await waitFor(A, (m) => m.t === 'room');
  assert(rA.settings.public && rA.settings.name === 'Test lobby' && rA.settings.mut.join() === 'rapid' && rA.settings.max === 3 && rA.players[0].role === 'medic', 'room settings and role are applied');
  const list = (await call('/api/rooms')).body.rooms;
  assert(list.some((r) => r.code === rA.code && r.name === 'Test lobby' && r.players === 1 && r.mut.join() === 'rapid'), 'public rooms are listed');
  const priv = await join({ t: 'join', name: 'Priv', create: true, settings: { public: false, password: 'pw', name: 'Secret' } });
  const rP = await waitFor(priv, (m) => m.t === 'room');
  assert(!(await call('/api/rooms')).body.rooms.some((r) => r.code === rP.code), 'private rooms are not listed');
  assert(rP.settings.locked === true && !('password' in rP.settings), 'the password never leaves the server');
  const bad = await join({ t: 'join', name: 'Guest', room: rP.code, password: 'nope' });
  assert((await waitFor(bad, (m) => m.t === 'error')).msg === 'Wrong password', 'wrong password is refused');
  const good = await join({ t: 'join', name: 'Guest2', room: rP.code, password: 'pw' });
  assert((await waitFor(good, (m) => m.t === 'room')).players.length === 2, 'right password joins');

  // quick play prefers the fullest open lobby
  const Q = await join({ t: 'quick', name: 'Quick', role: 'tank' });
  const rQ = await waitFor(Q, (m) => m.t === 'room');
  assert(rQ.code === rA.code && rQ.players.length === 2, 'quick play joins an open public room');
  const full = await join({ t: 'join', name: 'C', room: rA.code });
  await waitFor(full, (m) => m.t === 'room');
  const over = await join({ t: 'join', name: 'D', room: rA.code });
  assert((await waitFor(over, (m) => m.t === 'error')).msg === 'Room is full', 'the room size setting is enforced');
  full.send(JSON.stringify({ t: 'leave' })); await sleep(100);

  // host edits settings in the lobby; others cannot
  Q.send(JSON.stringify({ t: 'settings', settings: { name: 'Hacked', public: true, mut: [], max: 4 } })); await sleep(120);
  A.send(JSON.stringify({ t: 'settings', settings: { name: 'Renamed', public: true, mut: ['glass'], max: 4 } }));
  const upd = await waitFor(A, (m) => m.t === 'room' && m.settings.name === 'Renamed');
  assert(upd.settings.mut.join() === 'glass', 'only the host can change room settings');

  // game starts with the room's mutators; spectators can watch
  A.send(JSON.stringify({ t: 'start' }));
  const stA = await waitFor(A, (m) => m.t === 'state');
  assert(stA.s.mut.join() === 'glass' && Object.values(stA.s.players).every((p) => p.lives === 1), 'room mutators apply to the game');
  assert(Object.values(stA.s.players).some((p) => p.role === 'medic') && Object.values(stA.s.players).some((p) => p.role === 'tank'), 'roles carry into the game');
  const S = await join({ t: 'join', name: 'Watcher', room: rA.code, spectate: true });
  const rS = await waitFor(S, (m) => m.t === 'room');
  assert(rS.spectator === true && rS.players.length === 2, 'spectators do not take a seat');
  const stS = await waitFor(S, (m) => m.t === 'state' && m.s.t > 0.2);
  assert(Object.keys(stS.s.players).length === 2, 'spectators receive live snapshots');
  S.send(JSON.stringify({ t: 'input', input: { fire: 1, left: 1 } })); await sleep(150);
  const latest = A.msgs.filter((m) => m.t === 'state').slice(-1)[0].s;
  assert(!Object.values(latest.players).some((p) => p.name === 'Watcher'), 'spectator input is ignored');

  // reconnect: a dropped pilot keeps their seat
  const tokenQ = rQ.token;
  Q.terminate(); // a dead connection, not a polite leave
  const away = await waitFor(A, (m) => m.t === 'room' && m.players.some((p) => p.away));
  assert(away.players.length === 2, 'a dropped pilot keeps their seat');
  const Q2 = await open(); sockets.push(Q2);
  Q2.send(JSON.stringify({ t: 'rejoin', room: rA.code, token: tokenQ }));
  const back = await waitFor(Q2, (m) => m.t === 'room');
  assert(back.you === rQ.you && !back.players.some((p) => p.away), 'rejoining restores the same seat');
  await waitFor(Q2, (m) => m.t === 'state');
  const wrong = await open(); sockets.push(wrong);
  wrong.send(JSON.stringify({ t: 'rejoin', room: rA.code, token: 'deadbeefdeadbeef' }));
  assert((await waitFor(wrong, (m) => m.t === 'error')).fatal === true, 'a wrong rejoin token is refused');
  // an explicit leave frees the seat immediately
  Q2.send(JSON.stringify({ t: 'leave' })); await sleep(150);
  const afterLeave = A.msgs.filter((m) => m.t === 'room').slice(-1)[0];
  assert(afterLeave.players.length === 1, 'leaving on purpose frees the seat at once');
}

// ---------------------------------------------------------------- server: community gallery
{
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const owner = await newPid(), others = [await newPid(), await newPid(), await newPid()];
  const pub = (id, pack, desc) => call('/api/packs/publish', { id, pack, desc });
  const good = await pub(owner, { name: '<i>Robo</i> pack', images: { chicken: png, egg: png } }, 'A <b>test</b>');
  assert(good.status === 200 && /^[a-f0-9]{10}$/.test(good.body.id), 'a valid pack can be shared');
  const listed = (await call('/api/packs?sort=new')).body.packs.find((p) => p.id === good.body.id);
  assert(listed && !listed.name.includes('<') && !listed.desc.includes('<') && listed.thumb === png, 'listing shows cleaned text and a thumbnail');
  assert((await pub(owner, { name: 'Evil', images: { chicken: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' } })).status === 400, 'unsafe packs are rejected by the server too');
  assert((await pub(owner, { name: 'Empty' })).status === 400, 'a pack must contain something');
  assert((await pub('f'.repeat(24), { name: 'x', images: { chicken: png } })).status === 404, 'unknown profiles cannot publish');
  const got = await call('/api/packs/' + good.body.id);
  assert(got.status === 200 && got.body.pack.images.chicken.src === png && got.body.meta.downloads >= 1, 'a pack can be downloaded (and the count goes up)');
  assert((await call('/api/packs?sort=popular')).body.packs[0].downloads >= 1, 'popular sort works');
  assert((await call('/api/packs/remove', { id: others[0], packId: good.body.id })).status === 404, 'only the owner can remove a pack');
  for (const o of others) await call('/api/packs/report', { id: o, packId: good.body.id });
  assert((await call('/api/packs/' + good.body.id)).status === 404 && !(await call('/api/packs')).body.packs.some((p) => p.id === good.body.id), 'three reports hide a pack');
  const owned = [];
  for (let i = 0; i < 4; i++) owned.push((await pub(owner, { name: 'P' + i, sounds: { shoot: 'data:audio/mpeg;base64,AAAA' } })).body.id);
  assert((await pub(owner, { name: 'Sixth', images: { chicken: png } })).status === 400, 'each pilot can share only five packs');
  for (const id of [good.body.id, ...owned]) await call('/api/packs/remove', { id: owner, packId: id });
  assert((await pub(owner, { name: 'After cleanup', images: { chicken: png } })).status === 200, 'removing frees a slot');
  const mine = (await call('/api/packs')).body.packs.filter((p) => p.name === 'After cleanup');
  for (const p of mine) await call('/api/packs/remove', { id: owner, packId: p.id });
}

// ---------------------------------------------------------------- PWA files are served correctly
{
  const man = await fetch(base + '/manifest.webmanifest').then((r) => r.json());
  assert(man.name && man.start_url === '/' && man.display_override.includes('fullscreen') && man.icons.some((i) => i.purpose === 'maskable'), 'web manifest is valid and installable');
  for (const ic of man.icons) {
    const r = await fetch(base + ic.src);
    const buf = Buffer.from(await r.arrayBuffer());
    assert(r.ok && r.headers.get('content-type') === 'image/png' && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), ic.src + ' is a real PNG');
    assert(buf.readUInt32BE(16) === parseInt(ic.sizes, 10), ic.src + ' has the declared size');
  }
  const sw = await fetch(base + '/sw.js');
  const swText = await sw.text();
  assert(sw.ok && swText.includes("startsWith('/api/')") && swText.includes('/ws'), 'the service worker never intercepts the API or the WebSocket');
  const html = await fetch(base + '/').then((r) => r.text());
  assert(html.includes('rel="manifest"') && html.includes('theme-color') && html.includes('apple-touch-icon'), 'index.html links the manifest and icons');
}

for (const s of sockets) { try { s.terminate(); } catch { /* ignore */ } }
console.log('features ok: mutators, roles, bosses, rush, daily, replay, progression, rooms, gallery');
process.exit(0);
