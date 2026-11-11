// @ts-nocheck
// Tests for the second feature batch: mutators, roles and abilities, boss kinds, boss rush, daily seed,
// replays, progression, overheating and the ice cube.
// Pure simulation/logic tests, no server needed.
import {
  createState, addPlayer, step, setInput, emptyInput, W, H, BOSS_KINDS, SIM_VERSION, MUT_IDS,
} from '../shared/sim';
import { dailyInfo } from '../shared/daily';
import { dayId } from '../shared/timeutil';
import {
  levelOf, applyRun, weeklyGoals, claimWeekly, claimSeason, setTitle, defaultProgress, sanitizeProgress, ACHIEVEMENTS, SEASON_TIERS,
} from '../shared/progress';
import { defaultProfile } from '../shared/catalog';
import { emptyRec, recordRun, buildBoard } from '../shared/leaderboard';
import { newReplay, recordInput, runReplay, sanitizeReplay } from '../shared/replay';

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

  const eggs = (mut) => { const s = createState(4, { mut }); addPlayer(s, 'a', 'A'); s.wave = 12; s.cleared = true; s.delay = 0; for (let i = 0; i < 900; i++) { s.players.a.lives = 1e6; step(s, 1 / 60); } return s.nid; };
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
  assert(nova.players.a.charge === 0, 'charge resets and nothing but a Nova item recharges Nova');
  { // Nova items: only bosses drop them, they weave, and one fills half the bar
    const ni = createState(5); addPlayer(ni, 'a', 'A'); ni.delay = 99; ni.players.a.x = 400; ni.players.a.y = 500;
    for (let i = 0; i < 600; i++) step(ni, 1 / 60);
    assert(ni.players.a.charge === 0, 'Nova no longer charges by itself over time');
    ni.gifts.push({ id: 700, x: 400, y: 400, k: 'nova', bx: 400 }); step(ni, 1 / 60);
    ni.players.a.x = ni.gifts[0].x; ni.players.a.y = ni.gifts[0].y; step(ni, 1 / 60);
    assert(ni.players.a.charge === 50 && ni.gifts.length === 0, 'a Nova item fills 50% of the bar');
    ni.players.a.charge = 0; ni.gifts = [{ id: 701, x: ni.players.a.x, y: ni.players.a.y, k: 'nova', bx: ni.players.a.x - 140 }];
    const xs = []; for (let i = 0; i < 30; i++) { step(ni, 1 / 60); if (ni.gifts[0]) xs.push(ni.gifts[0].x); }
    assert(Math.max(...xs) - Math.min(...xs) > 20, 'a Nova item weaves sideways');
    ni.players.a.y = 40; step(ni, 1 / 60); ni.players.a.input = { ...emptyInput(), up: 1 };
    for (let i = 0; i < 120; i++) step(ni, 1 / 60);
    assert(ni.players.a.y < 100, 'the ship can fly to the top of the screen');
  }
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
  for (const [w, k] of [[5, 'rooster'], [10, 'mother'], [15, 'sweeper'], [20, 'splitter'], [25, 'mirror'], [30, 'colonel'], [35, 'bomber'], [40, 'timewarp'], [45, 'magnet'], [50, 'ghost'], [55, 'lava'], [60, 'diva'], [65, 'cloner'], [70, 'tank'], [75, 'iceq'], [80, 'rooster']])
    assert(spawned(w).chickens.find((c) => c.boss).kind === k, `wave ${w} boss is ${k}`);
  assert(BOSS_KINDS.length === 15, 'fifteen boss kinds');

  // no boss may teleport (the swing/slide must be continuous across phase changes)
  for (const wave of [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75]) {
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

  // newer bosses
  const col = spawned(30); for (let i = 0; i < 300; i++) { col.players.a.lives = 99; step(col, 1 / 60); }
  const cb = col.chickens.find((c) => c.boss);
  assert(col.chickens.some((c) => c.ld) && cb.sh === 1, 'the colonel is shielded while his squad leader lives');
  col.chickens = col.chickens.filter((c) => !c.ld); step(col, 1 / 60);
  assert(cb.sh === 0, 'killing the squad leader drops the colonel shield');

  const bo = spawned(35); bo.players.a.lives = 99;
  bo.zones.push({ id: 900, t: 0, k: 'bomb', x: bo.players.a.x, y: bo.players.a.y, sx: 400, sy: 150, cx: 400, cy: 150, fall: 0.5, r: 78, hp: 2 });
  bo.players.a.lives = 3; bo.players.a.inv = 0; for (let i = 0; i < 40; i++) step(bo, 1 / 60);
  assert(bo.players.a.lives === 2 && !bo.zones.some((z) => z.id === 900), 'a giant egg that lands on a pilot hurts and explodes');
  const bd = spawned(35); bd.zones.push({ id: 901, t: 0, k: 'bomb', x: 200, y: 250, sx: 200, sy: 250, cx: 200, cy: 250, fall: 5, r: 78, hp: 2 });
  bd.bullets.push({ x: 200, y: 250, vx: 0, vy: 0, o: 'a', w: 'b', d: 2 }); step(bd, 1 / 60);
  assert(!bd.zones.some((z) => z.id === 901), 'shooting a falling giant egg defuses it');

  const iq = spawned(75); iq.players.a.inv = 0; iq.players.a.lives = 3; iq.delay = 99;
  iq.eggs.push({ id: 950, x: iq.players.a.x, y: iq.players.a.y, vx: 0, vy: 0, fz: 1 }); step(iq, 1 / 60);
  assert(iq.players.a.frz > 1 && iq.players.a.lives === 3, 'an ice shard freezes a pilot without costing a life');
  const fx = iq.players.a.x; iq.players.a.input = { ...emptyInput(), right: 1 }; step(iq, 1 / 60);
  assert(iq.players.a.x === fx, 'a frozen pilot cannot move');

  const cl = spawned(65); for (let i = 0; i < 200; i++) { cl.players.a.lives = 99; step(cl, 1 / 60); }
  assert(cl.chickens.filter((c) => c.dec).length === 3, 'the cloner makes three decoys');

  const tk = spawned(70); for (let i = 0; i < 120; i++) { tk.players.a.lives = 99; step(tk, 1 / 60); }
  const tb = tk.chickens.find((c) => c.boss), hp0 = tb.hp;
  for (let i = 0; i < 8; i++) tk.bullets.push({ x: tb.x, y: tb.y, vx: 0, vy: 0, o: 'a', w: 'b', d: 1 });
  step(tk, 1 / 60);
  assert(tb.hp === hp0 && tb.arm === 2, 'the tank armor soaks bullets and a plate breaks after 8');

  const lv = spawned(55); lv.players.a.inv = 0; lv.players.a.lives = 3; lv.delay = 99;
  lv.zones.push({ id: 960, t: 0, k: 'lava', x: lv.players.a.x, y: lv.players.a.y, sx: 0, sy: 0, fall: 0.1, life: 5, r: 42 });
  for (let i = 0; i < 15; i++) step(lv, 1 / 60);
  assert(lv.players.a.lives === 2, 'standing in lava hurts');

  const tw = spawned(40); tw.delay = 99;
  tw.zones.push({ id: 970, t: 0, k: 'clock', x: tw.players.a.x, y: tw.players.a.y, r: 90, life: 4.5 }); step(tw, 1 / 60);
  assert(tw.players.a.slw > 0 && tw.players.a.slf === 0.5, 'a clock bubble slows the pilot');

  // taunts, dance-off, golden rooster, revive dance, weekly challenge, chicken of the day
  const tn = spawned(5); tn.players.a.lives = 99; for (let i = 0; i < 100; i++) step(tn, 1 / 60);
  const tb2 = tn.chickens.find((c) => c.boss);
  assert(typeof tb2.say === 'string' && tb2.say.length > 3, 'a boss taunts when the fight starts');
  tb2.hp = Math.floor(tb2.max * 0.5); step(tn, 1 / 60);
  assert(tb2.say && tb2.sayt > 2, 'a boss taunts again when it gets hurt');
  tb2.hp = Math.max(1, Math.floor(tb2.max * 0.09)); tb2.sh = 1; step(tn, 1 / 60);
  assert(tb2.dn > 0 && tb2.sh === 0, 'at 10% health the boss starts a dance break and loses its shield');
  const hpd = tb2.hp; tn.bullets.push({ x: tb2.x, y: tb2.y, vx: 0, vy: 0, o: 'a', w: 'b', d: 1 }); step(tn, 1 / 60);
  assert(hpd - tb2.hp === 2 || tb2.dead, 'a dancing boss takes double damage');
  if (!tb2.dead) { for (let i = 0; i < 200; i++) { tn.players.a.lives = 99; step(tn, 1 / 60); } assert(!(tb2.dn > 0), 'the dance break ends after a couple of seconds'); }

  let goldSeen = null;
  for (let seed = 1; seed < 300 && !goldSeen; seed++) {
    const g = createState(seed); addPlayer(g, 'a', 'A'); g.wave = 5; g.cleared = true; g.delay = 0; step(g, 1 / 60);
    goldSeen = g.chickens.find((c) => c.gold) ? g : null;
  }
  assert(goldSeen, 'a Golden Rooster shows up on some waves');
  const gr = goldSeen.chickens.find((c) => c.gold), gx0 = gr.x;
  goldSeen.players.a.lives = 99; for (let i = 0; i < 60; i++) step(goldSeen, 1 / 60);
  assert(Math.abs(gr.x - gx0) > 100, 'the Golden Rooster sprints across the screen');
  gr.hp = 1; goldSeen.bullets.push({ x: gr.x, y: gr.y, vx: 0, vy: 0, o: 'a', w: 'b', d: 1 }); step(goldSeen, 1 / 60);
  assert(goldSeen.gifts.filter((g) => g.k === 'key').length >= 4 && goldSeen.players.a.score >= 300, 'shooting the Golden Rooster pays 4 keys and a big score');

  const rvv = createState(4); addPlayer(rvv, 'm', 'M', { role: 'medic' }); addPlayer(rvv, 'd', 'D'); rvv.delay = 99;
  Object.assign(rvv.players.m, { x: 400, y: 500, charge: 100 }); Object.assign(rvv.players.d, { x: 380, y: 520, alive: false, lives: 0 });
  rvv.players.m.input = { ...emptyInput(), ab: 1 }; step(rvv, 1 / 60);
  assert(rvv.players.m.dn > 1, 'the rescuer does a revive dance');

  const wk = createState(3, { weekly: { boss: 'ghost', rule: 'glass' } }); addPlayer(wk, 'a', 'A'); wk.delay = 0; step(wk, 1 / 60);
  assert(wk.chickens.length === 1 && wk.chickens[0].kind === 'ghost' && wk.banner.startsWith('Weekly challenge'), 'the weekly challenge starts with its boss');
  assert(wk.players.a.lives === 1, 'the glass-cannon weekly rule gives one life');
  const wb = wk.chickens[0];
  for (let i = 0; i < 120; i++) { wk.players.a.inv = 5; step(wk, 1 / 60); }
  wb.sh = 0; wb.hid = 0; wb.dn = 0; wb.hp = 5; wk.bullets.push({ x: wb.x, y: wb.y, vx: 0, vy: 0, o: 'a', w: 'b', d: 1 }); step(wk, 1 / 60);
  assert(wb.dead || wb.hp <= 3, 'glass cannon: the boss takes double damage');
  wk.chickens = []; wk.cleared = false; step(wk, 1 / 60);
  assert(wk.over && wk.won && wk.banner === 'Challenge complete!', 'beating the weekly boss ends the run as a win');
  const bad = createState(3, { weekly: { boss: 'nope', rule: 'x' }, cotd: 99 });
  assert(bad.weekly === null && bad.cotd === null, 'invalid weekly/cotd options are ignored');

  const ct = createState(9, { cotd: 3 }); addPlayer(ct, 'a', 'A'); ct.delay = 99;
  const hit = (id) => { ct.chickens = [{ id, x: 400, y: 300, ox: 0, oy: 220, hp: 1, max: 1, tier: 0, r: 22, fl: 0, dv: 0, ent: 1 }]; const s0 = ct.players.a.score; ct.bullets.push({ x: 400, y: 300, vx: 0, vy: 0, o: 'a', w: 'b', d: 1 }); step(ct, 1 / 60); return ct.players.a.score - s0; };
  const bonus = hit(13), plain = hit(14);
  assert(bonus - plain === 50, 'killing a chicken of the day costume pays +50');

  // boss rush
  const rush =createState(1, { rush: true }); addPlayer(rush, 'a', 'A'); rush.delay = 0; step(rush, 1 / 60);
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
  assert(ev.gifts.filter((g) => g.k === 'nova').length === 1, 'a boss drops one Nova item');
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

// ---------------------------------------------------------------- overheating + ice cube
{
  const s = createState(7, { mut: ['drought'] });
  addPlayer(s, 'a', 'A');
  const p = s.players.a;
  setInput(s, 'a', { ...emptyInput(), fire: 1 });
  let at = null;
  for (let i = 0; i < 600 && at === null; i++) { p.inv = 9; step(s, 1 / 60); if (p.oh) at = i / 60; }
  assert(at !== null && at > 2 && at < 6, 'holding fire overheats the guns after a few seconds (got ' + at + ')');
  const shots = p.shots;
  for (let i = 0; i < 30; i++) { p.inv = 9; step(s, 1 / 60); }
  assert(p.shots === shots && p.oh, 'an overheated gun does not fire');
  for (let i = 0; i < 600 && p.oh; i++) { p.inv = 9; setInput(s, 'a', { ...emptyInput() }); step(s, 1 / 60); }
  assert(!p.oh && p.heat <= 0.36, 'the guns recover after cooling down');
  // ice cube: resets the heat at once and keeps the guns cool for a while
  p.oh = true; p.heat = 1;
  s.gifts.push({ id: 9999, x: p.x, y: p.y, k: 'ice' });
  setInput(s, 'a', { ...emptyInput(), fire: 1 });
  p.inv = 9; step(s, 1 / 60);
  assert(!p.oh && p.heat < 0.05 && p.ice > 4, 'an ice cube resets the cooldown');
  for (let i = 0; i < 180; i++) { p.inv = 9; step(s, 1 / 60); }
  assert(!p.oh && p.heat === 0, 'no heat builds up while the ice effect lasts');
}

// ---------------------------------------------------------------- egg budget, meteor strikes, borrowed guns
{
  // late waves no longer rain eggs
  const s = createState(11); addPlayer(s, 'a', 'A');
  s.wave = 13; // the next wave (14) is a normal grid wave
  const p = s.players.a;
  let maxEggs = 0, made = 0, seen = new Set();
  for (let i = 0; i < 60 * 25; i++) { p.inv = 99; p.alive = true; step(s, 1 / 60); maxEggs = Math.max(maxEggs, s.eggs.length); for (const e of s.eggs) if (!seen.has(e.id)) { seen.add(e.id); made++; } }
  assert(s.wave >= 14 && maxEggs <= 26, 'eggs in flight are capped (max ' + maxEggs + ')');
  assert(made / 25 < 5, 'late waves lay a few eggs per second, not a rain (' + (made / 25).toFixed(1) + '/s)');
}
{
  // meteor strike wave: warned rocks instead of eggs
  const s = createState(5); addPlayer(s, 'a', 'A');
  s.wave = 7; const p = s.players.a;
  let rocks = 0, eggs = 0, warned = false, sawBanner = false;
  const ids = new Set();
  for (let i = 0; i < 60 * 14; i++) {
    p.inv = 99; p.alive = true; step(s, 1 / 60);
    if (s.banner.includes('Meteor')) sawBanner = true;
    eggs += s.eggs.length;
    for (const m of s.meteors) { if (m.warn > 0) warned = true; ids.add(m.id); }
  }
  assert(s.wave === 8 && s.meteorWave && sawBanner, 'wave 8 is a meteor strike');
  assert(eggs === 0 && ids.size >= 5 && warned, 'a meteor wave lays no eggs; rocks come with a warning first (' + ids.size + ' rocks)');
  // a falling rock hurts; a warning marker does not; bullets destroy rocks
  const h = createState(6); addPlayer(h, 'a', 'A'); const hp = h.players.a; hp.inv = 0;
  h.meteors.push({ id: 900, x: hp.x, y: hp.y, vx: 0, vy: 300, sp: 300, warn: 0, r: 26, hp: 2, tx: hp.x });
  const lives = hp.lives; step(h, 1 / 60);
  assert(hp.lives === lives - 1, 'a meteor hit costs a life');
  const w = createState(6); addPlayer(w, 'a', 'A'); const wp = w.players.a; wp.inv = 0;
  w.meteors.push({ id: 901, x: wp.x, y: wp.y, vx: 0, vy: 0, sp: 0, warn: 0.5, r: 26, hp: 2, tx: wp.x });
  step(w, 1 / 60);
  assert(wp.lives === lives, 'a warning marker is harmless');
  const sh = createState(6); addPlayer(sh, 'a', 'A'); const sp = sh.players.a; sp.inv = 99; sp.x = 100; sp.y = 560;
  sh.meteors.push({ id: 902, x: 400, y: 300, vx: 0, vy: 0, sp: 0, warn: 0, r: 26, hp: 2, tx: 400 });
  for (let i = 0; i < 3; i++) sh.bullets.push({ x: 400, y: 300, vx: 0, vy: -1, o: 'a', w: 'b', d: 1 });
  step(sh, 1 / 60);
  assert(sh.meteors.length === 0, 'shooting a meteor twice destroys it');
}
{
  // a weapon capsule only borrows the gun when you own a shop gun
  const a = createState(3); addPlayer(a, 'a', 'A', { gun: 'scatter' }); const pa = a.players.a;
  assert(pa.weapon === 'scatter' && pa.base === 'scatter', 'the shop gun is the starting weapon');
  a.gifts.push({ id: 1, x: pa.x, y: pa.y, k: 'wpn', w: 'missile' }); pa.inv = 99; step(a, 1 / 60);
  assert(pa.weapon === 'missile' && pa.wt > 29, 'a capsule lends its weapon for 30 seconds');
  for (let i = 0; i < 60 * 31; i++) { pa.inv = 99; pa.alive = true; step(a, 1 / 60); }
  assert(pa.weapon === 'scatter', 'the shop gun comes back afterwards');
  const b = createState(3); addPlayer(b, 'a', 'A'); const pb = b.players.a;
  b.gifts.push({ id: 1, x: pb.x, y: pb.y, k: 'wpn', w: 'missile' }); pb.inv = 99; step(b, 1 / 60);
  for (let i = 0; i < 60 * 35; i++) { pb.inv = 99; pb.alive = true; step(b, 1 / 60); }
  assert(pb.weapon === 'missile', 'without a shop gun the capsule weapon stays, as before');
}

console.log('features ok: mutators, roles, bosses, rush, daily, replay, progression, overheat');
process.exit(0);