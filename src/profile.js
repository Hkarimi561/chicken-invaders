// Client side of the global profile: a secret profile code kept in localStorage, state kept on the server.
import { defaultProfile } from '../shared/catalog.js';

const KEY = 'cb-pid';
export const getPid = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const setPid = (id) => { try { localStorage.setItem(KEY, id); } catch { /* private mode */ } };

async function api(path, body) {
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

export const offlineProfile = () => ({ ...defaultProfile(), offline: true });

/**
 * Opening the secure (https) address of this game starts on a different origin with empty storage, so the menu
 * link carries the profile code in the URL fragment (#p=...). A fragment is never sent to the server or logged;
 * it is read once here and removed from the address bar.
 */
function adoptHashProfile() {
  const m = /[#&]p=([a-f0-9]{24})/.exec(location.hash || '');
  if (!m) return;
  setPid(m[1]);
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
}

/** Loads (or creates) the profile for this device. */
export async function loadProfile() {
  adoptHashProfile();
  const j = await api('/api/profile', { id: getPid() });
  setPid(j.id);
  return j.profile;
}
export const buy = (item) => api('/api/buy', { id: getPid(), item }).then((j) => j.profile);
export const equip = (slot, value) => api('/api/equip', { id: getPid(), slot, value }).then((j) => j.profile);
export const claim = () => api('/api/claim', { id: getPid() }).then((j) => ({ profile: j.profile, claimed: j.claimed }));
export const startRun = () => api('/api/run/start', { id: getPid() }).then((j) => j.runId);
export const endRun = (runId, run) => api('/api/run/end', { id: getPid(), runId, ...run }).then((j) => j);
/** Leaderboard rows for a mode and board; the server flags your own row with 'you'. */
export const leaderboard = (mode, board) => api('/api/leaderboard', { id: getPid(), mode, board });

/** Use a code from another device so keys and unlocks follow you. */
export async function useCode(code) {
  const id = String(code || '').trim().toLowerCase().replace(/[^a-f0-9]/g, '');
  const j = await api(`/api/profile/${id}`);
  setPid(j.id);
  return j.profile;
}
