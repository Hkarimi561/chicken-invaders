import { useEffect, useRef, useState } from 'react';
import { W, H, createState, addPlayer, step, setInput, emptyInput, ROLES } from '../shared/sim';
import { newReplay, recordInput, replayStart, replayTick, MAX_REPLAY_TICKS } from '../shared/replay';
import { draw } from './render';
import { resetFx, timeScale } from './fx';
import * as sfx from './audio';
import { quality, IS_TOUCH, toggleFullscreen, exitFullscreen } from './util';
import { pack } from './packs';
import { theme } from './theme';
import { settings, STICK_PX } from './settings';
import { screenTilt, tiltToTarget, gyroSupport } from './gyro';
import { EMOTES, showEmote, clearEmotes } from './emotes';

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'fire',
  KeyE: 'ab', ShiftLeft: 'ab', ShiftRight: 'ab',
};
// Phones start one quality step down; a device that can't keep up is lowered further (and remembered).
function initialQuality() {
  const def = IS_TOUCH ? 1 : 2;
  let saved = NaN;
  try { saved = Number(localStorage.getItem('cb-q')); } catch { /* private mode */ }
  return Number.isInteger(saved) && saved >= 0 && saved <= 2 ? Math.min(saved, def) : def;
}

// Touch controls. The joystick is *floating*: put your thumb anywhere on that half of the screen and the stick
// appears right under it (steer by dragging, lift to hide it). It keeps no React state: the knob moves with a
// transform and the centre is the touch point, so dragging never triggers a re-render or a layout.
function Controls({ apply, stick, skillRef }: { apply: (patch: Record<string, any>) => void; stick: boolean; skillRef: any }) {
  const zoneEl = useRef(null), baseEl = useRef(null), knobEl = useRef(null);
  const g = useRef({ id: -1, cx: 0, cy: 0, m: 65, dir: '' });
  const size = STICK_PX[settings.stickSize] || 130;
  const swap = settings.swapSides;

  const move = (e) => {
    const s = g.current;
    let dx = e.clientX - s.cx, dy = e.clientY - s.cy;
    const d = Math.hypot(dx, dy);
    if (d > s.m) { dx *= s.m / d; dy *= s.m / d; }
    knobEl.current.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
    const dz = s.m * 0.25;
    const l = +(dx < -dz), r = +(dx > dz), u = +(dy < -dz), dn = +(dy > dz);
    const dir = '' + l + r + u + dn;
    if (dir !== s.dir) { s.dir = dir; apply({ left: l, right: r, up: u, down: dn, tx: null, ty: null }); }
  };
  const begin = (e) => {
    if (e.pointerType === 'mouse' || g.current.id !== -1) return;
    const zr = zoneEl.current.getBoundingClientRect(), m = size / 2;
    g.current = { id: e.pointerId, cx: e.clientX, cy: e.clientY, m, dir: '' };
    const b = baseEl.current;
    b.style.display = 'block'; b.style.left = e.clientX - zr.left - m + 'px'; b.style.top = e.clientY - zr.top - m + 'px';
    knobEl.current.style.transform = 'translate3d(0,0,0)';
    capture(zoneEl.current, e.pointerId);
  };
  const end = (e) => {
    if (e && e.pointerId !== g.current.id) return;
    g.current.id = -1; g.current.dir = '';
    if (baseEl.current) baseEl.current.style.display = 'none';
    apply({ left: 0, right: 0, up: 0, down: 0 });
  };

  return (
    <div className={'controls' + (swap ? ' swap' : '')} style={{ ['--op' as any]: settings.controlOpacity, ['--stick' as any]: size + 'px' }}>
      {stick !== false && (
        <div ref={zoneEl} className="stick-zone" onPointerDown={begin} onPointerMove={(e) => { if (e.pointerId === g.current.id) move(e); }} onPointerUp={end} onPointerCancel={end}>
          <div className="stick-hint" />
          <div ref={baseEl} className="stick-float"><div ref={knobEl} className="knob" /></div>
        </div>
      )}
      <div className="btns">
        <div ref={skillRef} className="btn-skill" data-label="SKILL" onPointerDown={(e) => { capture(e.currentTarget, e.pointerId); apply({ ab: 1 }); }} onPointerUp={() => apply({ ab: 0 })} onPointerCancel={() => apply({ ab: 0 })} />
        {!settings.autoFire && (
          <div className="fire" onPointerDown={(e) => { capture(e.currentTarget, e.pointerId); apply({ fire: 1 }); }} onPointerUp={() => apply({ fire: 0 })} onPointerCancel={() => apply({ fire: 0 })}>FIRE</div>
        )}
      </div>
    </div>
  );
}

// Pointer capture keeps a drag alive outside its element; a refused capture must never break the touch itself.
const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* unknown pointer */ } };

const fmtTime = (ticks) => { const s = Math.floor(ticks / 60); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

/**
 * mode 'single'   local simulation (solo / daily / boss rush) with replay recording
 * mode 'multi'    server snapshots + local prediction
 * mode 'spectate' watch a live room (no input)
 * mode 'replay'   deterministic playback of a recorded run
 */
export default function Game({ mode, net, onExit, name, loadout, run, replay, onRunEnd, onSaveReplay, secureUrl }: Record<string, any>) {
  const cv = useRef<HTMLCanvasElement>(null);
  const amb = useRef<HTMLCanvasElement>(null); // blurred colour wash that fills the screen around the 4:3 play field
  const stage = useRef(null);
  const skillRef = useRef(null);
  const api = useRef<{ apply: (patch: Record<string, any>) => void; restartReplay: () => void; emote: (i: number) => void }>({ apply: () => {}, restartReplay: () => {}, emote: () => {} });
  const [emoteOpen, setEmoteOpen] = useState(false);
  const runEnd = useRef(onRunEnd);
  runEnd.current = onRunEnd;
  const saveRef = useRef(onSaveReplay);
  saveRef.current = onSaveReplay;
  const loadKey = JSON.stringify(loadout || {});
  const runKey = JSON.stringify(run || {});
  const [muted, setMuted] = useState(sfx.isMuted());
  const [ping, setPing] = useState(null);
  const [gyroOn, setGyroOn] = useState(false);
  const [gyroNote, setGyroNote] = useState(null); // { text, link? }
  const [rp, setRp] = useState({ paused: false, speed: 1, tick: 0, done: false });
  const [overInfo, setOverInfo] = useState(null); // { canSave } once a single-player run has ended
  const recenter = useRef(false);
  const noteTimer = useRef<any>(null);
  const rpRef = useRef({ paused: false, speed: 1 });
  const recRef = useRef(null);
  const isReplay = mode === 'replay', isSpectate = mode === 'spectate', single = mode === 'single';

  useEffect(() => {
    let ambFrame = 0; let ambCtx: CanvasRenderingContext2D | null = null;
    // alpha:false = cheaper compositing; desynchronized = lower input-to-photon latency where supported
    const ctx = cv.current.getContext('2d', { alpha: false, desynchronized: true });
    const pix = pack.opts.pixel || 1; // pixel-art packs render at a lower resolution and scale up
    const input = { ...emptyInput() };
    let s = null, me = null, paused = false, reported = false, pingTimer = null, cur = null, ticks = 0, lastRpUi = 0;
    const cfg = JSON.parse(runKey);
    const autoFire = settings.autoFire && !isReplay && !isSpectate;

    resetFx(); clearEmotes();
    sfx.init();
    sfx.setEvent(theme.event);
    if (!isReplay) sfx.startMusic();

    // Dev helper: /?wave=9 starts single player at that wave (handy to preview vest tiers).
    const startWave = single ? Math.max(1, Number(new URLSearchParams(location.search).get('wave')) || 1) : 1;
    const fresh = () => {
      const seed = cfg.seed ?? ((Math.random() * 1e9) >>> 0);
      const opts = { mut: cfg.mut, rush: cfg.kind === 'rush', daily: cfg.kind === 'daily', event: cfg.event ?? null, weekly: cfg.weekly ?? null, cotd: cfg.cotd ?? null };
      s = createState(seed, opts);
      s.wave = startWave - 1; s.cleared = s.wave > 0;
      addPlayer(s, 'me', name || 'You', JSON.parse(loadKey));
      resetFx(); ticks = 0;
      recRef.current = newReplay({ seed, mut: s.mut, rush: s.rush, daily: s.daily, event: s.ev, startWave: s.wave, name: name || 'You', loadout: JSON.parse(loadKey), weekly: s.weekly, cotd: s.cotd });
      setOverInfo(null);
    };

    if (isReplay) {
      me = 'me';
      const reset = () => { s = replayStart(replay); cur = { i: 0, tick: 0 }; setInput(s, 'me', emptyInput()); resetFx(); setRp((r) => ({ ...r, tick: 0, done: false })); };
      reset();
      api.current.restartReplay = reset;
    } else if (single) { me = 'me'; fresh(); }
    else {
      me = isSpectate ? null : net.id; s = net.state;
      // Blend each snapshot into the locally predicted positions instead of replacing them: a hard replace
      // snaps your ship back by about one round trip of movement, which feels like lag whenever you steer.
      net.onState = (ns) => {
        if (s) {
          for (const id in ns.players) {
            const a = s.players[id], b = ns.players[id];
            if (!a || !b || !a.alive || !b.alive) continue;
            const dx = b.x - a.x, dy = b.y - a.y;
            if (dx * dx + dy * dy < 80 * 80) { const k = id === me ? 0.12 : 0.45; b.x = a.x + dx * k; b.y = a.y + dy * k; }
          }
        }
        s = ns;
      };
      net.onPing = (ms) => setPing(Math.round(ms));
      net.ping();
      pingTimer = setInterval(() => net.ping(), 2000);
    }

    // Single player: tell the server what this run achieved (online keys/scores are counted server-side).
    const report = () => {
      if (!single || reported || !s) return;
      const me0 = s.players.me;
      const keys = me0?.keys || 0, score = me0?.score || 0;
      if (!s.over && keys === 0 && score === 0) return;
      reported = true;
      runEnd.current?.({ keys, wave: s.wave, over: !!s.over, score, kills: me0?.kills || 0, stats: me0?.st, kind: cfg.kind || 'solo', won: !!s.won, rec: recRef.current });
    };

    const readOnly = isReplay || isSpectate;
    const pushInput = () => { if (!single && !readOnly) net.send({ t: 'input', input: { ...input } }); };
    api.current.apply = (patch) => {
      if (readOnly) return;
      let changed = false;
      for (const k in patch) if (input[k] !== patch[k]) { input[k] = patch[k]; changed = true; }
      if (changed) pushInput();
    };
    if (autoFire) api.current.apply({ fire: 1 });

    const setKey = (e, v) => {
      const k = KEYS[e.code];
      if (!k) return;
      e.preventDefault();
      if (k === 'fire' && autoFire) return; // auto-fire keeps the trigger down
      // pressing a movement key hands steering back from the mouse to the keyboard
      api.current.apply(v && k !== 'fire' && k !== 'ab' ? { [k]: v, tx: null, ty: null } : { [k]: v });
    };
    const sendEmote = (i) => {
      const id = EMOTES[i]?.id;
      if (!id || readOnly) return;
      if (single) showEmote('me', id); else net.send({ t: 'emote', id });
    };
    api.current.emote = sendEmote;
    const down = (e) => {
      sfx.init();
      const ei = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
      if (ei >= 0) sendEmote(ei);
      if (e.code === 'Escape') return onExit();
      if (e.code === 'KeyM') { const m = !sfx.isMuted(); sfx.setMuted(m); setMuted(m); }
      if (e.code === 'KeyF') toggleFullscreen();
      if (e.code === 'KeyP' && (single || isReplay)) { if (isReplay) { rpRef.current.paused = !rpRef.current.paused; setRp((r) => ({ ...r, paused: rpRef.current.paused })); } else paused = !paused; }
      if (e.code === 'Enter' && s?.over && !readOnly) { if (single) { report(); reported = false; fresh(); } else net.send({ t: 'restart' }); }
      setKey(e, 1);
    };
    const up = (e) => setKey(e, 0);
    const unlock = () => sfx.init();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('pointerdown', unlock);

    // Mouse: the ship glides to the cursor; hold the left button to fire, right button for the ability.
    const el = cv.current;
    let lastSend = 0;
    const toLogical = (e) => {
      const r = el.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
    };
    const mouseMove = (e) => {
      if (e.pointerType !== 'mouse' || readOnly) return;
      const [x, y] = toLogical(e);
      input.tx = Math.max(0, Math.min(W, x)); input.ty = Math.max(0, Math.min(H, y));
      const now = performance.now();
      if (now - lastSend > 33) { lastSend = now; pushInput(); }
    };
    const mouseDown = (e) => {
      if (e.pointerType !== 'mouse' || readOnly) return;
      sfx.init(); mouseMove(e);
      if (e.button === 0 && !autoFire) api.current.apply({ fire: 1 });
      if (e.button === 2) api.current.apply({ ab: 1 });
    };
    const mouseUp = (e) => {
      if (e.pointerType !== 'mouse' || readOnly) return;
      if (e.button === 0 && !autoFire) api.current.apply({ fire: 0 });
      if (e.button === 2) api.current.apply({ ab: 0 });
    };
    const noMenu = (e) => e.preventDefault();
    el.addEventListener('pointermove', mouseMove);
    el.addEventListener('pointerdown', mouseDown);
    el.addEventListener('contextmenu', noMenu);
    window.addEventListener('pointerup', mouseUp);

    // Adaptive quality: if frames keep taking too long on this device, drop effects and remember the choice.
    quality.level = initialQuality();
    let last = performance.now(), acc = 0, raf, ema = 16.7, frames = 0, lastChange = 0, moodKey = '', lastP = -1, lastReady = false;
    const frame = (now) => {
      const rawMs = now - last;
      const real = Math.min(0.1, rawMs / 1000); last = now;
      if (rawMs < 250 && ++frames > 40) { // ignore warm-up and tab-switch spikes
        ema = ema * 0.92 + rawMs * 0.08;
        if (ema > 26 && quality.level > 0 && now - lastChange > 1500) {
          quality.level--; lastChange = now; ema = 16.7;
          if (IS_TOUCH) { try { localStorage.setItem('cb-q', String(quality.level)); } catch { /* ignore */ } }
        }
      }
      if (s) {
        if (isReplay) {
          const sp = rpRef.current.speed;
          acc += rpRef.current.paused ? 0 : real * sp;
          let n = 0;
          while (acc >= 1 / 60 && n < 3 * sp && !s.over && cur.tick < replay.ticks) { replayTick(s, replay, cur); acc -= 1 / 60; n++; }
          if (acc > 1 / 60) acc = 0;
          if (now - lastRpUi > 120) {
            lastRpUi = now;
            const done = s.over || cur.tick >= replay.ticks;
            setRp((r) => (r.tick === cur.tick && r.done === done ? r : { ...r, tick: cur.tick, done }));
          }
        } else {
          acc += real * (single ? timeScale(real) : 1); // hit-stop / slow-mo (single player only)
          if (!isSpectate) setInput(s, me, { ...input });
          let n = 0;
          while (acc >= 1 / 60 && n < 3) {
            if (!paused) {
              if (single && recRef.current && ticks < MAX_REPLAY_TICKS) { recordInput(recRef.current, ticks, input); recRef.current.ticks = ticks + 1; }
              step(s, 1 / 60); ticks++;
            }
            acc -= 1 / 60; n++;
          }
          if (acc > 1 / 60) acc = 0; // slow device: drop the backlog instead of spiralling into ever more catch-up steps
        }
        const bossOn = s.chickens.some((c) => c.boss);
        const mk = s.wave + (bossOn ? 'b' : '');
        if (mk !== moodKey) { moodKey = mk; sfx.setMood({ wave: s.wave, boss: bossOn }); }
        // touch ability button: charge ring + ready glow, written straight to the DOM (no re-render)
        const sk = skillRef.current, mp = me && s.players[me];
        if (sk && mp) {
          const p = Math.floor(mp.charge || 0), ready = p >= 100;
          if (p !== lastP) { lastP = p; sk.style.setProperty('--p', p); }
          if (ready !== lastReady) { lastReady = ready; sk.classList.toggle('ready', ready); sk.dataset.label = ready ? (ROLES[mp.role] || ROLES.ace).ability.toUpperCase() : 'SKILL'; }
        }
        ctx.setTransform(1 / pix, 0, 0, 1 / pix, 0, 0);
        ctx.imageSmoothingEnabled = pix === 1;
        draw(ctx, s, me, now / 1000, { paused, quiet: isReplay, replay: isReplay });
        if (amb.current && (ambFrame++ % 5 === 0)) { try { ambCtx ??= amb.current.getContext('2d'); ambCtx.drawImage(cv.current, 0, 0, 48, 36); } catch { /* ignore */ } }
        if (single && s.over && !reported) {
          if (recRef.current) { recRef.current.score = s.players.me?.score || 0; recRef.current.wave = s.wave; }
          setOverInfo({ canSave: !!recRef.current && recRef.current.inputs.length > 0 });
        }
        if (s.over) report();
      } else acc = 0;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      report(); // leaving mid-run still banks the keys you picked up
      cancelAnimationFrame(raf);
      sfx.stopMusic();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('pointerup', mouseUp);
      el.removeEventListener('pointermove', mouseMove);
      el.removeEventListener('pointerdown', mouseDown);
      el.removeEventListener('contextmenu', noMenu);
      clearInterval(pingTimer);
      if (net) { net.onState = null; net.onPing = null; }
    };
  }, [mode, net, onExit, name, loadKey, runKey, replay]);

  useEffect(() => () => exitFullscreen(), []); // leaving the game leaves fullscreen too

  // ---- gyroscope steering (phones and tablets): tilt the device to move the ship ----
  const note = (text: string, link?: string) => {
    setGyroNote({ text, link });
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setGyroNote(null), 7000);
  };
  const toggleGyro = async () => {
    if (gyroOn) { setGyroOn(false); try { localStorage.setItem('cb-gyro', '0'); } catch { /* ignore */ } return; }
    const sup = gyroSupport();
    if (sup === 'unsupported') return note('This device has no motion sensor.');
    if (sup === 'insecure') return note('Browsers only allow motion sensors on secure (https) pages.', secureUrl || undefined);
    if (sup === 'needs-permission') { // iOS asks the first time, and only from a tap
      let r = 'denied';
      try { r = await (window.DeviceOrientationEvent as any).requestPermission(); } catch { /* denied */ }
      if (r !== 'granted') return note('Motion access was not allowed. Allow it in your browser settings and try again.');
    }
    recenter.current = true;
    setGyroOn(true);
    try { localStorage.setItem('cb-gyro', '1'); } catch { /* ignore */ }
    return note('Gyro on: the pose you hold now is the centre. Tilt to steer; tap ⟲ to recentre.');
  };
  useEffect(() => { // Android needs no prompt, so remember the choice; iOS must be re-enabled by a tap
    let saved = '0';
    try { saved = localStorage.getItem('cb-gyro') || '0'; } catch { /* ignore */ }
    if (IS_TOUCH && saved === '1' && gyroSupport() === 'ready' && !isReplay && !isSpectate) { recenter.current = true; setGyroOn(true); }
  }, []);
  useEffect(() => {
    if (!gyroOn) return undefined;
    let neutral = null, sx = null, sy = null, last = 0, got = false;
    const onTilt = (e) => {
      if (e.beta == null || e.gamma == null) return;
      got = true;
      const so = window.screen.orientation;
      const angle = so && typeof so.angle === 'number' ? so.angle : (window.orientation || 0);
      const tilt = screenTilt(e.beta, e.gamma, angle);
      if (!neutral || neutral.angle !== angle || recenter.current) { neutral = { ...tilt, angle }; recenter.current = false; sx = null; sy = null; }
      const t = tiltToTarget(tilt, neutral);
      sx = sx == null ? t.tx : sx + (t.tx - sx) * 0.35; // light smoothing against sensor jitter
      sy = sy == null ? t.ty : sy + (t.ty - sy) * 0.35;
      const now = performance.now();
      if (now - last < 33) return; // about 30 updates a second is plenty (and kind to the network)
      last = now;
      api.current.apply({ tx: Math.round(sx), ty: Math.round(sy) });
    };
    window.addEventListener('deviceorientation', onTilt);
    const watchdog = setTimeout(() => { if (!got) note('No motion data arrived. Check that motion sensors are allowed for this site.'); }, 2500);
    return () => { window.removeEventListener('deviceorientation', onTilt); clearTimeout(watchdog); api.current.apply({ tx: null, ty: null }); };
  }, [gyroOn]);

  const pix = pack.opts.pixel || 1;
  const toggleMute = () => { const m = !sfx.isMuted(); sfx.setMuted(m); setMuted(m); };
  const setSpeed = (sp) => { rpRef.current.speed = sp; setRp((r) => ({ ...r, speed: sp })); };
  const togglePause = () => { rpRef.current.paused = !rpRef.current.paused; setRp((r) => ({ ...r, paused: rpRef.current.paused })); };
  const restartReplay = () => { rpRef.current.paused = false; setRp((r) => ({ ...r, paused: false })); api.current.restartReplay(); };
  const touchPlay = IS_TOUCH && !isReplay && !isSpectate;

  return (
    <div className="stage full" ref={stage}>
      <canvas ref={amb} width={48} height={36} className="ambient" aria-hidden="true" />
      <canvas ref={cv} width={Math.round(W / pix)} height={Math.round(H / pix)} className={pix > 1 ? 'game pixelated' : 'game'} />
      <div className="tools">
        {(mode === 'multi' || isSpectate) && (
          <span className={'ping ' + (ping == null ? '' : ping < 60 ? 'good' : ping < 130 ? 'ok' : 'bad')} title="Round-trip time to the server">
            ● {ping == null ? '…' : ping + ' ms'}
          </span>
        )}
        {isSpectate && <span className="ping">👁 Spectating</span>}
        {touchPlay && gyroSupport() !== 'unsupported' && <button className={gyroOn ? 'on' : ''} onClick={toggleGyro} aria-label="Gyroscope steering">🧭</button>}
        {gyroOn && <button onClick={() => { recenter.current = true; }} aria-label="Recentre gyroscope">⟲</button>}
        {!isReplay && !isSpectate && <button className={emoteOpen ? 'on' : ''} onClick={() => setEmoteOpen((o) => !o)} aria-label="Emotes" title="Emotes (keys 1-5)">😀</button>}
        <button onClick={toggleMute} aria-label="Toggle sound">{muted ? '🔇' : '🔊'}</button>
        <button onClick={toggleFullscreen} aria-label="Fullscreen">⛶</button>
        <button onClick={onExit} aria-label="Leave">✕</button>
      </div>
      {emoteOpen && !isReplay && !isSpectate && (
        <div className="emotebar">
          {EMOTES.map((e, i) => <button key={e.id} title={`${e.label} (key ${i + 1})`} aria-label={e.label} onClick={() => { api.current.emote(i); setEmoteOpen(false); }}>{e.icon}</button>)}
        </div>
      )}
      {gyroNote && (
        <div className="gyronote">
          {gyroNote.text}{gyroNote.link && <> <a href={gyroNote.link}>Open secure version</a></>}
        </div>
      )}
      {single && overInfo && (
        <div className="endbtns">
          {overInfo.canSave && <button className="savereplay" onClick={() => saveRef.current?.(recRef.current)}>💾 Save replay</button>}
          <button className="closeend" onClick={onExit}>✕ Close</button>
        </div>
      )}
      {isReplay && (
        <div className="replaybar">
          <button onClick={togglePause} aria-label="Pause or play">{rp.paused ? '▶' : '⏸'}</button>
          {[1, 2, 4, 8].map((sp) => <button key={sp} className={rp.speed === sp ? 'on' : ''} onClick={() => setSpeed(sp)}>{sp}×</button>)}
          <button onClick={restartReplay} aria-label="Restart replay">⟲</button>
          <div className="rpbar"><i style={{ width: Math.min(100, (rp.tick / Math.max(1, replay.ticks)) * 100) + '%' }} /></div>
          <span>{fmtTime(rp.tick)} / {fmtTime(replay.ticks)}</span>
          {rp.done && <b>finished</b>}
        </div>
      )}
      {touchPlay && <Controls stick={!gyroOn} skillRef={skillRef} apply={(p) => api.current.apply(p)} />}
    </div>
  );
}
