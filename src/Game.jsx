import { useEffect, useRef, useState } from 'react';
import { W, H, createState, addPlayer, step, setInput } from '../shared/sim.js';
import { draw } from './render.js';
import { resetFx, timeScale } from './fx.js';
import * as sfx from './audio.js';

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'fire',
};
const IS_TOUCH = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

// Virtual joystick (left) + hold-to-fire button (right) for phones/tablets.
function Controls({ apply }) {
  const base = useRef(null);
  const active = useRef(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const move = (e) => {
    const r = base.current.getBoundingClientRect();
    const m = r.width / 2;
    let dx = e.clientX - (r.left + m), dy = e.clientY - (r.top + m);
    const d = Math.hypot(dx, dy);
    if (d > m) { dx *= m / d; dy *= m / d; }
    setKnob({ x: dx, y: dy });
    const dz = m * 0.25;
    apply({ left: +(dx < -dz), right: +(dx > dz), up: +(dy < -dz), down: +(dy > dz) });
  };
  const release = () => { active.current = false; setKnob({ x: 0, y: 0 }); apply({ left: 0, right: 0, up: 0, down: 0 }); };

  return (
    <div className="controls">
      <div
        ref={base} className="stick"
        onPointerDown={(e) => { active.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={(e) => active.current && move(e)}
        onPointerUp={release} onPointerCancel={release}
      >
        <div className="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <div
        className="fire"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); apply({ fire: 1 }); }}
        onPointerUp={() => apply({ fire: 0 })} onPointerCancel={() => apply({ fire: 0 })}
      >FIRE</div>
    </div>
  );
}

// mode 'single': local sim. mode 'multi': server snapshots + local prediction.
export default function Game({ mode, net, onExit, name, loadout, onRunEnd }) {
  const cv = useRef(null);
  const stage = useRef(null);
  const api = useRef({ apply: () => {} });
  const runEnd = useRef(onRunEnd);
  runEnd.current = onRunEnd;
  const loadKey = JSON.stringify(loadout || {});
  const [muted, setMuted] = useState(sfx.isMuted());

  useEffect(() => {
    const ctx = cv.current.getContext('2d');
    const single = mode === 'single';
    const input = { left: 0, right: 0, up: 0, down: 0, fire: 0, tx: null, ty: null };
    let s = null, me = null, paused = false, reported = false;

    resetFx();
    sfx.init();
    sfx.startMusic();

    // Dev helper: /?wave=9 starts single player at that wave (handy to preview vest tiers).
    const startWave = Math.max(1, Number(new URLSearchParams(location.search).get('wave')) || 1);
    const fresh = () => { s = createState(); s.wave = startWave - 1; s.cleared = s.wave > 0; addPlayer(s, 'me', name || 'You', JSON.parse(loadKey)); resetFx(); };
    if (single) { me = 'me'; fresh(); }
    else { me = net.id; s = net.state; net.onState = (ns) => { s = ns; }; }

    // Single player: tell the server how many keys this run collected (multiplayer keys are counted server-side).
    const report = () => {
      if (!single || reported || !s) return;
      const keys = s.players.me?.keys || 0;
      if (!s.over && keys === 0) return;
      reported = true;
      runEnd.current?.({ keys, wave: s.wave, over: !!s.over });
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

    let last = performance.now(), acc = 0, raf;
    const frame = (now) => {
      const real = Math.min(0.1, (now - last) / 1000); last = now;
      acc += real * (single ? timeScale(real) : 1); // hit-stop / slow-mo (single player only)
      if (s) {
        setInput(s, me, { ...input });
        while (acc >= 1 / 60) { if (!paused) step(s, 1 / 60); acc -= 1 / 60; }
        sfx.setBoss(s.chickens.some((c) => c.boss));
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
      if (net) net.onState = null;
    };
  }, [mode, net, onExit, name, loadKey]);

  const toggleMute = () => { const m = !sfx.isMuted(); sfx.setMuted(m); setMuted(m); };
  const fullscreen = () => {
    const el = stage.current;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  };

  return (
    <div className="stage" ref={stage}>
      <canvas ref={cv} width={W} height={H} className="game" />
      <div className="tools">
        <button onClick={toggleMute} aria-label="Toggle sound">{muted ? '🔇' : '🔊'}</button>
        {IS_TOUCH && <button onClick={fullscreen} aria-label="Fullscreen">⛶</button>}
        <button onClick={onExit} aria-label="Leave">✕</button>
      </div>
      {IS_TOUCH && <Controls apply={(p) => api.current.apply(p)} />}
    </div>
  );
}
