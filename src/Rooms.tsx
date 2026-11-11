import { useEffect, useState } from 'react';
import { MUTATORS, MUT_IDS, ROLES } from '../shared/sim';
import { PALETTE } from '../shared/catalog';
import * as store from './profile';
import { QR } from './ui';

// Chips for choosing run rules; shows the bonus they give.
export function MutatorChips({ value, onChange, disabled }: Record<string, any>) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="chips" role="group" aria-label="Mutators">
      {MUT_IDS.map((id) => (
        <button key={id} type="button" disabled={disabled} className={'chip' + (value.includes(id) ? ' on' : '')} title={MUTATORS[id].desc} onClick={() => toggle(id)}>{MUTATORS[id].name}</button>
      ))}
    </div>
  );
}
export const mutBonusText = (n) => (n ? `+${25 * n}% keys, +${20 * n}% score` : 'no extra rules');

// The settings a host chooses for a room.
export function RoomForm({ value, onChange, withName = true }: Record<string, any>) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="roomform">
      {withName && <label>Room name <input value={value.name} maxLength={20} onChange={(e) => set('name', e.target.value)} /></label>}
      <div className="row">
        <label className="grow">Password <input value={value.password} maxLength={16} placeholder="(none)" onChange={(e) => set('password', e.target.value)} /></label>
        <label className="grow">Seats
          <select value={value.max} onChange={(e) => set('max', Number(e.target.value))}>{[2, 3, 4].map((n) => <option key={n} value={n}>{n} players</option>)}</select>
        </label>
      </div>
      <label className="check"><input type="checkbox" checked={value.public} onChange={(e) => set('public', e.target.checked)} /> List in the public room browser</label>
      <div><span className="sub tiny">Mutators ({mutBonusText(value.mut.length)})</span><MutatorChips value={value.mut} onChange={(m) => set('mut', m)} /></div>
    </div>
  );
}
export const defaultRoomSettings = (name = '') => ({ name, public: true, password: '', mut: [], max: 4 });

// Public room browser + create form.
export function RoomBrowser({ onBack, onJoin, onQuick, onCreate, name }: Record<string, any>) {
  const [rooms, setRooms] = useState(null);
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(() => defaultRoomSettings((name || 'Pilot') + "'s room"));
  const [pw, setPw] = useState({}); // password typed per locked room

  useEffect(() => {
    let live = true;
    const load = () => store.listRooms().then((r) => { if (live) { setRooms(r); setErr(''); } }).catch((e) => { if (live) setErr(e.message); });
    load();
    const t = setInterval(load, 3000);
    return () => { live = false; clearInterval(t); };
  }, []);

  return (
    <div className="shop rooms">
      <div className="shop-top">
        <button className="ghost small" onClick={onBack}>← Back</button>
        <h2>Multiplayer rooms</h2>
        <button className="small" onClick={onQuick}>⚡ Quick play</button>
      </div>
      <div className="row">
        <button className={creating ? 'ghost' : ''} onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : '+ Create a room'}</button>
      </div>
      {creating && (
        <div className="item wide">
          <RoomForm value={form} onChange={setForm} />
          <button onClick={() => onCreate(form)}>Create room</button>
        </div>
      )}
      {err && <p className="err">{err}</p>}
      {!rooms && !err && <p className="sub">Loading…</p>}
      {rooms && rooms.length === 0 && <p className="sub">No public rooms right now. Create one, or press Quick play to open one for others.</p>}
      {rooms && rooms.length > 0 && (
        <table className="lbtable roomtable">
          <thead><tr><th>Room</th><th>Players</th><th className="hide-s">Rules</th><th>State</th><th /></tr></thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.code}>
                <td><b>{r.name}</b> {r.locked && '🔒'}<div className="sub tiny">{r.code}</div></td>
                <td>{r.players}/{r.max}</td>
                <td className="hide-s">{r.mut.length ? r.mut.map((m) => MUTATORS[m]?.name).join(', ') : '—'}</td>
                <td>{r.phase === 'playing' ? 'Wave ' + r.wave : 'Lobby'}{r.spectators ? ' · 👁 ' + r.spectators : ''}</td>
                <td className="rowbtns">
                  {r.locked && <input className="pw" placeholder="password" value={pw[r.code] || ''} onChange={(e) => setPw({ ...pw, [r.code]: e.target.value })} />}
                  <button className="small" disabled={r.players >= r.max} onClick={() => onJoin(r.code, pw[r.code] || '', false)}>Join</button>
                  <button className="ghost small" onClick={() => onJoin(r.code, pw[r.code] || '', true)}>Watch</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// The waiting room: players with their roles, share link, and (for the host) editable settings.
export function Lobby({ room, link, onStart, onLeave, onSettings, copied, onCopy }: Record<string, any>) {
  const host = room.host === room.you;
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ ...defaultRoomSettings(room.settings.name), ...room.settings, password: '' });
  return (
    <div className="card lobby">
      <h2>{room.settings.name} <span className="code">{room.code}</span></h2>
      <p className="sub">
        {room.settings.public ? 'Public' : 'Private'}{room.settings.locked ? ' · 🔒 password' : ''} · up to {room.settings.max} players
        {room.spectators ? ` · 👁 ${room.spectators} watching` : ''}
      </p>
      {room.settings.mut.length > 0 && <p className="sub">Rules: <b>{room.settings.mut.map((m) => MUTATORS[m]?.name).join(', ')}</b> ({mutBonusText(room.settings.mut.length)})</p>}

      <p className="sub">Scan with a phone on the same Wi-Fi, or open the link:</p>
      <QR text={link} />
      <code>{link}</code>
      <button className="ghost" onClick={onCopy}>{copied ? 'Copied!' : 'Copy link'}</button>

      <ul className="plist">
        {room.players.map((p) => (
          <li key={p.id}><i style={{ background: p.color || PALETTE[0] }} />
            <span className="rolebadge" title={ROLES[p.role]?.desc} style={{ background: ROLES[p.role]?.color }}>{ROLES[p.role]?.icon || 'A'}</span>
            {p.name}{p.id === room.host ? ' ★' : ''}{p.id === room.you ? ' (you)' : ''}{p.away ? ' · reconnecting…' : ''}
          </li>
        ))}
      </ul>

      {host && (
        <>
          <button className="ghost" onClick={() => setEdit(!edit)}>{edit ? 'Hide room settings' : 'Room settings'}</button>
          {edit && (
            <div className="item wide">
              <RoomForm value={form} onChange={setForm} />
              <button onClick={() => { onSettings(form.password === '' && room.settings.locked ? { ...form, password: undefined } : form); setEdit(false); }}>Apply</button>
              {room.settings.locked && <p className="sub tiny">Leave the password blank to keep the current one.</p>}
            </div>
          )}
          <button onClick={onStart}>Start game</button>
        </>
      )}
      {!host && <p>Waiting for host…</p>}
      <button className="ghost" onClick={onLeave}>Leave</button>
    </div>
  );
}
