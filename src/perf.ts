// Performance: the graphics setting, the adaptive quality ladder, and the "lowfx" page class that switches off
// CSS blur effects (they are costly on old graphics cards).
import { quality, IS_TOUCH } from './util';
import { settings } from './settings';

// levels: 3 = everything, 2 = no lens/foreground/glow, 1 = flat chickens + cached sky, 0 = minimal
const FIXED = { low: 1, medium: 2, high: 3 };
const KEY = 'cb-q';

/** The quality to start at: a fixed choice from Settings, or (Auto) the last level this device could sustain. */
export function startQuality(): number {
  const g = settings.graphics;
  if (g !== 'auto') return FIXED[g];
  const def = IS_TOUCH ? 1 : 3;
  let saved = NaN;
  try { saved = Number(localStorage.getItem(KEY)); } catch { /* private mode */ }
  return Number.isInteger(saved) && saved >= 0 && saved <= 3 ? Math.min(saved, def) : def;
}

/** Sets the render quality. Below 3 the page also drops blur/backdrop effects. `remember` stores an Auto downgrade. */
export function setQuality(level: number, remember = false) {
  quality.level = level;
  try { document.documentElement.classList.toggle('lowfx', level < 3); } catch { /* no DOM */ }
  if (remember && settings.graphics === 'auto') { try { localStorage.setItem(KEY, String(level)); } catch { /* ignore */ } }
}

export const autoQuality = () => settings.graphics === 'auto';
