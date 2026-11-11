// Procedural Web Audio: no asset files. Call init() from a user gesture.
// Signal path: voices -> sfxBus / musicBus -> master -> speakers (separate volume sliders, one mute).
let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
let muted = false, musicTimer = null, step = 0, boss = false, lastBeat = 0, musicSrc = null;
const vol = { music: 0.8, sfx: 1 };
const last = {};

function applyVolumes() {
  if (!ac) return;
  master.gain.value = muted ? 0 : 0.35;
  sfxBus.gain.value = vol.sfx;
  musicBus.gain.value = vol.music;
}

export function init() {
  if (!ac) {
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return;
    ac = new C();
    master = ac.createGain(); master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.connect(master);
    applyVolumes();
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
  loadBossSound();
  setTimeout(buildSamples, 50); // off the click handler, so the first tap doesn't hitch
}
export const isMuted = () => muted;
export function setMuted(m) { muted = m; applyVolumes(); }
/** Independent music / effects volume, 0..1 each. */
export function setVolumes(v) {
  if (v && Number.isFinite(v.music)) vol.music = Math.max(0, Math.min(1, v.music));
  if (v && Number.isFinite(v.sfx)) vol.sfx = Math.max(0, Math.min(1, v.sfx));
  applyVolumes();
}
export const setBoss = (b: boolean) => { boss = b; };
/** What the music reacts to: the wave number and whether a boss is on screen. */
let mood: { wave: number; boss?: boolean } = { wave: 0 };
export function setMood(m) { mood = m; boss = !!m.boss; }

// ----- resource-pack sounds replace the synthesised ones when present -----
let packSounds: Record<string, AudioBuffer> = {};
export function setPackSounds(map) { packSounds = map || {}; }
export async function decodeBuffer(arrayBuffer) { init(); return ac.decodeAudioData(arrayBuffer); }
export async function decodeDataUrl(src) { const r = await fetch(src); return decodeBuffer(await r.arrayBuffer()); }
function playPack(name, v = 0.5) {
  const b = packSounds[name];
  if (!b || !ac || muted) return false;
  const src = ac.createBufferSource(); src.buffer = b;
  const g = ac.createGain(); g.gain.value = v;
  src.connect(g); g.connect(sfxBus); src.start();
  return true;
}

let eventId = null;
export function setEvent(id) { eventId = id; }

const ok = (name, gap) => {
  if (!ac || muted) return false;
  const now = ac.currentTime;
  if (now - (last[name] || 0) < gap) return false;
  last[name] = now;
  return true;
};

// Voice budget: each sound is several audio nodes, and piling dozens up (a wave dying at once, a spray of
// shots) is what drops the frame rate on phones. Over budget, new sounds are skipped.
let voices = 0;
const MAX_VOICES = 18;
const voiceFree = () => voices < MAX_VOICES;
function track(node: AudioScheduledSourceNode) { voices++; node.onended = () => { voices--; }; return node; }
function tone({ f = 440, f2, type = 'square', dur = 0.1, vol: v = 0.2, delay = 0, bus }: { f?: number; f2?: number; type?: OscillatorType; dur?: number; vol?: number; delay?: number; bus?: AudioNode }) {
  if (!voiceFree()) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(bus || sfxBus);
  track(o); o.start(t); o.stop(t + dur + 0.02);
}
function noise({ dur = 0.2, vol: v = 0.2, freq = 1200, q = 0.8, type = 'bandpass', delay = 0, bus }: { dur?: number; vol?: number; freq?: number; q?: number; type?: BiquadFilterType; delay?: number; bus?: AudioNode }) {
  if (!voiceFree()) return;
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(bus || sfxBus);
  track(s); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

// ---------------- sound effects ----------------
export function shoot(weapon, own) {
  if (!ok('shoot' + weapon + (own ? 1 : 0), weapon === 'pulse' ? 0.05 : 0.07)) return;
  const v = own ? 1 : 0.4;
  if (playPack('shoot', 0.6 * v)) return;
  if (weapon === 'pulse') tone({ f: 1300, f2: 800, type: 'triangle', dur: 0.05, vol: 0.09 * v });
  else if (weapon === 'laser') tone({ f: 1700, f2: 300, type: 'sawtooth', dur: 0.14, vol: 0.07 * v });
  else if (weapon === 'scatter') { noise({ dur: 0.18, vol: 0.2 * v, freq: 900 }); tone({ f: 140, f2: 60, type: 'square', dur: 0.16, vol: 0.14 * v }); }
  else if (weapon === 'arc') { tone({ f: 1400, f2: 200, type: 'sawtooth', dur: 0.12, vol: 0.08 * v }); noise({ dur: 0.08, vol: 0.06 * v, freq: 4000, type: 'highpass' }); }
  else if (weapon === 'drone') { tone({ f: 740, f2: 520, type: 'triangle', dur: 0.08, vol: 0.08 * v }); tone({ f: 1100, f2: 800, type: 'sine', dur: 0.06, vol: 0.04 * v, delay: 0.03 }); }
  else if (weapon === 'missile') { noise({ dur: 0.25, vol: 0.12 * v, freq: 500, type: 'lowpass' }); tone({ f: 220, f2: 90, type: 'sawtooth', dur: 0.2, vol: 0.1 * v }); }
  else tone({ f: 900, f2: 280, type: 'square', dur: 0.07, vol: 0.07 * v });
}
// Boss death sound: a bundled mp3, loaded on first use (falls back to the synthesised blast if it can't load).
let bossBuf = null, bossLoading = false;
const BOSS_VOICE_START = 4.35, BOSS_VOICE_LEN = 2.6; // seconds into boss-sound.mp3 where the voice is
function loadBossSound() {
  if (bossBuf || bossLoading || !ac) return;
  bossLoading = true;
  fetch('/sound/boss-sound.mp3').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((b) => ac.decodeAudioData(b)).then((b) => { bossBuf = b; }).catch(() => { bossLoading = false; });
}
export function preloadSounds() { loadBossSound(); }
// Pre-rendered samples: a cluck or explosion is ONE buffer source instead of several oscillators + filters, so
// it costs almost nothing when forty chickens die in the same second. Built once, lazily, in plain JS.
let cluckBufs = null, boomBuf = null;
function makeBuffer(sec, fn) {
  const b = ac.createBuffer(1, Math.floor(ac.sampleRate * sec), ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = fn(i / ac.sampleRate, i);
  return b;
}
function buildSamples() {
  if (cluckBufs || !ac) return;
  const TAU = Math.PI * 2;
  // "ghod-ghod-ghodaa": harmonic voice with a moving vocal formant, three syllables
  cluckBufs = [330, 365, 400].map((f0) => {
    const syl = [[0, 0.07, 1], [0.09, 0.07, 1.05], [0.19, 0.17, 1.12]];
    return makeBuffer(0.4, (t) => {
      let out = 0;
      for (const [st, du, m] of syl) {
        const u = (t - st) / du;
        if (u < 0 || u > 1) continue;
        const f = f0 * m * (0.8 + 0.35 * Math.sin(Math.min(1, u * 1.4) * Math.PI * 0.5) - 0.1 * u);
        const formant = 900 + 1000 * Math.sin(Math.min(1, u * 2.5) * Math.PI * 0.5) - 700 * Math.max(0, u - 0.5);
        const env = Math.min(1, u * 14) * (1 - u) ** 1.5;
        let s = 0;
        for (let k = 1; k <= 18; k++) { const hf = f * k; s += Math.sin(TAU * hf * t) / k * Math.exp(-(((hf - formant) / 700) ** 2)); }
        out += s * env;
      }
      return out * 0.6;
    });
  });
  // explosion: rumbling low-passed noise + falling sine thump
  let lp = 0;
  boomBuf = makeBuffer(1.1, (t) => {
    lp += ((Math.random() * 2 - 1) - lp) * (0.08 + 0.25 * Math.exp(-t * 5));
    const thump = Math.sin(TAU * (45 + 130 * Math.exp(-t * 7)) * t) * Math.exp(-t * 3.2);
    return (lp * 3.2 * Math.exp(-t * 3.4) + thump * 0.9) * 0.33 * Math.min(1, t * 400);
  });
}
function playBuf(buf, v, rate = 1) {
  if (!buf || !voiceFree()) return;
  const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
  const g = ac.createGain(); g.gain.value = v;
  src.connect(g); g.connect(sfxBus); track(src); src.start();
}
function cluck() { if (cluckBufs) playBuf(cluckBufs[(Math.random() * cluckBufs.length) | 0], 0.5, 0.9 + Math.random() * 0.25); }
/** Plane destroyed. */
export function explode(own) {
  if (!ok('explode', 0.25)) return;
  playBuf(boomBuf, own ? 1 : 0.6);
}
export function kill(isBoss) {
  if (!ok(isBoss ? 'bosskill' : 'kill', isBoss ? 0.5 : 0.12)) return;
  if (playPack('kill', isBoss ? 0.9 : 0.5)) return;
  if (isBoss && bossBuf) {
    const src = ac.createBufferSource(); src.buffer = bossBuf;
    // The file has ~4.4 s of silence before the voice, so start right where it begins and fade the tail out.
    const t = ac.currentTime, from = BOSS_VOICE_START, len = Math.min(BOSS_VOICE_LEN, bossBuf.duration - from);
    const g = ac.createGain(); g.gain.setValueAtTime(1, t); g.gain.setValueAtTime(1, t + len - 0.5); g.gain.linearRampToValueAtTime(0, t + len);
    src.connect(g); g.connect(sfxBus); src.start(t, from, len);
    return;
  }
  if (isBoss) loadBossSound();
  if (isBoss) {
    noise({ dur: 0.9, vol: 0.35, freq: 300 });
    tone({ f: 260, f2: 60, type: 'sawtooth', dur: 0.9, vol: 0.25 });
    return;
  }
  noise({ dur: 0.1, vol: 0.08, freq: 1800 }); // soft pop under the cluck
  cluck();
}
/** Meteor warning: two quick low beeps. */
export function warn() {
  if (!ok('warn', 0.2)) return;
  tone({ f: 520, f2: 480, type: 'square', dur: 0.07, vol: 0.05 });
  tone({ f: 520, f2: 480, type: 'square', dur: 0.07, vol: 0.05, delay: 0.1 });
}
export function hit(own) {
  if (!ok('hit', 0.1)) return;
  if (playPack('hit', own ? 0.8 : 0.4)) return;
  noise({ dur: 0.4, vol: own ? 0.35 : 0.18, freq: 400, type: 'lowpass' });
  tone({ f: 200, f2: 40, type: 'square', dur: 0.35, vol: own ? 0.25 : 0.1 });
}
export function gift(kind) {
  if (!ok('gift', 0.08)) return;
  if (playPack('gift', 0.6)) return;
  const notes = kind === 'key' ? [988, 1319, 1760] : kind === 'life' ? [660, 990] : kind === 'wpn' ? [440, 660, 880, 1320] : [660, 880, 1100];
  notes.forEach((f, i) => tone({ f, type: 'triangle', dur: 0.12, vol: 0.12, delay: i * 0.06 }));
}
export function revive() { if (ok('revive', 0.3)) [392, 523, 659, 784].forEach((f, i) => tone({ f, type: 'sine', dur: 0.18, vol: 0.14, delay: i * 0.07 })); }
export function wave(isBoss) {
  if (!ok('wave', 0.5)) return;
  if (playPack('wave', 0.7)) return;
  if (isBoss) [110, 110, 98].forEach((f, i) => tone({ f, f2: f * 0.8, type: 'sawtooth', dur: 0.35, vol: 0.22, delay: i * 0.3 }));
  else [392, 494, 587].forEach((f, i) => tone({ f, type: 'square', dur: 0.14, vol: 0.09, delay: i * 0.09 }));
}
export function flawless() { if (ok('flaw', 0.5)) [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.14, vol: 0.12, delay: i * 0.08 })); }
export function gameOver() { if (ok('over', 1)) [440, 392, 330, 262].forEach((f, i) => tone({ f, type: 'sawtooth', dur: 0.35, vol: 0.14, delay: i * 0.25 })); }
export function combo(n) {
  if (!ok('combo', 0.1)) return;
  const f = 520 * 2 ** (Math.min(n, 48) / 24);
  tone({ f, type: 'triangle', dur: 0.1, vol: 0.1 });
  tone({ f: f * 1.5, type: 'sine', dur: 0.14, vol: 0.07, delay: 0.05 });
}
export function star(i) { if (ac && !muted) tone({ f: 660 * 2 ** (i / 6), type: 'triangle', dur: 0.18, vol: 0.13 }); }
export function splat() { if (ok('splat', 0.05)) noise({ dur: 0.08, vol: 0.05, freq: 900, q: 0.6 }); }
export function crack() { if (ok('crack', 0.06)) tone({ f: 1800, f2: 900, type: 'square', dur: 0.04, vol: 0.05 }); }
/** Role abilities: nova (ace/striker), aegis (tank), mend (medic). */
export function ability(kind) {
  if (!ok('ability', 0.2)) return;
  if (kind === 'aegis') { [330, 494, 659, 988].forEach((f, i) => tone({ f, type: 'sine', dur: 0.4, vol: 0.12, delay: i * 0.05 })); noise({ dur: 0.5, vol: 0.06, freq: 3000, type: 'highpass' }); }
  else if (kind === 'mend') { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.3, vol: 0.1, delay: i * 0.06 })); }
  else { noise({ dur: 0.7, vol: 0.3, freq: 250, type: 'lowpass' }); tone({ f: 90, f2: 30, type: 'sawtooth', dur: 0.6, vol: 0.3 }); tone({ f: 600, f2: 2200, type: 'sine', dur: 0.4, vol: 0.12 }); }
}
export function bossLaser() { if (ok('laser', 0.6)) { tone({ f: 200, f2: 900, type: 'sawtooth', dur: 1.0, vol: 0.12 }); noise({ dur: 1.0, vol: 0.06, freq: 2500, type: 'highpass' }); } }

// ---------------- layered music ----------------
// Four layers fade in as the waves get harder: bass arpeggio, pad chords, lead melody, drums.
// Each seasonal event has its own key, scale and chord loop (all original, generated from these tables).
export const getBeat = () => Math.max(0, 1 - (performance.now() - lastBeat) / 400); // 1 on a beat, fading over ~0.4s

const MUSIC = {
  base: { root: 110, type: 'triangle', scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], arp: [0, 7, 12, 7, 3, 10, 15, 10] },
  halloween: { root: 98, type: 'sawtooth', soft: true, scale: [0, 1, 4, 6, 7, 10], chords: [[0, 3, 6], [1, 4, 8], [0, 3, 6], [-2, 1, 5]], arp: [0, 3, 6, 3, 0, -2, 1, 3] },
  christmas: { root: 130.8, type: 'sine', bell: true, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], arp: [0, 4, 7, 12, 7, 4, 7, 2] },
  valentine: { root: 123.5, type: 'triangle', scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], arp: [0, 4, 7, 9, 7, 4, 9, 12] },
  nowruz: { root: 116.5, type: 'triangle', scale: [0, 1, 4, 5, 7, 8, 11], chords: [[0, 4, 7], [1, 5, 8], [0, 4, 7], [-1, 3, 7]], arp: [0, 1, 4, 5, 7, 5, 4, 1] },
};
const BOSS_ARP = [0, 0, 12, 0, -2, -2, 10, -2];
const hz = (root, semi) => root * 2 ** (semi / 12);

// 0 = calm, 1 = +pad & kick, 2 = +lead & hats, 3 = +snare, 4 = boss (heavier, distorted lead)
const level = () => (boss ? 4 : mood.wave < 3 ? 0 : mood.wave < 6 ? 1 : mood.wave < 10 ? 2 : 3);

export function startMusic() {
  if (musicTimer) return;
  if (packSounds.music && ac) { // a pack's own track replaces the synthesised music (the timer keeps driving beat visuals)
    musicSrc = ac.createBufferSource(); musicSrc.buffer = packSounds.music; musicSrc.loop = true;
    const g = ac.createGain(); g.gain.value = 0.7; musicSrc.connect(g); g.connect(musicBus); musicSrc.start();
  }
  musicTimer = setInterval(() => {
    const n = step++;
    if (n % 2 === 0) lastBeat = performance.now(); // drives beat-reactive visuals even when muted
    if (!ac || muted || musicSrc) return;
    const m = MUSIC[eventId] || MUSIC.base, lv = level(), bus = musicBus;
    const chord = m.chords[Math.floor(n / 16) % m.chords.length];
    const cr = chord[0];

    // bass / arpeggio
    const semi = (boss ? BOSS_ARP[n % 8] : m.arp[n % 8]) + (boss ? 0 : cr);
    tone({ f: hz(m.root, semi), type: boss ? 'sawtooth' : m.type, dur: 0.2, vol: boss ? 0.07 : m.soft ? 0.045 : 0.055, bus });
    if (m.bell && !boss) tone({ f: hz(m.root, semi) * 2.01, type: 'sine', dur: 0.35, vol: 0.02, bus });

    // pad chord, one per bar
    if (lv >= 1 && n % 16 === 0) for (const c of chord) tone({ f: hz(m.root * 2, c), type: 'sine', dur: 3.2, vol: 0.03, bus });

    // lead: a pseudo-random walk through the scale, reproducible from the step number
    if (lv >= 2 && n % 2 === 0) {
      const k = ((n * 2654435761) >>> 0) % m.scale.length;
      const note = m.scale[k] + cr + (boss ? 12 : 24);
      tone({ f: hz(m.root, note), type: boss ? 'sawtooth' : 'triangle', dur: 0.18, vol: boss ? 0.045 : 0.035, bus });
    }

    // drums
    if (lv >= 1 && n % 4 === 0) tone({ f: 130, f2: 42, type: 'sine', dur: 0.13, vol: 0.13, bus });
    if (lv >= 2 && n % 2 === 1) noise({ dur: 0.035, vol: 0.04, freq: 7000, type: 'highpass', bus });
    if (lv >= 3 && n % 8 === 4) { noise({ dur: 0.12, vol: 0.09, freq: 1800, q: 0.7, bus }); tone({ f: 190, f2: 120, type: 'triangle', dur: 0.08, vol: 0.06, bus }); }
    if (lv >= 4 && n % 8 === 0) noise({ dur: 0.3, vol: 0.07, freq: 200, type: 'lowpass', bus }); // boss rumble
  }, 210);
}
export function stopMusic() {
  clearInterval(musicTimer); musicTimer = null;
  if (musicSrc) { try { musicSrc.stop(); } catch { /* already stopped */ } musicSrc = null; }
}
