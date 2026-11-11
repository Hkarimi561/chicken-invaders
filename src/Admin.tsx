import { useCallback, useEffect, useState, type FormEvent } from 'react';
import * as store from './profile';

const fmtDate = (ms: number) => (ms ? new Date(ms).toLocaleDateString() : '—');

/** Admin page (the server only answers for the hardcoded admin account). */
export default function Admin({ onBack }: Record<string, any>) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  // gift card form
  const [keys, setKeys] = useState('10');
  const [uses, setUses] = useState('1');
  const [days, setDays] = useState('');
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  // per-user inputs
  const [grant, setGrant] = useState<Record<string, string>>({});
  const [pw, setPw] = useState<Record<string, string>>({});

  const load = useCallback((search = q) => {
    store.adminOverview(search).then((d) => { setData(d); setErr(''); }).catch((e) => setErr(e.message));
  }, [q]);
  useEffect(() => { load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<any>, ok: string | ((r: any) => string)) => {
    setBusy(true); setMsg(''); setErr('');
    try { const r = await fn(); setMsg(typeof ok === 'function' ? ok(r) : ok); load(); } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };

  const createGift = (e: FormEvent) => {
    e.preventDefault();
    act(() => store.adminGiftCreate({ keys: Number(keys), uses: Number(uses) || 1, days: Number(days) || 0, code: custom, note }), (r) => `Created gift card ${r.code}`);
  };
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => setMsg('Copied ' + text)).catch(() => {});

  if (err && !data) {
    return (
      <div className="shop admin">
        <div className="shop-top"><button className="ghost small" onClick={onBack}>← Back</button><h2>Admin</h2><span /></div>
        <p className="err">{err}</p>
      </div>
    );
  }
  if (!data) return <div className="shop admin"><p className="sub">Loading…</p></div>;

  return (
    <div className="shop admin">
      <div className="shop-top">
        <button className="ghost small" onClick={onBack}>← Back</button>
        <h2>🛠 Admin</h2>
        <span className="keychip">{data.total} users</span>
      </div>
      {msg && <p className="toast">{msg}</p>}
      {err && <p className="err">{err}</p>}

      <section className="card">
        <h3>Create a gift card</h3>
        <form className="adminform" onSubmit={createGift}>
          <label>Keys <input type="number" min={1} max={100000} value={keys} onChange={(e) => setKeys(e.target.value)} required /></label>
          <label>Uses (accounts) <input type="number" min={1} max={100000} value={uses} onChange={(e) => setUses(e.target.value)} /></label>
          <label>Expires in days (empty = never) <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} /></label>
          <label>Custom code (empty = random) <input value={custom} maxLength={24} onChange={(e) => setCustom(e.target.value.toUpperCase())} /></label>
          <label>Note (only you see it) <input value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} /></label>
          <button type="submit" disabled={busy}>Create</button>
        </form>
      </section>

      <section className="card">
        <h3>Gift cards ({data.gifts.length})</h3>
        {data.gifts.length === 0 && <p className="sub">None yet.</p>}
        <div className="tablewrap">
          <table>
            <thead><tr><th>Code</th><th>Keys</th><th>Used</th><th>Expires</th><th>Note</th><th /></tr></thead>
            <tbody>
              {data.gifts.map((g: any) => (
                <tr key={g.code} className={g.disabled ? 'off' : ''}>
                  <td><code>{g.code}</code></td>
                  <td>🔑 {g.keys}</td>
                  <td>{g.uses}/{g.maxUses}</td>
                  <td>{g.expires ? fmtDate(g.expires) : 'never'}</td>
                  <td>{g.note}</td>
                  <td className="acts">
                    <button className="ghost small" onClick={() => copy(g.code)}>Copy</button>
                    <button className="ghost small" disabled={busy} onClick={() => act(() => store.adminGiftToggle(g.code, !g.disabled), g.disabled ? 'Enabled' : 'Disabled')}>{g.disabled ? 'Enable' : 'Disable'}</button>
                    <button className="ghost small" disabled={busy} onClick={() => { if (confirm('Delete gift card ' + g.code + '?')) act(() => store.adminGiftDelete(g.code), 'Deleted'); }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3>Users</h3>
        <form className="row" onSubmit={(e) => { e.preventDefault(); load(q); }}>
          <input placeholder="Search username" value={q} maxLength={30} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="small">Search</button>
        </form>
        <div className="tablewrap">
          <table>
            <thead><tr><th>User</th><th>Keys</th><th>Unclaimed</th><th>Runs</th><th>Best wave</th><th>Joined</th><th>Give / take keys</th><th>New password</th></tr></thead>
            <tbody>
              {data.users.map((u: any) => (
                <tr key={u.id}>
                  <td><b>{u.username}</b></td>
                  <td>{u.keys}</td><td>{u.pending}</td><td>{u.runs}</td><td>{u.bestWave}</td><td>{fmtDate(u.created)}</td>
                  <td>
                    <div className="row">
                      <input type="number" placeholder="e.g. 50 or -10" value={grant[u.username] || ''} onChange={(e) => setGrant({ ...grant, [u.username]: e.target.value })} />
                      <button className="small" disabled={busy || !grant[u.username]} onClick={() => act(() => store.adminGrant(u.username, Number(grant[u.username])), (r) => `${r.username} now has ${r.keys} keys`).then(() => setGrant({ ...grant, [u.username]: '' }))}>Apply</button>
                    </div>
                  </td>
                  <td>
                    <div className="row">
                      <input type="text" autoComplete="off" placeholder="6+ characters" value={pw[u.username] || ''} onChange={(e) => setPw({ ...pw, [u.username]: e.target.value })} />
                      <button className="small" disabled={busy || (pw[u.username] || '').length < 6} onClick={() => { if (confirm('Set a new password for ' + u.username + '?')) act(() => store.adminPassword(u.username, pw[u.username]), 'Password changed for ' + u.username).then(() => setPw({ ...pw, [u.username]: '' })); }}>Set</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sub tiny">Showing up to 100 users, newest first.</p>
      </section>
    </div>
  );
}
