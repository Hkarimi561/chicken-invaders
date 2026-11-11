// Procedural Web Audio: no asset files. Call init() from a user gesture.
let ac = null, master = null, noiseBuf = null;
let muted = false, musicTimer = null, step = 0, boss = false;
const last = {};

export function init() {
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    ac = new C();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
}
export const isMuted = () => muted;
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.35; }
export const setBoss = (b) => { boss = b; };

const ok = (name, gap) => {
  if (!ac || muted) return false;
  const now = ac.currentTime;
  if (now - (last[name] || 0) < gap) return false;
  last[name] = now;
  return true;
};

function tone({ f = 440, f2, type = 'square', dur = 0.1, vol = 0.2, delay = 0 }) {
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise({ dur = 0.2, vol = 0.2, freq = 1200, q = 0.8, type = 'bandpass', delay = 0 }) {
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

export function shoot(weapon, own) {
  if (!ok('shoot' + weapon + (own ? 1 : 0), weapon === 'pulse' ? 0.05 : 0.07)) return;
  const v = own ? 1 : 0.4;
  if (weapon === 'pulse') tone({ f: 1300, f2: 800, type: 'triangle', dur: 0.05, vol: 0.09 * v });
  else if (weapon === 'laser') tone({ f: 1700, f2: 300, type: 'sawtooth', dur: 0.14, vol: 0.07 * v });
  else if (weapon === 'scatter') { noise({ dur: 0.18, vol: 0.2 * v, freq: 900 }); tone({ f: 140, f2: 60, type: 'square', dur: 0.16, vol: 0.14 * v }); }
  else if (weapon === 'arc') { tone({ f: 1400, f2: 200, type: 'sawtooth', dur: 0.12, vol: 0.08 * v }); noise({ dur: 0.08, vol: 0.06 * v, freq: 4000, type: 'highpass' }); }
  else if (weapon === 'drone') { tone({ f: 740, f2: 520, type: 'triangle', dur: 0.08, vol: 0.08 * v }); tone({ f: 1100, f2: 800, type: 'sine', dur: 0.06, vol: 0.04 * v, delay: 0.03 }); }
  else if (weapon === 'missile') { noise({ dur: 0.25, vol: 0.12 * v, freq: 500, type: 'lowpass' }); tone({ f: 220, f2: 90, type: 'sawtooth', dur: 0.2, vol: 0.1 * v }); }
  else tone({ f: 900, f2: 280, type: 'square', dur: 0.07, vol: 0.07 * v });
}
export function kill(isBoss) {
  if (!ok(isBoss ? 'bosskill' : 'kill', isBoss ? 0.5 : 0.04)) return;
  noise({ dur: isBoss ? 0.9 : 0.16, vol: isBoss ? 0.35 : 0.14, freq: isBoss ? 300 : 1800 });
  tone({ f: isBoss ? 260 : 520, f2: 60, type: 'sawtooth', dur: isBoss ? 0.9 : 0.14, vol: isBoss ? 0.25 : 0.1 });
  if (!isBoss) tone({ f: 800, f2: 1200, type: 'sine', dur: 0.06, vol: 0.04 }); // cluck-ish chirp
}
export function hit(own) {
  if (!ok('hit', 0.1)) return;
  noise({ dur: 0.4, vol: own ? 0.35 : 0.18, freq: 400, type: 'lowpass' });
  tone({ f: 200, f2: 40, type: 'square', dur: 0.35, vol: own ? 0.25 : 0.1 });
}
export function gift(kind) {
  if (!ok('gift', 0.08)) return;
  const notes = kind === 'key' ? [988, 1319, 1760] : kind === 'life' ? [660, 990] : kind === 'wpn' ? [440, 660, 880, 1320] : [660, 880, 1100];
  notes.forEach((f, i) => tone({ f, type: 'triangle', dur: 0.12, vol: 0.12, delay: i * 0.06 }));
}
export function revive() { if (ok('revive', 0.3)) [392, 523, 659, 784].forEach((f, i) => tone({ f, type: 'sine', dur: 0.18, vol: 0.14, delay: i * 0.07 })); }
export function wave(isBoss) {
  if (!ok('wave', 0.5)) return;
  if (isBoss) [110, 110, 98].forEach((f, i) => tone({ f, f2: f * 0.8, type: 'sawtooth', dur: 0.35, vol: 0.22, delay: i * 0.3 }));
  else [392, 494, 587].forEach((f, i) => tone({ f, type: 'square', dur: 0.14, vol: 0.09, delay: i * 0.09 }));
}
export function flawless() { if (ok('flaw', 0.5)) [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.14, vol: 0.12, delay: i * 0.08 })); }
export function gameOver() { if (ok('over', 1)) [440, 392, 330, 262].forEach((f, i) => tone({ f, type: 'sawtooth', dur: 0.35, vol: 0.14, delay: i * 0.25 })); }

let lastBeat = 0;
/** 1 right on a beat, decaying to 0 over ~0.4s. */
export const getBeat = () => Math.max(0, 1 - (performance.now() - lastBeat) / 400);
export function combo(n) {
  if (!ok('combo', 0.1)) return;
  const f = 520 * 2 ** (Math.min(n, 48) / 24);
  tone({ f, type: 'triangle', dur: 0.1, vol: 0.1 });
  tone({ f: f * 1.5, type: 'sine', dur: 0.14, vol: 0.07, delay: 0.05 });
}
export function star(i) { if (ac && !muted) tone({ f: 660 * 2 ** (i / 6), type: 'triangle', dur: 0.18, vol: 0.13 }); }
export function splat() { if (ok('splat', 0.05)) noise({ dur: 0.08, vol: 0.05, freq: 900, q: 0.6 }); }
export function crack() { if (ok('crack', 0.06)) tone({ f: 1800, f2: 900, type: 'square', dur: 0.04, vol: 0.05 }); }

// Tiny looping arpeggio; faster and lower during bosses.
const NORMAL = [0, 7, 12, 7, 3, 10, 15, 10];
const BOSS = [0, 0, 12, 0, -2, -2, 10, -2];
export function startMusic() {
  if (musicTimer) return;
  musicTimer = setInterval(() => {
    if (step % 2 === 0) lastBeat = performance.now(); // drives beat-reactive visuals even when muted
    if (!ac || muted) { step++; return; }
    const seq = boss ? BOSS : NORMAL;
    const semi = seq[step++ % seq.length];
    const f = 110 * 2 ** (semi / 12);
    tone({ f, type: boss ? 'sawtooth' : 'triangle', dur: 0.2, vol: boss ? 0.07 : 0.05 });
    if (step % 4 === 0) noise({ dur: 0.05, vol: 0.04, freq: 6000, type: 'highpass' });
  }, 210);
}
export function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
