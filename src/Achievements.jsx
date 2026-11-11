import { useEffect, useRef, useState } from 'react';
import { ACHIEVEMENTS, levelOf, weeklyGoals, SEASON_TIERS } from '../shared/progress.js';
import { weekId, monthId } from '../shared/timeutil.js';
import * as store from './profile.js';

export default function Achievements({ profile, setProfile, onBack }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const fresh = useRef(new Set(profile.achNew || [])); // highlighted this visit
  const offline = !!profile.offline;

  useEffect(() => { // viewing them counts as seeing them
    if (profile.achNew && profile.achNew.length && !offline) store.achSeen().then(setProfile).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn, ok) => {
    if (busy) return;
    setBusy(true); setMsg('');
    try { setProfile(await fn()); if (ok) setMsg(ok); } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const lv = levelOf(profile.xp);
  const now = new Date();
  const wk = weekId(now), mo = monthId(now);
  const week = profile.weekly.id === wk ? profile.weekly : { prog: {}, done: [], claimed: [] };
  const season = profile.season.id === mo ? profile.season : { stars: 0, claimed: [] };
  const goals = weeklyGoals(wk);
  const titles = ACHIEVEMENTS.filter((a) => a.title && profile.ach[a.id]);
  const unlocked = ACHIEVEMENTS.filter((a) => profile.ach[a.id]).length;

  return (
    <div className="shop ach">
      <div className="shop-top">
        <button className="ghost small" onClick={onBack}>← Back</button>
        <h2>Achievements &amp; goals</h2>
        <span className="keychip">🔑 {profile.keys}</span>
      </div>
      {msg && <p className={/^(Claimed|Title)/.test(msg) ? 'toast' : 'err'}>{msg}</p>}

      <div className="levelcard">
        <div className="lvbadge">{lv.level}</div>
        <div className="lvinfo">
          <b>Pilot level {lv.level}{profile.title ? ' · ' + profile.title : ''}</b>
          <div className="xpbar"><i style={{ width: (lv.into / lv.need) * 100 + '%' }} /></div>
          <span className="sub tiny">{lv.into} / {lv.need} XP to level {lv.level + 1} · {profile.life.runs} runs · {profile.life.kills.toLocaleString()} chickens · streak {profile.life.streak} day{profile.life.streak === 1 ? '' : 's'}</span>
        </div>
        {titles.length > 0 && (
          <label className="tiny">Title
            <select value={profile.title} disabled={busy || offline} onChange={(e) => act(() => store.setTitle(e.target.value), 'Title updated')}>
              <option value="">(none)</option>
              {titles.map((a) => <option key={a.id} value={a.title}>{a.title}</option>)}
            </select>
          </label>
        )}
      </div>

      <h3>Weekly goals <span className="sub tiny">week {wk}</span></h3>
      <div className="goals">
        {goals.map((g) => {
          const v = Math.min(g.target, week.prog[g.id] || 0), done = week.done.includes(g.id), claimed = week.claimed.includes(g.id);
          return (
            <div className="goal" key={g.id}>
              <div><b>{g.text}</b><div className="xpbar"><i style={{ width: (v / g.target) * 100 + '%' }} /></div><span className="sub tiny">{v.toLocaleString()} / {g.target.toLocaleString()} · reward 🔑 {g.reward} + a season star</span></div>
              <button disabled={!done || claimed || busy || offline} onClick={() => act(() => store.claimWeekly(g.id), 'Claimed 🔑 ' + g.reward)}>{claimed ? 'Claimed' : done ? 'Claim' : 'In progress'}</button>
            </div>
          );
        })}
      </div>

      <h3>Season <span className="sub tiny">{mo} · ★ {season.stars}</span></h3>
      <p className="sub tiny">Earn a star for each weekly goal and each daily challenge you finish this month.</p>
      <div className="tiers">
        {SEASON_TIERS.map((t, i) => {
          const reached = season.stars >= t.stars, claimed = season.claimed.includes(i);
          return (
            <div key={i} className={'tier' + (reached ? ' reached' : '')}>
              <b>★ {t.stars}</b><span>🔑 {t.keys}</span>
              <button className="small" disabled={!reached || claimed || busy || offline} onClick={() => act(() => store.claimSeason(i), 'Claimed 🔑 ' + t.keys)}>{claimed ? 'Claimed' : reached ? 'Claim' : 'Locked'}</button>
            </div>
          );
        })}
      </div>

      <h3>Achievements <span className="sub tiny">{unlocked} / {ACHIEVEMENTS.length}</span></h3>
      <div className="achgrid">
        {ACHIEVEMENTS.map((a) => {
          const got = !!profile.ach[a.id];
          return (
            <div key={a.id} className={'achcard' + (got ? ' got' : '') + (fresh.current.has(a.id) ? ' new' : '')}>
              <b>{got ? '🏆' : '🔒'} {a.name}{fresh.current.has(a.id) && <em> NEW</em>}</b>
              <span className="sub tiny">{a.desc}</span>
              <span className="sub tiny">{a.xp} XP · 🔑 {a.keys}{a.title ? ' · title "' + a.title + '"' : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
