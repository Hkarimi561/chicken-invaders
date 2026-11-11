import { useEffect, useRef, useState } from 'react';
import { MUTATORS } from '../shared/sim.js';
import * as R from './replaystore.js';

const fmtTime = (ticks) => { const s = Math.floor(ticks / 60); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// Saved runs of this browser: play them back, export them to share, or import someone else's.
export default function Replays({ onBack, onPlay }) {
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);
  const reload = () => R.listReplays().then(setList);
  useEffect(() => { reload(); }, []);

  const play = (rep) => {
    try { onPlay(R.loadable(rep)); } catch (e) { setMsg(e.message); }
  };
  const importFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { await R.importReplayFile(f); setMsg('Imported'); reload(); } catch (err) { setMsg(err.message); }
  };

  return (
    <div className="shop replays">
      <div className="shop-top">
        <button className="ghost small" onClick={onBack}>← Back</button>
        <h2>Replays</h2>
        <button className="small" onClick={() => fileRef.current?.click()}>Import…</button>
        <input ref={fileRef} type="file" accept=".json,.cbreplay,application/json" hidden onChange={importFile} />
      </div>
      <p className="sub tiny">A replay stores the run's seed and your inputs, then plays the game back exactly. Single-player runs offer “Save replay” when they end. The newest 12 are kept; replays from older game versions can't be played.</p>
      {msg && <p className={msg === 'Imported' ? 'toast' : 'err'}>{msg}</p>}
      {list && list.length === 0 && <p className="sub">No replays yet. Finish a single-player run and press “Save replay”.</p>}
      <div className="goals">
        {(list || []).map((r) => (
          <div className="goal" key={r.id}>
            <div>
              <b>Wave {r.wave} · {r.score.toLocaleString()} pts</b>
              <span className="sub tiny"> {new Date(r.when).toLocaleString()} · {fmtTime(r.ticks)}{r.meta.daily ? ' · daily' : ''}{r.meta.rush ? ' · boss rush' : ''}{r.meta.mut.length ? ' · ' + r.meta.mut.map((m) => MUTATORS[m]?.name || m).join(', ') : ''}</span>
            </div>
            <div className="rowbtns">
              <button className="small" onClick={() => play(r)}>▶ Play</button>
              <button className="ghost small" onClick={() => R.exportReplay(r)}>Export</button>
              <button className="ghost small" onClick={() => R.deleteReplay(r.id).then(reload)}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
