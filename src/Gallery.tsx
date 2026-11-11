import { useEffect, useState } from 'react';
import { sanitizePack } from '../shared/packfmt';
import * as P from './packs';
import * as store from './profile';

/** Downloads a community pack, re-validates it locally, saves it and optionally switches to it. */
export async function installFromGallery(id, use) {
  const r = await store.galleryGet(id);
  const p = { ...sanitizePack(r.pack), id: P.newId() }; // never trust the server's copy blindly either
  await P.savePack(p);
  if (use) { await P.activatePack(p); P.setActiveId(p.id); }
  return p;
}

// Browse packs other players have shared. Packs are data-only (images, sounds, colours), re-checked on download.
export default function Gallery({ onInstalled }: Record<string, any>) {
  const [sort, setSort] = useState('new');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null); setErr('');
    store.galleryList(sort).then((d) => { if (live) setData(d); }).catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [sort]);

  const install = async (m, use) => {
    setBusy(true); setMsg('');
    try { const p = await installFromGallery(m.id, use); setMsg('Installed "' + p.name + '"' + (use ? ' and switched to it' : '')); onInstalled?.(p, use); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  const report = async (m) => {
    if (!window.confirm('Report "' + m.name + '" as inappropriate? Packs with several reports are hidden.')) return;
    try { await store.galleryReport(m.id); setMsg('Thanks, reported.'); } catch (e) { setMsg(e.message); }
  };

  return (
    <div className="gallery">
      <div className="row">
        <span className="chips">{['new', 'popular'].map((s) => <button key={s} className={'chip' + (sort === s ? ' on' : '')} onClick={() => setSort(s)}>{s === 'new' ? 'Newest' : 'Most installed'}</button>)}</span>
        <span className="sub tiny">{data ? data.total + ' shared pack' + (data.total === 1 ? '' : 's') : ''}</span>
      </div>
      {msg && <p className={/^(Installed|Thanks)/.test(msg) ? 'toast' : 'err'}>{msg}</p>}
      {err && <p className="err">{err}</p>}
      {!data && !err && <p className="sub">Loading…</p>}
      {data && data.packs.length === 0 && <p className="sub">Nothing shared yet. Open “My packs”, make one, and press Share to be the first!</p>}
      <div className="grid">
        {(data?.packs || []).map((m) => (
          <div className="item" key={m.id}>
            <div className="slotthumb">{m.thumb ? <img src={m.thumb} alt={m.name} /> : <span>no preview</span>}</div>
            <div className="item-h"><b>{m.name}</b></div>
            <span className="sub tiny">by {m.author} · {Math.round(m.size / 1024)} KB · ⬇ {m.downloads}</span>
            {m.desc && <p className="sub">{m.desc}</p>}
            <div className="row">
              <button className="small" disabled={busy} onClick={() => install(m, false)}>Install</button>
              <button className="small" disabled={busy} onClick={() => install(m, true)}>Install &amp; use</button>
              <button className="ghost small" onClick={() => report(m)} title="Report">⚑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
