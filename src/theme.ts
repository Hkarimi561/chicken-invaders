// Which seasonal event is being shown. 'auto' follows the calendar; the player can force one or turn events off.
import { activeEvent, EVENTS } from '../shared/events';

export const theme = { mode: 'auto', event: null };
const KEY = 'cb-event';

export function resolveEvent() {
  if (theme.mode === 'off') return null;
  if (EVENTS[theme.mode]) return theme.mode;
  return activeEvent();
}

export function initTheme() {
  let mode = 'auto';
  try { mode = localStorage.getItem(KEY) || 'auto'; } catch { /* private mode */ }
  const q = new URLSearchParams(location.search).get('event'); // ?event=halloween previews without saving
  theme.mode = q && (q === 'off' || EVENTS[q]) ? q : mode === 'off' || EVENTS[mode] ? mode : 'auto';
  theme.event = resolveEvent();
}

export function setEventMode(mode) {
  theme.mode = mode === 'off' || EVENTS[mode] ? mode : 'auto';
  try { localStorage.setItem(KEY, theme.mode); } catch { /* ignore */ }
  theme.event = resolveEvent();
}
