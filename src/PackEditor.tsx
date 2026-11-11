import { useEffect, useRef, useState } from 'react';
import { IMAGE_SLOTS, SOUND_SLOTS, emptyPack, sanitizePack } from '../shared/packfmt';
import * as P from './packs';
import * as store from './profile';
import Gallery from './Gallery';

// Resource packs live in this browser (IndexedDB) and only change how YOUR game looks and sounds.
export default function PackEditor({ onBack }: Record<string, any>) {
  const [stored, setStored] = useState([]);
  const [activeId, setActive] = useState(P.getActiveId());
  const [draft, setDraft] = useState(null); // the user pack being edited
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const importRef = useRef(null);
  const [tab, setTab] = useState('mine'); // 'mine' | 'community'

  const reload = async () => setStored(await P.listPacks());
  useEffect(() => { reload(); }, []);

  const guard = async (fn: () => Promise<any>, ok?: string) => {
    setBusy(true); setMsg('');
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setMsg(e.message || String(e)); }
    setBusy(false);
  };

  const use = (p) => guard(async () => { await P.activatePack(p); P.setActiveId(p.id); setActive(p.id); }, `Now using "${p.name}"`);
  const create = () => setDraft({ ...emptyPack('My pack'), id: P.newId() });
  const edit = (p) => setDraft(JSON.parse(JSON.stringify(p)));
  const duplicate = (p) => guard(async () => { const c = { ...sanitizePack(p), id: P.newId() }; c.name = (c.name + ' copy').slice(0, 40); await P.savePack(c); await reload(); }, 'Duplicated');
  const remove = (p) => {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    guard(async () => { await P.deletePack(p.id); if (activeId === p.id) await use(P.BUILTIN[0]); await reload(); if (draft?.id === p.id) setDraft(null); }, 'Deleted');
  };
  const save = () => guard(async () => {
    const clean = { ...sanitizePack(draft), id: draft.id };
    await P.savePack(clean);
    if (activeId === clean.id) await P.activatePack(clean); // the running pack updates immediately
    await reload();
    setDraft(clean);
  }, 'Saved');
  const publish = (p) => {
    const desc = window.prompt('Short description for the community gallery (optional):', '');
    if (desc === null) return;
    guard(async () => {
      const r = await store.galleryPublish(sanitizePack(p), desc || '');
      const link = location.origin + '/?pack=' + r.id;
      try { await navigator.clipboard?.writeText(link); } catch { /* clipboard blocked */ }
      setMsg('Saved to the gallery. Install link copied: ' + link);
    });
  };
  const onImport = (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (f) guard(async () => { const p = await P.importPackFile(f); await P.savePack(p); await reload(); }, 'Imported');
  };

  // ---- draft editing helpers ----
  const patch = (fn) => setDraft((d) => { const c = JSON.parse(JSON.stringify(d)); fn(c); return c; });
  const upImage = (slot, file) => guard(async () => {
    const src = await P.imageFileToData(file, slot === 'background' ? 1024 : 256);
    patch((c) => { c.images[slot] = { src, scale: c.images[slot]?.scale || 1 }; });
  });
  const upSound = (slot, file) => guard(async () => {
    const src = await P.audioFileToData(file);
    patch((c) => { c.sounds[slot] = src; });
  });
  const play = (src) => { const a = new Audio(src); a.volume = 0.6; a.play().catch(() => {}); };

  const all = [...P.BUILTIN, ...stored];

  return (
    <div className="shop packs">
      <div className="shop-top">
        <button className="ghost small" onClick={onBack}>← Back</button>
        <h2>Resource packs</h2>
        <span className="keychip">Using: {all.find((p) => p.id === activeId)?.name || 'Default'}</span>
      </div>
      {msg && <p className={/^(Saved|Now using|Imported|Deleted|Duplicated)/.test(msg) ? 'toast' : 'err'}>{msg}</p>}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'tab on' : 'tab'} onClick={() => setTab('mine')}>My packs</button>
        <button role="tab" aria-selected={tab === 'community'} className={tab === 'community' ? 'tab on' : 'tab'} onClick={() => setTab('community')}>Community gallery</button>
      </div>
      {tab === 'community' && <Gallery onInstalled={async (p, use) => { await reload(); if (use) setActive(p.id); }} />}

      <div className="shop-body" style={{ display: tab === 'mine' ? undefined : 'none' }}>
        <div className="shop-side packlist">
          <button className="small" onClick={create}>+ New pack</button>
          <button className="ghost small" onClick={() => importRef.current?.click()}>Import file…</button>
          <input ref={importRef} type="file" accept=".json,.cbpack,application/json" hidden onChange={onImport} />
          {all.map((p) => (
            <div key={p.id} className={'packcard' + (p.id === activeId ? ' on' : '')}>
              <b>{p.name}</b>
              <span className="sub tiny">{p.builtin ? p.desc : (p.author ? 'by ' + p.author : 'Your pack')}</span>
              <div className="row">
                <button className="small" disabled={busy || p.id === activeId} onClick={() => use(p)}>{p.id === activeId ? 'In use' : 'Use'}</button>
                {!p.builtin && <button className="ghost small" onClick={() => edit(p)}>Edit</button>}
                {!p.builtin && <button className="ghost small" onClick={() => P.exportPack(p)}>Export</button>}
                {!p.builtin && <button className="ghost small" onClick={() => duplicate(p)}>Copy</button>}
                {!p.builtin && <button className="ghost small" onClick={() => publish(p)}>Share</button>}
                {!p.builtin && <button className="ghost small" onClick={() => remove(p)}>✕</button>}
              </div>
            </div>
          ))}
        </div>

        <div className="shop-main">
          {!draft && (
            <div className="item wide">
              <h3>Make the game yours</h3>
              <p className="sub">A pack can replace the chickens, eggs, bullets, your ship, the pick-ups and the background with your own pictures,
                swap the sound effects and music, recolour the vests, bullets and HUD, tint the whole screen, or switch on chunky pixel-art rendering.
                Create a pack, upload images into the slots you want to change and leave the rest on the default look.</p>
              <p className="sub tiny">Packs are saved in this browser and only change how <b>you</b> see and hear the game; other players are not affected.
                Export a pack to share the file; importing one only accepts images, sounds, colours and options, never code.
                Images are resized to fit (256 px, backgrounds 1024 px). Sounds must be under about 500 KB.</p>
            </div>
          )}

          {draft && (<>
            <div className="row">
              <label className="grow">Pack name <input value={draft.name} maxLength={40} onChange={(e) => patch((c) => { c.name = e.target.value; })} /></label>
              <label className="grow">Author <input value={draft.author} maxLength={40} onChange={(e) => patch((c) => { c.author = e.target.value; })} /></label>
            </div>

            <h3>Images</h3>
            <div className="grid">
              {IMAGE_SLOTS.map((s) => {
                const im = draft.images[s.id];
                return (
                  <div className="item" key={s.id}>
                    <div className="item-h"><b>{s.label}</b></div>
                    <div className="slotthumb">{im ? <img src={im.src} alt={s.label} /> : <span>default</span>}</div>
                    <p className="sub tiny">{s.hint}</p>
                    <div className="row">
                      <label className="filebtn small">Upload<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upImage(s.id, f); }} /></label>
                      {im && <button className="ghost small" onClick={() => patch((c) => { delete c.images[s.id]; })}>Clear</button>}
                    </div>
                    {im && <label className="tiny">Size ×{im.scale.toFixed(1)}<input type="range" min="0.3" max="3" step="0.1" value={im.scale} onChange={(e) => patch((c) => { c.images[s.id].scale = Number(e.target.value); })} /></label>}
                  </div>
                );
              })}
            </div>

            <h3>Sounds</h3>
            <div className="sounds">
              {SOUND_SLOTS.map((s) => {
                const src = draft.sounds[s.id];
                return (
                  <div className="soundrow" key={s.id}>
                    <b>{s.label}</b>
                    <span className="sub tiny">{src ? 'custom' : 'default'}</span>
                    <label className="filebtn small">Upload<input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upSound(s.id, f); }} /></label>
                    {src && <button className="ghost small" onClick={() => play(src)}>▶ Play</button>}
                    {src && <button className="ghost small" onClick={() => patch((c) => { delete c.sounds[s.id]; })}>Clear</button>}
                  </div>
                );
              })}
            </div>

            <h3>Colours &amp; options</h3>
            <div className="colors">
              {[['accent', 'HUD accent'], ['bullet', 'Bullet colour'], ['overlay', 'Screen tint']].map(([k, label]) => (
                <label key={k} className="colorpick">{label}
                  <span>
                    <input type="color" value={draft.colors[k] || '#ffffff'} onChange={(e) => patch((c) => { c.colors[k] = e.target.value; })} />
                    {draft.colors[k] ? <button className="ghost small" onClick={() => patch((c) => { c.colors[k] = null; })}>reset</button> : <em className="sub tiny">default</em>}
                  </span>
                </label>
              ))}
              <label className="colorpick">Tint strength {Math.round(draft.colors.overlayAlpha * 100)}%
                <input type="range" min="0" max="0.6" step="0.02" value={draft.colors.overlayAlpha} onChange={(e) => patch((c) => { c.colors.overlayAlpha = Number(e.target.value); })} />
              </label>
              {['Red vest', 'Orange vest', 'Blue vest', 'Green vest'].map((label, i) => (
                <label key={label} className="colorpick">{label}
                  <span>
                    <input type="color" value={draft.colors.vests[i] || ['#ef5350', '#ffa726', '#42a5f5', '#66bb6a'][i]} onChange={(e) => patch((c) => { c.colors.vests[i] = e.target.value; })} />
                    {draft.colors.vests[i] ? <button className="ghost small" onClick={() => patch((c) => { c.colors.vests[i] = null; })}>reset</button> : <em className="sub tiny">default</em>}
                  </span>
                </label>
              ))}
              <label className="colorpick">Pixel size
                <select value={draft.options.pixel} onChange={(e) => patch((c) => { c.options.pixel = Number(e.target.value); })}>
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n === 1 ? '1 (smooth)' : n + '× chunky'}</option>)}
                </select>
              </label>
              <label className="colorpick check">
                <input type="checkbox" checked={draft.options.tierGlow} onChange={(e) => patch((c) => { c.options.tierGlow = e.target.checked; })} />
                Glow custom chickens in their vest colour
              </label>
            </div>

            <div className="row">
              <button disabled={busy} onClick={save}>Save pack</button>
              <button className="ghost" disabled={busy} onClick={() => { const c = { ...draft }; use({ ...sanitizePack(c), id: draft.id }); }}>Save &amp; use</button>
              <button className="ghost" onClick={() => setDraft(null)}>Close editor</button>
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}
