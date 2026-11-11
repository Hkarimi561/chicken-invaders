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

/** Loads (or creates) the profile for this device. */
export async function loadProfile() {
  const j = await api('/api/profile', { id: getPid() });
  setPid(j.id);
  return j.profile;
}
export const buy = (item) => api('/api/buy', { id: getPid(), item }).then((j) => j.profile);
export const equip = (slot, value) => api('/api/equip', { id: getPid(), slot, value }).then((j) => j.profile);
export const claim = () => api('/api/claim', { id: getPid() }).then((j) => ({ profile: j.profile, claimed: j.claimed }));
export const startRun = () => api('/api/run/start', { id: getPid() }).then((j) => j.runId);
export const endRun = (runId, keys, wave) => api('/api/run/end', { id: getPid(), runId, keys, wave }).then((j) => j);

/** Use a code from another device so keys and unlocks follow you. */
export async function useCode(code) {
  const id = String(code || '').trim().toLowerCase().replace(/[^a-f0-9]/g, '');
  const j = await api(`/api/profile/${id}`);
  setPid(j.id);
  return j.profile;
}
