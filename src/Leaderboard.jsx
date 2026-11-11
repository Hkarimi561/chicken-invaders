import { useEffect, useState } from 'react';
import { ratingOf } from '../shared/leaderboard.js';
import { MUTATORS } from '../shared/sim.js';
import * as store from './profile.js';

const MODES = [
  { id: 'solo', label: 'Solo', note: 'Played in your browser. The server caps what it accepts by time played, so these scores are best-effort.' },
  { id: 'online', label: 'Online', note: 'Played in a room. The server counted these scores itself, so they are verified.' },
  { id: 'daily', label: 'Daily', note: "The seeded daily challenge: everyone plays the same run each day. “Today” shows today's results (UTC)." },
  { id: 'rush', label: 'Boss rush', note: 'Only bosses, back to back. Browser-played, capped like solo.' },
];
const BOARDS = [
  { id: 'rating', label: 'Rating', col: 'Rating' },
  { id: 'score', label: 'Best score', col: 'Score' },
  { id: 'wave', label: 'Best wave', col: 'Wave' },
  { id: 'week', label: 'This week', col: 'Points' },
  { id: 'today', label: 'Today', col: 'Points' },
];

const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r);

export default function Leaderboard({ profile, daily, onBack }) {
  const [mode, setMode] = useState('solo');
  const [board, setBoard] = useState('rating');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    setData(null); setErr('');
    store.leaderboard(mode, board).then((d) => { if (live) setData(d); }).catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [mode, board]);

  const col = BOARDS.find((b) => b.id === board).col;
  const value = (e) => (board === 'rating' ? e.rating : board === 'score' ? e.score : board === 'wave' ? e.wave : board === 'week' ? e.weekPoints : e.todayPoints);
  const mine = profile.rec?.[mode];

  return (
    <div className="shop lb">
      <div className="shop-top">
        <button className="ghost small" onClick={onBack}>← Back</button>
        <h2>Leaderboard</h2>
        <span className="keychip">Your rating: {mine ? ratingOf(mine) : 0}</span>
      </div>

      <div className="tabs" role="tablist">
        {MODES.map((m) => <button key={m.id} role="tab" aria-selected={m.id === mode} className={m.id === mode ? 'tab on' : 'tab'} onClick={() => { setMode(m.id); if (m.id === 'daily') setBoard('today'); }}>{m.label}</button>)}
      </div>
      <div className="tabs" role="tablist">
        {BOARDS.map((b) => <button key={b.id} role="tab" aria-selected={b.id === board} className={b.id === board ? 'tab on' : 'tab'} onClick={() => setBoard(b.id)}>{b.label}</button>)}
      </div>
      <p className="sub tiny">
        {MODES.find((m) => m.id === mode).note} Rating is the average of your best five runs (score + 150 per wave).
        {mode === 'daily' && daily ? ` Today's rules: ${daily.mut.map((m) => MUTATORS[m].name).join(' + ')}.` : ''}
        {board === 'week' && data ? ` Week ${data.week}.` : ''}
      </p>

      {err && <p className="err">{err}</p>}
      {!data && !err && <p className="sub">Loading…</p>}
      {data && data.entries.length === 0 && <p className="sub">No runs on this board yet. Finish a run to claim the first place!</p>}
      {data && data.entries.length > 0 && (
        <table className="lbtable">
          <thead><tr><th>#</th><th>Pilot</th><th className="num">{col}</th><th className="num hide-s">Best score</th><th className="num hide-s">Best wave</th><th className="num hide-s">Runs</th></tr></thead>
          <tbody>
            {data.entries.map((e) => (
              <tr key={e.rank} className={e.you ? 'you' : ''}>
                <td>{medal(e.rank)}</td>
                <td>{e.name}{e.you ? ' (you)' : ''} <span className="lvtag">Lv {e.level}</span>{e.title ? <span className="titletag"> {e.title}</span> : null}</td>
                <td className="num"><b>{value(e).toLocaleString()}</b></td>
                <td className="num hide-s">{e.score.toLocaleString()}</td>
                <td className="num hide-s">{e.wave}</td>
                <td className="num hide-s">{e.runs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data && data.me && data.me.rank > data.entries.length && (
        <table className="lbtable"><tbody>
          <tr className="you"><td>{data.me.rank}</td><td>{data.me.name} (you)</td><td className="num"><b>{value(data.me).toLocaleString()}</b></td></tr>
        </tbody></table>
      )}
      {data && <p className="sub tiny">{data.total} pilot{data.total === 1 ? '' : 's'} ranked{data.me ? ` · you are #${data.me.rank}` : ''}.</p>}
    </div>
  );
}
