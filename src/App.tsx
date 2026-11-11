import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Game from './Game';
import { connect } from './net';
import { ROLES, ROLE_IDS, MUT_IDS, MUTATORS, BOSS_NAMES } from '../shared/sim';
import { loadoutOf } from '../shared/catalog';
import { dailyInfo } from '../shared/daily';
import { cotdInfo, weekBossInfo } from '../shared/fun';
import { ratingOf } from '../shared/leaderboard';
import { levelOf, ACHIEVEMENTS } from '../shared/progress';
import { EVENTS, activeEvent, nextEvent } from '../shared/events';
import * as store from './profile';
import AuthScreen from './AuthScreen';
import GiftCard from './GiftCard';
import Admin from './Admin';
import { IS_TOUCH, enterFullscreen, toggleFullscreen, lockLandscape } from './util';
import { reloadApp, isStandalone } from './pwa';
import { settings } from './settings';
import { theme, initTheme, setEventMode } from './theme';
import { loadActivePack } from './packs';
import { saveReplay } from './replaystore';
import { Attract, ShipView, shipOpts, Keys } from './ui';
import Shop from './Shop';
import Leaderboard from './Leaderboard';
import PackEditor from './PackEditor';
import Settings from './SettingsScreen';
import Achievements from './Achievements';
import Replays from './Replays';
import { installFromGallery } from './Gallery';
import { RoomBrowser, Lobby, MutatorChips, mutBonusText } from './Rooms';

initTheme(); // pick the seasonal theme before anything draws

const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// Shows which seasonal theme is active and lets the player force one or switch events off.
function EventBar({ mode, onPick }: Record<string, any>) {
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

function RotateNotice() {
  return (
    <div className="rotate-notice" role="alert">
      <div className="rn-phone" aria-hidden="true" />
      <b>Rotate your phone</b>
      <span>Chicken Blasters plays in landscape</span>
    </div>
  );
}
const Shell = ({ children, gaming, menu }: { children?: any; gaming?: boolean; menu?: boolean }) => <div className={'shell' + (gaming ? ' gaming' : '') + (menu ? ' menu-shell' : '')}>{children}<RotateNotice /></div>;

export default function App() {
  const urlRoom = useMemo(() => (new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, 4), []);
  const urlPack = useMemo(() => { const p = new URLSearchParams(location.search).get('pack') || ''; return /^[a-f0-9]{10}$/.test(p) ? p : ''; }, []);
  const [screen, setScreen] = useState('menu');
  const [name, setName] = useState(() => ls.get('cb-name', 'Pilot'));
  const [role, setRole] = useState(() => { const r = ls.get('cb-role', 'ace'); return ROLE_IDS.includes(r) ? r : 'ace'; });
  const [muts, setMuts] = useState(() => { try { return JSON.parse(ls.get('cb-mut', '[]')).filter((m) => MUT_IDS.includes(m)); } catch { return []; } });
  const [code, setCode] = useState(urlRoom);
  const [room, setRoom] = useState(null);
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  const [profile, setProfile] = useState<any>(store.offlineProfile);
  // undefined = checking, null = signed out, { offline } = server unreachable (single player still works, unrecorded)
  const [user, setUser] = useState<(store.AccountUser & { offline?: boolean }) | null | undefined>(undefined);
  const [evMode, setEvMode] = useState(theme.mode);
  const [daily, setDaily] = useState(() => dailyInfo(new Date()));
  const cotd = useMemo(() => cotdInfo(new Date()), []);
  const weekBoss = useMemo(() => weekBossInfo(new Date()), []);
  const [runCfg, setRunCfg] = useState(null);
  const [replay, setReplay] = useState(null);
  const [toast, setToast] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const [packOffer, setPackOffer] = useState(urlPack);
  const net = useRef(null);
  const runRef = useRef(null);
  const cfgRef = useRef(null);
  const nameRef = useRef(name);
  nameRef.current = name;
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const rejoinRef = useRef(null);
  const leavingRef = useRef(false);
  const reconnectTimer = useRef(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 6000);
  }, []);

  const refresh = useCallback(() => store.loadProfile().then(setProfile).catch((e) => {
    if (e instanceof store.AuthError) setUser(null); else setProfile(store.offlineProfile());
  }), []);
  useEffect(() => {
    fetch('/api/info').then((r) => r.json()).then(setInfo).catch(() => {});
    store.getDaily().then(setDaily).catch(() => {}); // the server's calendar is the authority
    store.me().then((u) => { setUser(u); if (u) { refresh(); setName((n) => (n === 'Pilot' ? u.username : n)); } }).catch(() => { setUser({ username: 'Guest', offline: true }); setProfile(store.offlineProfile()); });
  }, [refresh]);
  const signedIn = (u: store.AccountUser) => { setUser(u); setName(u.username); setProfile(store.offlineProfile()); refresh(); };
  const signOut = async () => { try { await store.logout(); } catch { /* cookie may already be gone */ } setUser(null); setProfile(store.offlineProfile()); setScreen('menu'); };
  useEffect(() => { // phones: ask for landscape right away and again on the first tap (some browsers need a gesture)
    if (!IS_TOUCH) return;
    lockLandscape();
    window.addEventListener('pointerdown', lockLandscape, { once: true });
    return () => window.removeEventListener('pointerdown', lockLandscape);
  }, []);
  useEffect(() => { loadActivePack(); }, []); // the pack picked last time

  const loadout = useMemo(() => loadoutOf(profile), [profile]);
  const gameLoadout = useMemo(() => ({ ...loadout, role }), [loadout, role]);
  const pickEvent = (m) => { setEventMode(m); setEvMode(m); };
  const pickRole = (r) => { setRole(r); ls.set('cb-role', r); };
  const pickMuts = (m) => { setMuts(m); ls.set('cb-mut', JSON.stringify(m)); };
  const lv = levelOf(profile.xp);

  // ---------------- single-player runs (solo / daily / boss rush) ----------------
  const startRun = async (kind) => {
    if (settings.fullscreen) enterFullscreen(); // needs the tap that started the run
    ls.set('cb-name', name);
    const wantMut = kind === 'solo' ? muts : [];
    let cfg;
    try { const r = await store.startRun(kind, wantMut); cfg = { kind, seed: r.seed, mut: r.mut, event: r.event, runId: r.runId, weekly: r.weekly ? { boss: r.weekly.boss, rule: r.weekly.rule } : null, cotd: cotd.index }; }
    catch { // offline: still playable, just not recorded
      const d = dailyInfo(new Date());
      cfg = { kind, seed: kind === 'daily' ? d.seed : kind === 'weekboss' ? weekBoss.seed : null, mut: kind === 'daily' ? d.mut : kind === 'weekboss' ? [] : wantMut, event: null, runId: null, weekly: kind === 'weekboss' ? { boss: weekBoss.boss, rule: weekBoss.rule } : null, cotd: cotd.index };
    }
    runRef.current = cfg.runId; cfgRef.current = cfg;
    setRunCfg(cfg);
    setScreen('single');
  };
  const announce = useCallback((res) => {
    if (!res) return;
    const parts = [];
    for (const id of res.unlocked || []) parts.push('🏆 ' + (ACHIEVEMENTS.find((a) => a.id === id)?.name || id));
    if (res.dailyDone) parts.push('⭐ Daily complete: +🔑 ' + res.dailyReward);
    if (res.weekBossDone) parts.push('🗓 Weekly boss beaten: +🔑 ' + res.weekBossReward);
    if ((res.goalsDone || []).length) parts.push('🎯 Weekly goal done');
    if (res.levelUp) parts.push('⬆ Level up!');
    if (parts.length) showToast(parts.join('  ·  '));
  }, [showToast]);
  const onRunEnd = useCallback(({ keys, wave, over, score, kills, stats, won }) => {
    const id = runRef.current;
    runRef.current = null;
    const cfg = cfgRef.current;
    if (over && cfg) store.startRun(cfg.kind, cfg.mut).then((r) => { runRef.current = r.runId; }).catch(() => {}); // the player may restart
    if (id) store.endRun(id, { keys, wave, score, kills, stats, won, name: nameRef.current }).then((j) => { setProfile(j.profile); announce(j.result); }).catch(() => {});
  }, [announce]);
  const onSaveReplay = useCallback(async (rec) => {
    try { await saveReplay(rec); showToast('💾 Replay saved: find it under Replays'); } catch { showToast('Could not save the replay'); }
  }, [showToast]);
  const exitRun = useCallback(() => { setScreen('menu'); setTimeout(refresh, 300); }, [refresh]);

  // ---------------- multiplayer: rooms, spectating, reconnect ----------------
  const leave = useCallback(() => {
    leavingRef.current = true;
    clearTimeout(reconnectTimer.current);
    setReconnecting(false);
    net.current?.send({ t: 'leave' });
    net.current?.close();
    net.current = null; rejoinRef.current = null;
    setRoom(null);
    setScreen('menu');
    setTimeout(refresh, 400); // keys from the run are credited by the server on leave
  }, [refresh]);

  const giveUp = useCallback((msg) => {
    clearTimeout(reconnectTimer.current);
    setReconnecting(false);
    net.current = null; rejoinRef.current = null;
    setRoom(null); setScreen('menu');
    if (msg) showToast(msg);
  }, [showToast]);

  // A dropped connection keeps the seat on the server for 30 seconds: knock again until it lets us back in.
  const startReconnect = useCallback(() => {
    const info0 = rejoinRef.current, t0 = Date.now();
    setReconnecting(true);
    const attempt = () => {
      if (leavingRef.current) return;
      if (Date.now() - t0 > 26000) return giveUp('Connection lost: your seat was released');
      let ok = false;
      const n = connect({
        onOpen: (c) => c.send({ t: 'rejoin', room: info0.code, token: info0.token }),
        onMessage: (m) => {
          if (m.t === 'room') {
            ok = true; net.current = n; rejoinRef.current = { code: m.code, token: m.token };
            setRoom(m); setReconnecting(false);
            setScreen(m.phase === 'playing' ? 'multi' : 'lobby');
          } else if (m.t === 'error' && m.fatal) giveUp('Could not get your seat back');
        },
        onClose: () => { if (!ok && !leavingRef.current) reconnectTimer.current = setTimeout(attempt, 1500); },
      });
    };
    attempt();
  }, [giveUp]);

  const connectRoom = (msg) => {
    if (settings.fullscreen) enterFullscreen();
    ls.set('cb-name', name); ls.set('cb-role', role);
    leavingRef.current = false;
    net.current?.close();
    const n = connect({
      onOpen: (c) => c.send({ ...msg, name, role }),
      onMessage: (m) => {
        if (m.t === 'error') { showToast(m.msg); n.close(); if (net.current === n) net.current = null; return; }
        if (m.t === 'room') {
          rejoinRef.current = m.spectator ? null : { code: m.code, token: m.token };
          setRoom(m);
          setScreen(m.phase === 'playing' ? (m.spectator ? 'spectate' : 'multi') : 'lobby');
        }
      },
      onClose: () => {
        if (net.current !== n || leavingRef.current) return;
        if (rejoinRef.current && screenRef.current === 'multi') { startReconnect(); return; }
        net.current = null; setRoom(null); setScreen('menu'); showToast('Disconnected from the room');
      },
    });
    net.current = n;
  };
  const joinByCode = () => connectRoom({ t: 'join', room: code });
  const quickPlay = () => connectRoom({ t: 'quick' });
  const createRoom = (settingsForm) => connectRoom({ t: 'join', create: true, settings: settingsForm });
  const joinFromList = (rc, password, spectate) => connectRoom({ t: 'join', room: rc, password, spectate });

  const base = location.origin; // share links
  const secureUrl: string | null = null; // the site is served over https in production, so motion sensors just work
  const lan: string[] = [];

  const toastEl = toast ? <div className="toastbar" role="status" onClick={() => setToast('')}>{toast}</div> : null;

  // ---------------- screens ----------------
  if (user === undefined) return <Shell><Attract /><p className="sub" style={{ position: 'relative', zIndex: 1 }}>Loading…</p></Shell>;
  if (user === null) return <Shell><Attract /><AuthScreen onDone={signedIn} />{toastEl}</Shell>;

  if (screen === 'single' && runCfg)
    return <Shell gaming><Game mode="single" name={name} loadout={gameLoadout} run={runCfg} onRunEnd={onRunEnd} onSaveReplay={onSaveReplay} onExit={exitRun} secureUrl={secureUrl} />{toastEl}</Shell>;
  if ((screen === 'multi' || screen === 'spectate') && room && net.current?.state)
    return (
      <Shell gaming>
        <Game mode={screen === 'spectate' ? 'spectate' : 'multi'} net={net.current} onExit={leave} secureUrl={secureUrl} />
        {reconnecting && <div className="reconnect"><div><b>Connection lost</b><p>Holding your seat… reconnecting automatically.</p><button className="ghost" onClick={leave}>Give up</button></div></div>}
        {toastEl}
      </Shell>
    );
  if (screen === 'replay' && replay)
    return <Shell gaming><Game mode="replay" name={replay.meta.name} replay={replay} onExit={() => setScreen('replays')} /></Shell>;

  if (screen === 'shop')
    return <Shell><Attract /><Shop profile={profile} setProfile={setProfile} event={info && 'event' in info ? info.event : activeEvent()} onBack={() => { setScreen('menu'); refresh(); }} />{toastEl}</Shell>;
  if (screen === 'board')
    return <Shell><Attract /><Leaderboard profile={profile} daily={daily} onBack={() => { setScreen('menu'); refresh(); }} /></Shell>;
  if (screen === 'packs')
    return <Shell><Attract /><PackEditor onBack={() => setScreen('menu')} /></Shell>;
  if (screen === 'settings')
    return <Shell><Attract /><Settings onBack={() => setScreen('menu')} /></Shell>;
  if (screen === 'gift')
    return <Shell><Attract /><GiftCard profile={profile} setProfile={setProfile} onBack={() => { setScreen('menu'); refresh(); }} /></Shell>;
  if (screen === 'admin' && user.admin)
    return <Shell><Attract /><Admin onBack={() => setScreen('menu')} /></Shell>;
  if (screen === 'ach')
    return <Shell><Attract /><Achievements profile={profile} setProfile={setProfile} onBack={() => setScreen('menu')} /></Shell>;
  if (screen === 'replays')
    return <Shell><Attract /><Replays onBack={() => setScreen('menu')} onPlay={(rep) => { if (settings.fullscreen) enterFullscreen(); setReplay(rep); setScreen('replay'); }} />{toastEl}</Shell>;
  if (screen === 'rooms')
    return <Shell><Attract /><RoomBrowser name={name} onBack={() => setScreen('menu')} onJoin={joinFromList} onQuick={quickPlay} onCreate={createRoom} />{toastEl}</Shell>;

  if (screen === 'lobby' && room) {
    const link = `${base}/?room=${room.code}`;
    return (
      <Shell>
        <Attract />
        <Lobby
          room={room} link={link} copied={copied}
          onCopy={() => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
          onStart={() => { if (settings.fullscreen) enterFullscreen(); net.current.send({ t: 'start' }); }}
          onSettings={(s) => net.current.send({ t: 'settings', settings: s })}
          onLeave={leave}
        />
        {toastEl}
      </Shell>
    );
  }

  const doneToday = profile.life.lastDaily === daily.id;
  const newAch = (profile.achNew || []).length;
  const bestRating = Math.max(...['solo', 'online', 'daily', 'rush'].map((m) => ratingOf(profile.rec?.[m] || { top: [] })));
  return (
    <Shell menu>
      <Attract />
      <main className="mm">
        <header className="mm-top">
          <div className="mm-brand">
            <h1>🐔 Chicken Blasters</h1>
            <p className="sub">Original co-op space shooter</p>
          </div>
          <div className="mm-user">
            <div className="chiprow">
              <Keys n={profile.keys} />
              <span className="keychip rating" title="Average of your best five runs">★ {bestRating}</span>
              <span className="keychip lvl" title={`${lv.into} / ${lv.need} XP`}>Lv {lv.level}{profile.title ? ' · ' + profile.title : ''}</span>
            </div>
            <span className="sub mm-who">Signed in as <b>{user.username}</b>{!user.offline && <> · <button className="linklike" onClick={signOut}>Sign out</button></>}</span>
          </div>
        </header>

        {packOffer && (
          <div className="packoffer">
            <span>A friend shared a resource pack with you.</span>
            <button className="small" onClick={() => installFromGallery(packOffer, true).then((p) => { showToast('Installed "' + p.name + '" and switched to it'); setPackOffer(''); history.replaceState(null, '', location.pathname); }).catch((e) => showToast(e.message))}>Install &amp; use</button>
            <button className="ghost small" onClick={() => { setPackOffer(''); history.replaceState(null, '', location.pathname); }}>Dismiss</button>
          </div>
        )}

        <div className="mm-body">
          <section className="mm-col mm-play" aria-label="Play">
            <h2 className="mm-h">Play</h2>
            <div className="playbox big">
              <button className="mm-primary" onClick={() => startRun('solo')}>
                Single player{muts.length ? ` (${muts.length} rule${muts.length === 1 ? '' : 's'})` : ''}
                <small>Fly solo through endless waves and bosses</small>
              </button>
              <button className="alt" onClick={() => startRun('daily')} title="Same seeded run for everyone today">
                ⭐ Daily challenge{doneToday ? ' ✓' : ''}
                <small>{daily.mut.map((m) => MUTATORS[m].name).join(' + ')} · {doneToday ? 'reward claimed today' : '+🔑 ' + daily.reward + ' reward'}</small>
              </button>
              <button className="alt2" onClick={() => startRun('rush')} title="Fight the bosses back to back">
                👑 Boss rush<small>Only bosses, one after another</small>
              </button>
              <button className="alt3" onClick={() => startRun('weekboss')} title="One boss and one special rule for the whole week">
                🗓 Weekly boss: {BOSS_NAMES[weekBoss.boss]}{profile.life.lastWeekBoss === weekBoss.id ? ' ✓' : ''}
                <small>{weekBoss.ruleName}: {weekBoss.ruleDesc} {profile.life.lastWeekBoss === weekBoss.id ? '· reward claimed this week' : '· +🔑 ' + weekBoss.reward + ' for the first win'}</small>
              </button>
            </div>
            <div className="cotd" title="Kills of this costume score +50 all day">
              <span className="cotd-icon">{cotd.icon}</span>
              <div><b>Chicken of the day: {cotd.name}</b><span className="sub tiny">{cotd.fact} Shoot the ★ chickens wearing this costume for +{cotd.bonus} each.</span></div>
            </div>
            <details className="muts">
              <summary>Mutators for single player ({mutBonusText(muts.length)})</summary>
              <MutatorChips value={muts} onChange={pickMuts} />
              <p className="sub tiny">Each rule makes the run harder and pays more. Daily challenge rules are fixed for the day.</p>
            </details>
            <EventBar mode={evMode} onPick={pickEvent} />

            <h2 className="mm-h">Co-op online</h2>
            <div className="playbox two">
              <button onClick={quickPlay}>⚡ Quick play</button>
              <button className="ghost" onClick={() => setScreen('rooms')}>Rooms &amp; create</button>
            </div>
            {urlRoom && <p className="sub">Invited to room <b>{urlRoom}</b> — tap Join.</p>}
            <div className="row">
              <input placeholder="ROOM CODE" value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              <button disabled={code.length !== 4} onClick={joinByCode}>Join</button>
            </div>
            {lan.length > 0 && <p className="sub">LAN address: {lan.join('  ')}</p>}
          </section>

          <section className="mm-col mm-pilot" aria-label="Pilot">
            <h2 className="mm-h">Your pilot</h2>
            <div className="mm-ship">
              <ShipView opts={shipOpts(loadout)} size={170} />
              <label>Pilot name <input value={name} maxLength={14} onChange={(e) => setName(e.target.value)} /></label>
              {profile.pending > 0 && <button className="small" disabled={!!profile.offline} onClick={() => store.claim().then((r) => setProfile(r.profile)).catch(() => {})}>Claim 🔑 {profile.pending}</button>}
            </div>
            <span className="sub tiny">Choose your role (used in solo and co-op)</span>
            <div className="roles">
              {ROLE_IDS.map((id) => (
                <button key={id} className={'rolecard' + (role === id ? ' on' : '')} style={{ ['--rc' as any]: ROLES[id].color }} onClick={() => pickRole(id)}>
                  <span className="rolebadge" style={{ background: ROLES[id].color }}>{ROLES[id].icon}</span>
                  <b>{ROLES[id].name}</b>
                  <span className="sub tiny">{ROLES[id].desc}</span>
                </button>
              ))}
            </div>
          </section>

          <nav className="mm-col mm-nav" aria-label="More">
            <h2 className="mm-h">Menu</h2>
            <div className="menugrid">
              <button className="ghost" onClick={() => setScreen('shop')}><span className="mi">🛒</span>Shop</button>
              <button className="ghost" onClick={() => setScreen('board')}><span className="mi">🏅</span>Leaderboard</button>
              <button className="ghost" onClick={() => setScreen('ach')}><span className="mi">🏆</span>Goals{newAch ? <b className="badge">{newAch}</b> : null}</button>
              <button className="ghost" onClick={() => setScreen('packs')}><span className="mi">🎨</span>Packs</button>
              <button className="ghost" onClick={() => setScreen('replays')}><span className="mi">⏪</span>Replays</button>
              <button className="ghost" onClick={() => setScreen('settings')}><span className="mi">⚙</span>Settings</button>
              <button className="ghost" disabled={!!user.offline} onClick={() => setScreen('gift')}><span className="mi">🎁</span>Gift card</button>
              {user.admin && <button className="ghost" onClick={() => setScreen('admin')}><span className="mi">🛠</span>Admin</button>}
              <button className="ghost" onClick={toggleFullscreen}><span className="mi">⛶</span>Full screen</button>
              <button className={'ghost' + (isStandalone() ? ' accent' : '')} onClick={() => reloadApp(true)} title="Fetch the latest version and restart the game"><span className="mi">↻</span>Reload app</button>
            </div>
            <p className="sub tiny">Keyboard: WASD / arrows + Space · Ability: E / Shift / right-click · Mouse: move to steer, hold left button to fire · F fullscreen · M mute · P pause · Esc leave · Touch: drag on the left half of the screen to steer</p>
            <p className="sub tiny">Co-op: fly over a downed teammate for 1.5s to revive them (medics are twice as fast).</p>
          </nav>
        </div>
      </main>
      {toastEl}
    </Shell>
  );
}
