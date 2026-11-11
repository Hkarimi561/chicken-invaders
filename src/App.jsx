import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import Game from './Game.jsx';
import { connect } from './net.js';
import { W, H, createState, addPlayer, step, WEAPONS } from '../shared/sim.js';
import {
  PALETTE, SKINS, UPGRADES, GUNS, SKIN_INFO, TRAIL_INFO, PAINT_COST, SHOP_GUN_IDS,
  loadoutOf, quote, upgradeLevel,
} from '../shared/catalog.js';
import { draw, drawShipPreview } from './render.js';
import { resetFx } from './fx.js';
import * as store from './profile.js';
import { quality, IS_TOUCH } from './util.js';
import PackEditor from './PackEditor.jsx';
import Leaderboard from './Leaderboard.jsx';
import { ratingOf } from '../shared/leaderboard.js';
import { theme, initTheme, setEventMode } from './theme.js';
import { loadActivePack } from './packs.js';
import { EVENTS, activeEvent, nextEvent, fmtWindow } from '../shared/events.js';

initTheme(); // pick the seasonal theme before anything draws

function QR({ text }) {
  const src = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createDataURL(5, 3);
  }, [text]);
  return <img className="qr" src={src} alt="QR code to join this room" />;
}

// Animated preview of a loadout on a small canvas (`still` draws one frame, for catalogue thumbnails).
function ShipView({ opts, size = 120, still = false }) {
  const cv = useRef(null);
  const key = JSON.stringify(opts);
  useEffect(() => {
    const ctx = cv.current.getContext('2d');
    const o = JSON.parse(key);
    if (still) { drawShipPreview(ctx, size, size, { ...o, scale: o.scale || size / 70 }, 1.3); return undefined; }
    let raf;
    const loop = (now) => { drawShipPreview(ctx, size, size, o, now / 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [key, size, still]);
  return <canvas ref={cv} width={size} height={size} className={still ? 'thumb' : 'preview'} />;
}

const shipOpts = (l) => ({ color: l.color || PALETTE[0], skin: l.skin, trail: l.trail, weapon: l.gun || 'blaster' });

// Attract mode: a bot pilot plays a random wave in the background of the menu, showing off shop gear.
function Attract() {
  const cv = useRef(null);
  useEffect(() => {
    const ctx = cv.current.getContext('2d');
    if (IS_TOUCH) quality.level = 0; // the menu backdrop is decoration: keep it cheap on phones
    let s, startWave, raf, acc = 0, last = performance.now();
    const pick = (a) => a[(Math.random() * a.length) | 0];
    const fresh = () => {
      resetFx();
      s = createState();
      startWave = Math.floor(Math.random() * 28);
      s.wave = startWave; s.cleared = startWave > 0;
      addPlayer(s, 'bot', 'Bot', { color: pick(PALETTE), skin: pick(SKINS), trail: pick(Object.keys(TRAIL_INFO)), gun: pick([null, ...SHOP_GUN_IDS]) });
      const b = s.players.bot;
      b.lives = 99; b.power = 1 + ((Math.random() * 4) | 0);
      if (Math.random() < 0.5) b.weapon = pick(WEAPONS);
    };
    const think = () => {
      const p = s.players.bot, i = p.input;
      let target = null, bd = 1e9;
      for (const c of s.chickens) if (!(c.ent < 1) && c.y < p.y - 40) { const d = Math.abs(c.x - p.x) + (p.y - c.y) * 0.2; if (d < bd) { bd = d; target = c; } }
      let tx = target ? target.x : W / 2, dodge = 0;
      for (const e of s.eggs) if (e.y > p.y - 140 && e.y < p.y + 10 && Math.abs(e.x - p.x) < 36) dodge = e.x > p.x ? -1 : 1;
      if (dodge) tx = p.x + dodge * 80;
      i.left = +(tx < p.x - 8); i.right = +(tx > p.x + 8); i.up = 0; i.down = +(p.y < H - 70); i.fire = 1;
    };
    fresh();
    const frame = (now) => {
      acc += Math.min(0.1, (now - last) / 1000); last = now;
      while (acc >= 1 / 60) { think(); step(s, 1 / 60); acc -= 1 / 60; }
      draw(ctx, s, 'bot', now / 1000, { silent: true });
      if (s.over || s.wave - startWave >= 3) fresh();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); resetFx(); };
  }, []);
  return <canvas ref={cv} width={W} height={H} className="attract" aria-hidden="true" />;
}

const Keys = ({ n }) => <span className="keychip">🔑 {n}</span>;

// ---------------- Shop & Hangar ----------------
const TABS = ['Upgrades', 'Guns', 'Skins', 'Events', 'Paint', 'Trails'];

function Shop({ profile, setProfile, onBack, event }) {
  const [tab, setTab] = useState('Upgrades');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeIn, setCodeIn] = useState('');
  const [copied, setCopied] = useState(false);
  const offline = !!profile.offline;
  const l = loadoutOf(profile);

  const act = async (fn, ok) => {
    if (busy) return;
    setBusy(true); setMsg('');
    try { const r = await fn(); setProfile(r.profile || r); if (ok) setMsg(ok); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  const buyIt = (item, what) => act(() => store.buy(item), `Bought ${what}!`);
  const equipIt = (slot, value) => act(() => store.equip(slot, value));
  const claim = () => act(async () => { const r = await store.claim(); setMsg(`Claimed ${r.claimed} key${r.claimed === 1 ? '' : 's'}!`); return r.profile; });

  const Buy = ({ item, label }) => {
    const q = quote(profile, item, { event });
    if (q.error) return <button disabled>{q.error}</button>;
    return <button disabled={offline || busy || profile.keys < q.cost} onClick={() => buyIt(item, label)}>Buy · 🔑 {q.cost}</button>;
  };
  const Pick = ({ slot, value, current, allowNone }) => (
    current === value
      ? <button className="ghost" disabled={!allowNone || offline || busy} onClick={() => equipIt(slot, null)}>{allowNone ? 'Equipped · tap to remove' : 'Equipped'}</button>
      : <button disabled={offline || busy} onClick={() => equipIt(slot, value)}>Equip</button>
  );

  const code = store.getPid();
  return (
    <div className="shop">
      <div className="shop-top">
        <button className="ghost small" onClick={onBack}>← Back</button>
        <h2>Hangar &amp; Shop</h2>
        <Keys n={profile.keys} />
      </div>

      {profile.pending > 0 && (
        <div className="claimbar">
          <span>You have <b>🔑 {profile.pending}</b> unclaimed from your runs.</span>
          <button disabled={offline || busy} onClick={claim}>Claim keys</button>
        </div>
      )}
      {offline && <p className="err">Server unreachable — shop and key claiming are disabled until it is back.</p>}
      {msg && <p className="toast">{msg}</p>}

      <div className="shop-body">
        <div className="shop-side">
          <ShipView opts={shipOpts(l)} size={160} />
          <p className="sub">Equipped: {SKIN_INFO[l.skin].name}{l.gun ? ` · ${GUNS[l.gun].name}` : ' · Blaster'}</p>
          <p className="sub">Lives {3 + l.mods.hull} · Power {1 + l.mods.reactor} · Speed +{l.mods.engine * 6}%</p>
          <p className="sub tiny">Keys drop from chickens (tougher vests and bosses drop more). Collect them in a run, then claim them here.</p>
        </div>

        <div className="shop-main">
          <div className="tabs" role="tablist">
            {TABS.map((t) => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'tab on' : 'tab'} onClick={() => setTab(t)}>{t}</button>)}
          </div>
          <div className="grid">
            {tab === 'Upgrades' && Object.entries(UPGRADES).map(([id, u]) => {
              const lvl = upgradeLevel(profile, id);
              return (
                <div className="item" key={id}>
                  <div className="item-h"><b>{u.name}</b><span className="pips">{u.costs.map((_, i) => <i key={i} className={i < lvl ? 'on' : ''} />)}</span></div>
                  <p className="sub">{u.desc}</p>
                  <Buy item={`up:${id}`} label={u.name} />
                </div>
              );
            })}

            {tab === 'Guns' && (<>
              <div className="item wide"><p className="sub">These start every run in your hands. The blaster, pulse, laser and missile still drop from chickens during a run and replace your gun until you lose all your lives.</p></div>
              {SHOP_GUN_IDS.map((id) => (
                <div className="item" key={id}>
                  <div className="item-h"><b>{GUNS[id].name}</b></div>
                  <ShipView still size={76} opts={{ ...shipOpts(l), weapon: id }} />
                  <p className="sub">{GUNS[id].desc}</p>
                  {profile.owned.gun.includes(id) ? <Pick slot="gun" value={id} current={l.gun} allowNone /> : <Buy item={`gun:${id}`} label={GUNS[id].name} />}
                </div>
              ))}
            </>)}

            {tab === 'Skins' && SKINS.filter((id) => !SKIN_INFO[id].event).map((id) => (
              <div className={SKIN_INFO[id].special ? 'item special' : 'item'} key={id}>
                <div className="item-h"><b>{SKIN_INFO[id].name}</b>{SKIN_INFO[id].special && <em>special</em>}</div>
                <ShipView still size={76} opts={{ ...shipOpts(l), skin: id }} />
                {profile.owned.skin.includes(id) ? <Pick slot="skin" value={id} current={l.skin} /> : <Buy item={`skin:${id}`} label={SKIN_INFO[id].name} />}
              </div>
            ))}

            {tab === 'Events' && (<>
              <div className="item wide"><p className="sub">Limited-time ship skins: sold only while their event is running, yours to keep afterwards.{event ? ' Right now: ' + EVENTS[event].icon + ' ' + EVENTS[event].name + '.' : ' No event is running at the moment.'}</p></div>
              {SKINS.filter((id) => SKIN_INFO[id].event).map((id) => {
                const info = SKIN_INFO[id], ev = EVENTS[info.event];
                return (
                  <div className="item special" key={id}>
                    <div className="item-h"><b>{info.name}</b><em>{ev.icon} {ev.name}</em></div>
                    <ShipView still size={76} opts={{ ...shipOpts(l), skin: id }} />
                    <p className="sub tiny">On sale {fmtWindow(info.event)}</p>
                    {profile.owned.skin.includes(id) ? <Pick slot="skin" value={id} current={l.skin} /> : <Buy item={'skin:' + id} label={info.name} />}
                  </div>
                );
              })}
            </>)}

            {tab === 'Paint' && (<>
              <div className="item">
                <div className="item-h"><b>Auto colour</b></div>
                <ShipView still size={76} opts={{ ...shipOpts(l), color: PALETTE[0] }} />
                <p className="sub">Default blue. In co-op each seat gets its own colour.</p>
                <Pick slot="paint" value={null} current={l.color} />
              </div>
              {PALETTE.slice(1).map((c) => (
                <div className="item" key={c}>
                  <div className="item-h"><b><i className="dot" style={{ background: c }} /> Paint</b></div>
                  <ShipView still size={76} opts={{ ...shipOpts(l), color: c }} />
                  {profile.owned.paint.includes(c) ? <Pick slot="paint" value={c} current={l.color} /> : <Buy item={`paint:${c}`} label="paint" />}
                </div>
              ))}
              <p className="sub tiny wide">Each paint costs 🔑 {PAINT_COST}.</p>
            </>)}

            {tab === 'Trails' && Object.entries(TRAIL_INFO).map(([id, t]) => (
              <div className="item" key={id}>
                <div className="item-h"><b>{t.name}</b></div>
                <ShipView still size={76} opts={{ ...shipOpts(l), trail: id }} />
                {profile.owned.trail.includes(id) ? <Pick slot="trail" value={id} current={l.trail} /> : <Buy item={`trail:${id}`} label={t.name} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="code">
        <b>Profile code</b> — your keys and unlocks live on the server under this secret code. Keep it private; enter it on another device to bring your account along.
        <code className="codebox">{code || '(none yet)'}</code>
        <div className="row">
          <button className="ghost small" disabled={!code} onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{copied ? 'Copied!' : 'Copy code'}</button>
          <input placeholder="Paste a code from another device" value={codeIn} onChange={(e) => setCodeIn(e.target.value)} />
          <button className="small" disabled={busy || codeIn.trim().length < 24} onClick={() => act(() => store.useCode(codeIn), 'Profile loaded')}>Use</button>
        </div>
      </div>
    </div>
  );
}

// Shows which seasonal theme is active and lets the player force one or switch events off.
function EventBar({ mode, onPick }) {
  const ev = theme.event && EVENTS[theme.event];
  const next = nextEvent();
  return (
    <div className={'eventbar' + (ev ? ' on' : '')} style={ev ? { borderColor: ev.accent } : undefined}>
      <div>
        {ev
          ? <><b>{ev.icon} {ev.name} theme</b> <span className="sub tiny">{ev.tagline}</span></>
          : <span className="sub">No seasonal event right now · next: <b>{EVENTS[next.id].icon} {EVENTS[next.id].name}</b> in {next.days} day{next.days === 1 ? '' : 's'}</span>}
      </div>
      <label className="tiny">Seasonal theme
        <select value={mode} onChange={(e) => onPick(e.target.value)}>
          <option value="auto">Automatic (follows the date)</option>
          <option value="off">Off</option>
          {Object.entries(EVENTS).map(([id, e]) => <option key={id} value={id}>{e.icon} {e.name}</option>)}
        </select>
      </label>
    </div>
  );
}

export default function App() {
  const urlRoom = useMemo(() => (new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, 4), []);
  const [screen, setScreen] = useState('menu'); // menu | shop | single | lobby | multi
  const [name, setName] = useState(() => { try { return localStorage.getItem('cb-name') || 'Pilot'; } catch { return 'Pilot'; } });
  const [code, setCode] = useState(urlRoom);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  const [profile, setProfile] = useState(store.offlineProfile);
  const [evMode, setEvMode] = useState(theme.mode);
  const net = useRef(null);
  const runRef = useRef(null);
  const nameRef = useRef(name);
  nameRef.current = name;

  const refresh = useCallback(() => store.loadProfile().then(setProfile).catch(() => setProfile(store.offlineProfile())), []);
  useEffect(() => { fetch('/api/info').then((r) => r.json()).then(setInfo).catch(() => {}); refresh(); }, [refresh]);
  useEffect(() => { loadActivePack(); }, []); // the pack picked last time

  const loadout = useMemo(() => loadoutOf(profile), [profile]);
  const pickEvent = (m) => { setEventMode(m); setEvMode(m); };

  const leave = useCallback(() => {
    net.current?.send({ t: 'leave' });
    net.current?.close();
    net.current = null;
    setRoom(null);
    setScreen('menu');
    setTimeout(refresh, 400); // keys from the run are credited by the server on leave
  }, [refresh]);
  const exitSingle = useCallback(() => setScreen('menu'), []);

  // A single-player run: the server hands out a run id and later credits the (capped) keys as "unclaimed".
  const startSingle = () => {
    try { localStorage.setItem('cb-name', name); } catch { /* ignore */ }
    runRef.current = null;
    store.startRun().then((id) => { runRef.current = id; }).catch(() => {});
    setScreen('single');
  };
  const onRunEnd = useCallback(({ keys, wave, over, score, kills }) => {
    const id = runRef.current;
    runRef.current = null;
    if (over) store.startRun().then((i) => { runRef.current = i; }).catch(() => {}); // the player may restart
    if (id) store.endRun(id, { keys, wave, score, kills, name: nameRef.current }).then((j) => setProfile(j.profile)).catch(() => {});
  }, []);

  const join = (create) => {
    try { localStorage.setItem('cb-name', name); } catch { /* ignore */ }
    setError('');
    net.current = connect({
      onOpen: (n) => n.send({ t: 'join', name, pid: store.getPid(), create, room: code }),
      onMessage: (m) => {
        if (m.t === 'error') { setError(m.msg); net.current?.close(); net.current = null; }
        if (m.t === 'room') { setRoom(m); setScreen(m.phase === 'playing' ? 'multi' : 'lobby'); }
      },
      onClose: () => { if (net.current) { setError('Disconnected'); setRoom(null); setScreen('menu'); net.current = null; } },
    });
  };

  // Share links use the LAN address when the page was opened via localhost.
  const base = useMemo(() => {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if (local && info?.addresses?.[0]) return `http://${info.addresses[0]}:${location.port || info.port}`;
    return location.origin;
  }, [info]);
  // The https:// twin of this page (self-signed certificate). Needed for gyroscope steering on phones; the
  // profile code travels in the URL fragment because the secure address is a different origin.
  const secureUrl = info?.httpsPort && location.protocol === 'http:'
    ? 'https://' + location.hostname + ':' + info.httpsPort + '/#p=' + store.getPid()
    : null;
  const lan = info?.addresses?.map((a) => `http://${a}:${location.port || info.port}`) || [];

  if (screen === 'single')
    return <Shell><Game mode="single" name={name} loadout={loadout} onRunEnd={onRunEnd} onExit={exitSingle} secureUrl={secureUrl} /><Hint /></Shell>;
  if (screen === 'multi' && room && net.current?.state)
    return <Shell><Game mode="multi" net={net.current} onExit={leave} secureUrl={secureUrl} /><Hint room={room} /></Shell>;

  if (screen === 'shop')
    return <Shell><Attract /><Shop profile={profile} setProfile={setProfile} event={info && 'event' in info ? info.event : activeEvent()} onBack={() => { setScreen('menu'); refresh(); }} /></Shell>;
  if (screen === 'board')
    return <Shell><Attract /><Leaderboard profile={profile} onBack={() => { setScreen('menu'); refresh(); }} /></Shell>;
  if (screen === 'packs')
    return <Shell><Attract /><PackEditor onBack={() => setScreen('menu')} /></Shell>;

  if (screen === 'lobby' && room) {
    const host = room.host === room.you;
    const link = `${base}/?room=${room.code}`;
    return (
      <Shell>
        <Attract />
        <div className="card">
          <h2>Room <span className="code">{room.code}</span></h2>
          <p className="sub">Scan with a phone on the same Wi-Fi, or open the link:</p>
          <QR text={link} />
          <code>{link}</code>
          <button className="ghost" onClick={() => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <ul className="plist">
            {room.players.map((p) => (
              <li key={p.id}><i style={{ background: p.color || PALETTE[0] }} />{p.name}{p.id === room.host ? ' ★' : ''}{p.id === room.you ? ' (you)' : ''}</li>
            ))}
          </ul>
          {host ? <button onClick={() => net.current.send({ t: 'start' })}>Start game</button> : <p>Waiting for host…</p>}
          <button className="ghost" onClick={leave}>Leave</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Attract />
      <div className="card">
        <h1>🐔 Chicken Blasters</h1>
        <p className="sub">Original co-op space shooter · React + Node</p>
        <label>Pilot name <input value={name} maxLength={14} onChange={(e) => setName(e.target.value)} /></label>

        <div className="hangar">
          <ShipView opts={shipOpts(loadout)} />
          <div className="hangar-opts">
            <Keys n={profile.keys} />
            <span className="keychip rating" title="Average of your best five runs">★ {Math.max(ratingOf(profile.rec?.solo || { top: [] }), ratingOf(profile.rec?.online || { top: [] }))}</span>
            {profile.pending > 0 && <button className="small" disabled={!!profile.offline} onClick={() => store.claim().then((r) => setProfile(r.profile)).catch(() => {})}>Claim 🔑 {profile.pending}</button>}
            <button className="ghost" onClick={() => setScreen('shop')}>Hangar &amp; Shop</button>
            <button className="ghost" onClick={() => setScreen('packs')}>Resource packs</button>
            <button className="ghost" onClick={() => setScreen('board')}>Leaderboard</button>
            <p className="sub tiny">Every pilot starts with the standard plane. Find 🔑 in battle to upgrade it.</p>
          </div>
        </div>

        <EventBar mode={evMode} onPick={pickEvent} />
        <button onClick={startSingle}>Single player</button>
        <hr />
        {urlRoom && <p className="sub">Invited to room <b>{urlRoom}</b> — tap Join.</p>}
        <div className="row">
          <input placeholder="ROOM CODE" value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button disabled={code.length !== 4} onClick={() => join(false)}>Join</button>
        </div>
        <button className="ghost" onClick={() => join(true)}>Create multiplayer room</button>
        {error && <p className="err">{error}</p>}
        {lan.length > 0 && <p className="sub">LAN address: {lan.join('  ')}</p>}
        <p className="sub">Keyboard: WASD / arrows + Space · Mouse: move to steer, hold left button to fire · Mute: M · Pause: P · Leave: Esc · Touch: stick + FIRE</p>
        <p className="sub">Co-op: fly over a downed teammate for 1.5s to revive them.</p>
        {IS_TOUCH && secureUrl && <p className="sub">Gyroscope steering needs a secure page: <a href={secureUrl}>open the secure version</a> (your browser will warn about the self-signed certificate; choose to continue).</p>}
      </div>
    </Shell>
  );
}

const Shell = ({ children }) => <div className="shell">{children}</div>;
const Hint = ({ room }) => <div className="hint">{room ? `Room ${room.code} · ` : ''}Esc to leave · M to mute · Mouse: move + hold left button</div>;
