// Client side of the account: sign-in state lives in an httpOnly cookie set by the server, the game state (keys,
// unlocks, records) in the user's profile row in the database. Every call below uses that cookie.
import { defaultProfile } from '../shared/catalog';

export class AuthError extends Error {
  constructor(message = 'Please sign in') { super(message); this.name = 'AuthError'; }
}

async function api(path: string, body?: any) {
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/api/auth/login') throw new AuthError(j.error);
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

export const offlineProfile = () => ({ ...defaultProfile(), offline: true });

// ---- account ----
export interface AccountUser { username: string }
/** The signed-in user, or null. Throws only when the server cannot be reached. */
export const me = (): Promise<AccountUser | null> => api('/api/auth/me').then((j) => j.user);
export const register = (username: string, password: string): Promise<AccountUser> => api('/api/auth/register', { username, password }).then((j) => j.user);
export const login = (username: string, password: string): Promise<AccountUser> => api('/api/auth/login', { username, password }).then((j) => j.user);
export const logout = () => api('/api/auth/logout', {}).then(() => undefined);

/** Loads the signed-in user's profile. */
export const loadProfile = () => api('/api/profile').then((j) => j.profile);
export const buy = (item: string) => api('/api/buy', { item }).then((j) => j.profile);
export const equip = (slot: string, value: any) => api('/api/equip', { slot, value }).then((j) => j.profile);
export const claim = () => api('/api/claim', {}).then((j) => ({ profile: j.profile, claimed: j.claimed }));
/** Starts a browser-simulated run: kind is 'solo', 'daily' or 'rush'. Returns { runId, seed, mut, event, daily }. */
export const startRun = (kind = 'solo', mut: string[] = []) => api('/api/run/start', { kind, mut });
export const endRun = (runId: string, run: Record<string, any>) => api('/api/run/end', { runId, ...run });
/** Leaderboard rows for a mode and board; the server flags your own row with 'you'. */
export const leaderboard = (mode: string, board: string) => api('/api/leaderboard', { mode, board });

// ---- daily challenge, progression ----
export const getDaily = () => api('/api/daily');
export const claimWeekly = (goal: string) => api('/api/weekly/claim', { goal }).then((j) => j.profile);
export const claimSeason = (tier: number) => api('/api/season/claim', { tier }).then((j) => j.profile);
export const setTitle = (title: string) => api('/api/title', { title }).then((j) => j.profile);
export const achSeen = () => api('/api/ach/seen', {}).then((j) => j.profile);

// ---- rooms (served by the separate game server; empty when none is configured) ----
export const listRooms = () => api('/api/rooms').then((j) => {
  if (j.offline) throw new Error('Online rooms are not available right now');
  return j.rooms;
});
export const wsToken = (): Promise<{ token: string; url: string }> => api('/api/ws-token');

// ---- community pack gallery ----
export const galleryList = (sort = 'new') => api('/api/packs?sort=' + encodeURIComponent(sort));
export const galleryGet = (id: string) => api('/api/packs/' + encodeURIComponent(id));
export const galleryPublish = (pack: any, desc: string) => api('/api/packs/publish', { pack, desc });
export const galleryRemove = (packId: string) => api('/api/packs/remove', { packId });
export const galleryReport = (packId: string) => api('/api/packs/report', { packId });
