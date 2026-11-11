import { useEffect, useRef, useState } from 'react';
import { W, H, createState, addPlayer, step, setInput } from '../shared/sim.js';
import { draw } from './render.js';
import { resetFx, timeScale } from './fx.js';
import * as sfx from './audio.js';
import { quality, IS_TOUCH } from './util.js';
import { pack } from './packs.js';
import { theme } from './theme.js';
import { screenTilt, tiltToTarget, gyroSupport } from './gyro.js';

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'fire',
};
// Phones start one quality step down; a device that can't keep up is lowered further (and remembered).
function initialQuality() {
  const def = IS_TOUCH ? 1 : 2;
  let saved = NaN;
  try { saved = Number(localStorage.getItem('cb-q')); } catch { /* private mode */ }
  return Number.isInteger(saved) && saved >= 0 && saved <= 2 ? Math.min(saved, def) : def;
}

// Virtual joystick (left) + hold-to-fire button (right) for phones/tablets.
// The stick keeps no React state: the knob is moved with a transform and the stick's centre is measured
// once per touch, so dragging never triggers a re-render or a forced layout while the canvas is drawing.
function Controls({ apply, stick }) {
  const baseEl = useRef(null);
  const knobEl = useRef(null);
  const g = useRef({ id: -1, cx: 0, cy: 0, m: 1, dir: '' });

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
  const release = (e) => {
    if (e && e.pointerId !== g.current.id) return;
    g.current.id = -1; g.current.dir = '';
    knobEl.current.style.transform = 'translate3d(0,0,0)';
    apply({ left: 0, right: 0, up: 0, down: 0 });
  };

  return (
    <div className="controls">
      {stick === false ? <div /> : (
      <div
        ref={baseEl} className="stick"
        onPointerDown={(e) => {
          const r = baseEl.current.getBoundingClientRect();
          g.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, m: r.width / 2, dir: '' };
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => { if (e.pointerId === g.current.id) move(e); }}
        onPointerUp={release} onPointerCancel={release}
      >
        <div ref={knobEl} className="knob" />
      </div>
      )}
      <div
        className="fire"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); apply({ fire: 1 }); }}
        onPointerUp={() => apply({ fire: 0 })} onPointerCancel={() => apply({ fire: 0 })}
      >FIRE</div>
    </div>
  );
}

// mode 'single': local sim. mode 'multi': server snapshots + local prediction.
export default function Game({ mode, net, onExit, name, loadout, onRunEnd, secureUrl }) {
  const cv = useRef(null);
  const stage = useRef(null);
  const api = useRef({ apply: () => {} });
  const runEnd = useRef(onRunEnd);
  runEnd.current = onRunEnd;
  const loadKey = JSON.stringify(loadout || {});
  const [muted, setMuted] = useState(sfx.isMuted());
  const [ping, setPing] = useState(null);
  const [gyroOn, setGyroOn] = useState(false);
  const [gyroNote, setGyroNote] = useState(null); // { text, link? }
  const recenter = useRef(false);
  const noteTimer = useRef(null);

  useEffect(() => {
    // alpha:false = cheaper compositing; desynchronized = lower input-to-photon latency where supported
    const ctx = cv.current.getContext('2d', { alpha: false, desynchronized: true });
    const single = mode === 'single';
    const pix = pack.opts.pixel || 1; // pixel-art packs render at a lower resolution and scale up
    const input = { left: 0, right: 0, up: 0, down: 0, fire: 0, tx: null, ty: null };
    let s = null, me = null, paused = false, reported = false, pingTimer = null;

    resetFx();
    sfx.init();
    sfx.setEvent(theme.event);
    sfx.startMusic();

    // Dev helper: /?wave=9 starts single player at that wave (handy to preview vest tiers).
    const startWave = Math.max(1, Number(new URLSearchParams(location.search).get('wave')) || 1);
    const fresh = () => { s = createState(); s.wave = startWave - 1; s.cleared = s.wave > 0; addPlayer(s, 'me', name || 'You', JSON.parse(loadKey)); resetFx(); };
    if (single) { me = 'me'; fresh(); }
    else {
      me = net.id; s = net.state;
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

    // Single player: tell the server how many keys this run collected (multiplayer keys are counted server-side).
    const report = () => {
      if (!single || reported || !s) return;
      const me0 = s.players.me;
      const keys = me0?.keys || 0, score = me0?.score || 0;
      if (!s.over && keys === 0 && score === 0) return;
      reported = true;
      runEnd.current?.({ keys, wave: s.wave, over: !!s.over, score, kills: me0?.kills || 0 });
    };

    const pushInput = () => { if (!single) net.send({ t: 'input', input: { ...input } }); };
    api.current.apply = (patch) => {
      let changed = false;
      for (const k in patch) if (input[k] !== patch[k]) { input[k] = patch[k]; changed = true; }
      if (changed) pushInput();
    };
    const setKey = (e, v) => {
      const k = KEYS[e.code];
      if (!k) return;
      e.preventDefault();
      // pressing a movement key hands steering back from the mouse to the keyboard
      api.current.apply(v && k !== 'fire' ? { [k]: v, tx: null, ty: null } : { [k]: v });
    };
    const down = (e) => {
      sfx.init();
      if (e.code === 'Escape') return onExit();
      if (e.code === 'KeyM') { const m = !sfx.isMuted(); sfx.setMuted(m); setMuted(m); }
      if (e.code === 'KeyP' && single) paused = !paused;
      if (e.code === 'Enter' && s?.over) { if (single) { report(); reported = false; fresh(); } else net.send({ t: 'restart' }); }
      setKey(e, 1);
    };
    const up = (e) => setKey(e, 0);
    const unlock = () => sfx.init();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('pointerdown', unlock);

    // Mouse: the ship glides to the cursor; hold the left button to fire. (Touch uses the on-screen stick.)
    const el = cv.current;
    let lastSend = 0;
    const toLogical = (e) => {
      const r = el.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
    };
    const mouseMove = (e) => {
      if (e.pointerType !== 'mouse') return;
      const [x, y] = toLogical(e);
      input.tx = Math.max(0, Math.min(W, x)); input.ty = Math.max(0, Math.min(H, y));
      const now = performance.now();
      if (now - lastSend > 33) { lastSend = now; pushInput(); }
    };
    const mouseDown = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      sfx.init(); mouseMove(e);
      api.current.apply({ fire: 1 });
    };
    const mouseUp = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      api.current.apply({ fire: 0 });
    };
    const noMenu = (e) => e.preventDefault();
    el.addEventListener('pointermove', mouseMove);
    el.addEventListener('pointerdown', mouseDown);
    el.addEventListener('contextmenu', noMenu);
    window.addEventListener('pointerup', mouseUp);

    // Adaptive quality: if frames keep taking too long on this device, drop effects and remember the choice.
    quality.level = initialQuality();
    let last = performance.now(), acc = 0, raf, ema = 16.7, frames = 0, lastChange = 0;
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
      acc += real * (single ? timeScale(real) : 1); // hit-stop / slow-mo (single player only)
      if (s) {
        setInput(s, me, { ...input });
        let n = 0;
        while (acc >= 1 / 60 && n < 3) { if (!paused) step(s, 1 / 60); acc -= 1 / 60; n++; }
        if (acc > 1 / 60) acc = 0; // slow device: drop the backlog instead of spiralling into ever more catch-up steps
        sfx.setBoss(s.chickens.some((c) => c.boss));
        ctx.setTransform(1 / pix, 0, 0, 1 / pix, 0, 0);
        ctx.imageSmoothingEnabled = pix === 1;
        draw(ctx, s, me, now / 1000, { paused });
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
  }, [mode, net, onExit, name, loadKey]);

  // ---- gyroscope steering (phones and tablets): tilt the device to move the ship ----
  const note = (text, link) => {
    setGyroNote({ text, link });
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setGyroNote(null), 7000);
  };
  const toggleGyro = async () => {
    if (gyroOn) { setGyroOn(false); try { localStorage.setItem('cb-gyro', '0'); } catch { /* ignore */ } return; }
    const sup = gyroSupport();
    if (sup === 'unsupported') return note('This device has no motion sensor.');
    if (sup === 'insecure') {
      return note('Browsers only allow motion sensors on secure (https) pages.', secureUrl || undefined);
    }
    if (sup === 'needs-permission') { // iOS asks the first time, and only from a tap
      let r = 'denied';
      try { r = await window.DeviceOrientationEvent.requestPermission(); } catch { /* denied */ }
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
    if (IS_TOUCH && saved === '1' && gyroSupport() === 'ready') { recenter.current = true; setGyroOn(true); }
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
  const fullscreen = () => {
    const el = stage.current;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  };

  return (
    <div className="stage" ref={stage}>
      <canvas ref={cv} width={Math.round(W / pix)} height={Math.round(H / pix)} className={pix > 1 ? 'game pixelated' : 'game'} />
      <div className="tools">
        {mode === 'multi' && (
          <span className={'ping ' + (ping == null ? '' : ping < 60 ? 'good' : ping < 130 ? 'ok' : 'bad')} title="Round-trip time to the server">
            ● {ping == null ? '…' : ping + ' ms'}
          </span>
        )}
        {IS_TOUCH && gyroSupport() !== 'unsupported' && <button className={gyroOn ? 'on' : ''} onClick={toggleGyro} aria-label="Gyroscope steering">🧭</button>}
        {gyroOn && <button onClick={() => { recenter.current = true; }} aria-label="Recentre gyroscope">⟲</button>}
        <button onClick={toggleMute} aria-label="Toggle sound">{muted ? '🔇' : '🔊'}</button>
        {IS_TOUCH && <button onClick={fullscreen} aria-label="Fullscreen">⛶</button>}
        <button onClick={onExit} aria-label="Leave">✕</button>
      </div>
      {gyroNote && (
        <div className="gyronote">
          {gyroNote.text}{gyroNote.link && <> <a href={gyroNote.link}>Open secure version</a></>}
        </div>
      )}
      {IS_TOUCH && <Controls stick={!gyroOn} apply={(p) => api.current.apply(p)} />}
    </div>
  );
}
