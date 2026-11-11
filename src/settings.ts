// Player settings: accessibility, touch layout, comfort and volume. Stored in this browser only.
import { IS_TOUCH } from './util';
import * as sfx from './audio';

const KEY = 'cb-settings';
export interface Settings {
  patterns: boolean; reduceFlash: boolean; stickSize: 'small' | 'medium' | 'large'; swapSides: boolean;
  controlOpacity: number; autoFire: boolean; fullscreen: boolean; music: number; sfx: number;
}
const defaults = (): Settings => ({
  patterns: false,        // colour-blind help: each vest tier also gets its own pattern
  reduceFlash: false,     // no screen shake, flashes, lens ripples, hit-stop or beat pulsing
  stickSize: 'medium',    // 'small' | 'medium' | 'large'
  swapSides: false,       // joystick on the right, buttons on the left
  controlOpacity: 0.8,    // touch controls
  autoFire: false,        // fire without holding the button
  fullscreen: true,       // start games in fullscreen
  music: 0.8,
  sfx: 1,
});

export const settings: Settings = defaults();
const num = (v, a, b, d) => (Number.isFinite(Number(v)) ? Math.max(a, Math.min(b, Number(v))) : d);

export function loadSettings() {
  let raw: Record<string, any> = {};
  try { raw = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* corrupt or blocked */ }
  const d = defaults();
  settings.patterns = typeof raw.patterns === 'boolean' ? raw.patterns : d.patterns;
  settings.reduceFlash = typeof raw.reduceFlash === 'boolean' ? raw.reduceFlash : d.reduceFlash;
  settings.stickSize = ['small', 'medium', 'large'].includes(raw.stickSize) ? raw.stickSize : d.stickSize;
  settings.swapSides = typeof raw.swapSides === 'boolean' ? raw.swapSides : d.swapSides;
  settings.controlOpacity = num(raw.controlOpacity, 0.3, 1, d.controlOpacity);
  settings.autoFire = typeof raw.autoFire === 'boolean' ? raw.autoFire : d.autoFire;
  settings.fullscreen = typeof raw.fullscreen === 'boolean' ? raw.fullscreen : d.fullscreen;
  settings.music = num(raw.music, 0, 1, d.music);
  settings.sfx = num(raw.sfx, 0, 1, d.sfx);
  sfx.setVolumes({ music: settings.music, sfx: settings.sfx });
}

export function setSetting(key, value) {
  if (!(key in settings)) return;
  settings[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  if (key === 'music' || key === 'sfx') sfx.setVolumes({ music: settings.music, sfx: settings.sfx });
}

export const STICK_PX = { small: 100, medium: 130, large: 165 };
loadSettings();
