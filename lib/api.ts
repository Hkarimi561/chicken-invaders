// All HTTP API handlers (one dispatcher behind app/api/[[...path]]/route.ts).
// Every game action needs a signed-in user: the account comes from the session cookie, never from the request body.
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { getStore, type Profile } from './store';
import {
  COOKIE, ADMIN_USERNAME, isAdminName, checkCredentials, cookieOptions, hashPassword, signGameToken, signSession, verifyPassword, verifyToken, type Session,
} from './auth';
import { buyItem, equipItem, defaultProfile } from '../shared/catalog';
import { EVENTS, activeEvent } from '../shared/events';
import { recordRun, buildBoard, cleanName } from '../shared/leaderboard';
import { applyRun, claimWeekly, claimSeason, setTitle } from '../shared/progress';
import { dailyInfo } from '../shared/daily';
import { sanitizePack } from '../shared/packfmt';
import { MUT_IDS } from '../shared/sim';

type Body = Record<string, any>;
interface Ctx { req: Request; body: Body; user: Session | null; query: URLSearchParams; seg: string[] }

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, error: string) => json({ error }, status);

export const serverEvent = () => (EVENTS[process.env.EVENT_OVERRIDE as string] ? (process.env.EVENT_OVERRIDE as string) : activeEvent(new Date()));
const cleanMut = (list: unknown) => [...new Set((Array.isArray(list) ? list : []).filter((id) => MUT_IDS.includes(id)))] as string[];
const KEY_RATE_SECONDS = 4;
const RUN_KINDS = ['solo', 'daily', 'rush'];

async function clientIp() {
  const h = await headers();
  return (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'local';
}

/** Public game-server address (set GAME_SERVER_URL to enable online rooms). */
export const gameServerUrl = () => (process.env.GAME_SERVER_URL || '').replace(/\/+$/, '');

// ---------------------------------------------------------------- accounts
async function startSession(user: { id: string; username: string }) {
  const jar = await cookies();
  jar.set(COOKIE, await signSession({ uid: user.id, username: user.username }), cookieOptions());
}

async function register({ body }: Ctx) {
  const err = checkCredentials(body.username, body.password);
  if (err) return fail(400, err);
  const store = await getStore();
  if (!(await store.throttle('reg:' + (await clientIp()), 3600, 20))) return fail(429, 'Too many sign-ups from this network. Try again later.');
  const username = String(body.username);
  const profile = defaultProfile() as Profile;
  profile.name = cleanName(username);
  const user = await store.createUser(username, await hashPassword(String(body.password)), profile);
  if (!user) return fail(409, 'That username is taken');
  await startSession(user);
  return json({ user: { username: user.username } });
}

async function login({ body }: Ctx) {
  const err = checkCredentials(body.username, body.password);
  if (err) return fail(400, 'Wrong username or password');
  const store = await getStore();
  const ip = await clientIp();
  const name = String(body.username).toLowerCase();
  if (!(await store.throttle('login:' + name, 600, 10)) || !(await store.throttle('loginip:' + ip, 600, 60))) return fail(429, 'Too many attempts. Wait a few minutes and try again.');
  const user = await store.findUser(String(body.username));
  const ok = await verifyPassword(String(body.password), user ? user.hash : null);
  if (!user || !ok) return fail(401, 'Wrong username or password');
  await startSession(user);
  return json({ user: { username: user.username } });
}

async function logout() {
  (await cookies()).delete(COOKIE);
  return json({ ok: true });
}

async function me({ user }: Ctx) {
  // `admin` only decides whether the Admin button is shown; every admin endpoint checks again on the server
  return json({ user: user ? { username: user.username, admin: isAdminName(user.username) } : null });
}

// ---------------------------------------------------------------- profile
async function mutate<T>(user: Session, fn: (p: Profile) => T | Promise<T>) {
  const store = await getStore();
  return store.updateProfile(user.uid, fn);
}
const unknownAccount = () => fail(401, 'Unknown account');

async function profile({ user }: Ctx) {
  const p = await (await getStore()).getProfile(user!.uid);
  if (!p) return unknownAccount();
  return json({ profile: p, user: { username: user!.username } });
}

async function buy({ user, body }: Ctx) {
  const r = await mutate(user!, (p) => buyItem(p, body.item, { event: serverEvent() }));
  if (!r) return unknownAccount();
  if (!r.result.ok) return fail(400, r.result.error);
  return json({ profile: r.profile });
}
async function equip({ user, body }: Ctx) {
  const r = await mutate(user!, (p) => equipItem(p, String(body.slot), body.value ?? null));
  if (!r) return unknownAccount();
  if (!r.result.ok) return fail(400, r.result.error);
  return json({ profile: r.profile });
}
async function claim({ user }: Ctx) {
  const r = await mutate(user!, (p) => { const n = p.pending; p.keys += n; p.pending = 0; return n; });
  if (!r) return unknownAccount();
  return json({ profile: r.profile, claimed: r.result });
}
async function weeklyClaim({ user, body }: Ctx) {
  const r = await mutate(user!, (p) => claimWeekly(p, String(body.goal || '')));
  if (!r) return unknownAccount();
  if (!r.result.ok) return fail(400, r.result.error);
  return json({ profile: r.profile, keys: r.result.keys });
}
async function seasonClaim({ user, body }: Ctx) {
  const r = await mutate(user!, (p) => claimSeason(p, Math.floor(Number(body.tier))));
  if (!r) return unknownAccount();
  if (!r.result.ok) return fail(400, r.result.error);
  return json({ profile: r.profile, keys: r.result.keys });
}
async function title({ user, body }: Ctx) {
  const r = await mutate(user!, (p) => setTitle(p, String(body.title || '')));
  if (!r) return unknownAccount();
  if (!r.result.ok) return fail(400, r.result.error);
  return json({ profile: r.profile });
}
async function achSeen({ user }: Ctx) {
  const r = await mutate(user!, (p) => { p.achNew = []; });
  if (!r) return unknownAccount();
  return json({ profile: r.profile });
}

// ---------------------------------------------------------------- browser-simulated runs
async function runStart({ user, body }: Ctx) {
  const now = Date.now();
  const kind = RUN_KINDS.includes(body.kind) ? body.kind : 'solo';
  const daily = kind === 'daily' ? dailyInfo(new Date(now)) : null;
  const mut = daily ? daily.mut : cleanMut(body.mut); // the daily challenge fixes its own rules
  const runId = crypto.randomBytes(8).toString('hex');
  await (await getStore()).startRun({ runId, userId: user!.uid, kind, mut, daily, done: false, start: now });
  return json({ runId, kind, mut, seed: daily ? daily.seed : null, daily, event: serverEvent() });
}

async function runEnd({ user, body }: Ctx) {
  const store = await getStore();
  const run = await store.finishRun(String(body.runId || ''), user!.uid);
  if (!run) return fail(400, 'Run already submitted or unknown');
  const elapsed = (Date.now() - run.start) / 1000;
  const n = run.mut.length;
  // Only what the elapsed time makes plausible is accepted (the simulation runs in the browser).
  const maxWave = run.kind === 'rush' ? Math.floor(elapsed / 12) + 1 : Math.floor(elapsed / 4) + 2;
  const wave = Math.min(maxWave, 999, Math.max(0, Math.floor(Number(body.wave) || 0)));
  const reportedScore = Math.max(0, Math.floor(Number(body.score) || 0));
  const score = Math.min(reportedScore, Math.floor((400 * elapsed + 600 * wave + 200) * (1 + 0.2 * n)));
  const reported = Math.max(0, Math.floor(Number(body.keys) || 0));
  const cap = Math.round(Math.min(3 + Math.ceil(elapsed / KEY_RATE_SECONDS), 5 + wave * 6) * (1 + 0.25 * n)) + (n ? n * 2 : 0);
  const credited = Math.min(reported, cap);
  const st = body.stats && typeof body.stats === 'object' ? body.stats : {};
  const lim = (v: unknown, max: number) => Math.min(Math.max(0, Math.floor(Number(v) || 0)), Math.max(0, Math.floor(max)));
  const stats = {
    kills: lim(body.kills, elapsed * 6 + 30),
    bosses: lim(st.bosses, run.kind === 'rush' ? wave : wave / 5 + 1),
    flawless: lim(st.flawless, wave),
    novas: lim(st.novas, elapsed / 6 + 2),
    mends: lim(st.mends, elapsed / 5 + 2),
    revives: lim(st.revives, elapsed / 5 + 2),
  };
  const r = await mutate(user!, (p) => {
    const k = Math.max(0, Math.floor(credited));
    p.pending += k; p.stats.runs += 1; p.stats.totalKeys += k; p.stats.bestWave = Math.max(p.stats.bestWave, wave);
    p.name = cleanName(body.name || p.name);
    const counted = recordRun(p.rec[run.kind], { score, wave });
    const result = applyRun(p, { mode: run.kind, score, wave, keys: credited, mut: n, daily: run.daily, ...stats }, new Date(run.start), serverEvent());
    if (!counted) result.unlocked = result.unlocked.filter((id: string) => id !== 'first_run' || (p.ach as Record<string, any>).first_run); // a zero-score run is no achievement
    return result;
  });
  if (!r) return unknownAccount();
  return json({ profile: r.profile, credited, score, wave, result: r.result });
}

async function leaderboard({ user, body }: Ctx) {
  const profiles = await (await getStore()).rankedProfiles(3000);
  return json(buildBoard(profiles, String(body.mode), String(body.board), user?.uid ?? null, new Date(), 50));
}

// ---------------------------------------------------------------- community pack gallery
const GALLERY_MAX = 300, PER_OWNER = 5, PACK_BYTES = 3_500_000;
const publicMeta = (g: { id: string; name: string; author: string; desc: string; size: number; downloads: number; created: number; thumb: string | null }) => ({
  id: g.id, name: g.name, author: g.author, desc: g.desc, size: g.size, downloads: g.downloads, created: g.created, thumb: g.thumb,
});

async function packsPublish({ user, body }: Ctx) {
  let clean: any;
  try { clean = sanitizePack(body.pack); } catch (e: any) { return fail(400, e.message); }
  const size = JSON.stringify(clean).length;
  if (size > PACK_BYTES) return fail(400, 'That pack is too large to share (limit about 3.5 MB)');
  if (!Object.keys(clean.images).length && !Object.keys(clean.sounds).length) return fail(400, 'Add at least one image or sound before sharing');
  const store = await getStore();
  if ((await store.galleryCountByOwner(user!.uid)) >= PER_OWNER) return fail(400, `You can share up to ${PER_OWNER} packs; remove one first`);
  if ((await store.galleryCount()) >= GALLERY_MAX) return fail(400, 'The gallery is full right now');
  const prof = await store.getProfile(user!.uid);
  const im = clean.images;
  const t = [im.chicken, im.ship, im.egg, im.boss].find((x: any) => x && x.src.length <= 60000);
  const id = crypto.randomBytes(5).toString('hex');
  const desc = String(body.desc ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120);
  await store.galleryInsert({
    id, owner: user!.uid, author: cleanName(prof?.name || clean.author), name: clean.name, desc, size, thumb: t ? t.src : null,
    downloads: 0, reports: [], created: Date.now(), pack: clean,
  });
  return json({ id });
}
async function packsList({ query }: Ctx) {
  const { rows, total } = await (await getStore()).galleryList(query.get('sort') === 'popular' ? 'popular' : 'new', 60);
  return json({ packs: rows.map(publicMeta), total });
}
async function packsGet({ seg }: Ctx) {
  const g = await (await getStore()).galleryGet(String(seg[1] || ''), true);
  if (!g) return fail(404, 'Pack not found');
  return json({ meta: publicMeta(g), pack: g.pack });
}
async function packsRemove({ user, body }: Ctx) {
  const ok = await (await getStore()).galleryRemove(String(body.packId || ''), user!.uid);
  return ok ? json({ ok: true }) : fail(404, 'Pack not found');
}
async function packsReport({ user, body }: Ctx) {
  const ok = await (await getStore()).galleryReport(String(body.packId || ''), user!.uid); // three reports hide a pack
  return ok ? json({ ok: true }) : fail(404, 'Pack not found');
}

// ---------------------------------------------------------------- gift cards
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const normCode = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
const prettyCode = (c: string) => (c.length === 12 ? c.replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3') : c);
const randomCode = () => Array.from(crypto.randomBytes(12), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

async function giftRedeem({ user, body }: Ctx) {
  const store = await getStore();
  if (!(await store.throttle('gift:' + user!.uid, 600, 12))) return fail(429, 'Too many attempts. Wait a few minutes.');
  const code = normCode(body.code);
  if (code.length < 4) return fail(400, 'Enter your gift card code');
  const r = await store.giftRedeem(code, user!.uid);
  if (!r.ok) return fail(400, (r as { error: string }).error);
  return json({ profile: (r as any).profile, keys: (r as any).keys });
}

// ---------------------------------------------------------------- admin (only the hardcoded admin account)
async function adminOnly(user: Session): Promise<Response | null> {
  const row = await (await getStore()).getUser(user.uid); // the database, not the cookie, says who this is
  return row && isAdminName(row.username) ? null : fail(403, 'Admins only');
}
const giftOut = (g: any) => ({ ...g, code: prettyCode(g.code) });

async function adminOverview({ user, query }: Ctx) {
  const denied = await adminOnly(user!); if (denied) return denied;
  const store = await getStore();
  const [users, total, gifts] = await Promise.all([store.listUsers(100, String(query.get('q') || '').slice(0, 30)), store.countUsers(), store.giftList()]);
  return json({ admin: ADMIN_USERNAME, total, users, gifts: gifts.map(giftOut) });
}
async function adminGiftCreate({ user, body }: Ctx) {
  const denied = await adminOnly(user!); if (denied) return denied;
  const keys = Math.floor(Number(body.keys)), maxUses = Math.floor(Number(body.uses) || 1), days = Math.floor(Number(body.days) || 0);
  if (!(keys >= 1 && keys <= 100000)) return fail(400, 'Keys must be between 1 and 100000');
  if (!(maxUses >= 1 && maxUses <= 100000)) return fail(400, 'Uses must be between 1 and 100000');
  const wanted = normCode(body.code);
  if (body.code && wanted.length < 4) return fail(400, 'A custom code needs 4-24 letters or numbers');
  const store = await getStore();
  const note = String(body.note ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
  const expires = days > 0 ? Date.now() + Math.min(days, 3650) * 86400_000 : null;
  for (let i = 0; i < 5; i++) {
    const code = wanted || randomCode();
    if (await store.giftCreate({ code, keys, maxUses, uses: 0, note, created: Date.now(), expires, disabled: false })) return json({ code: prettyCode(code) });
    if (wanted) return fail(409, 'That code already exists');
  }
  return fail(500, 'Could not create a unique code');
}
async function adminGiftToggle({ user, body }: Ctx) {
  const denied = await adminOnly(user!); if (denied) return denied;
  const ok = await (await getStore()).giftSetDisabled(normCode(body.code), !!body.disabled);
  return ok ? json({ ok: true }) : fail(404, 'Gift card not found');
}
async function adminGiftDelete({ user, body }: Ctx) {
  const denied = await adminOnly(user!); if (denied) return denied;
  const ok = await (await getStore()).giftDelete(normCode(body.code));
  return ok ? json({ ok: true }) : fail(404, 'Gift card not found');
}
async function adminGrant({ user, body }: Ctx) {
  const denied = await adminOnly(user!); if (denied) return denied;
  const keys = Math.trunc(Number(body.keys));
  if (!Number.isFinite(keys) || keys === 0 || Math.abs(keys) > 100000) return fail(400, 'Enter a number of keys between -100000 and 100000 (not 0)');
  const store = await getStore();
  const target = await store.findUser(String(body.username || ''));
  if (!target) return fail(404, 'No such user');
  const r = await store.updateProfile(target.id, (p) => { p.keys = Math.max(0, p.keys + keys); return p.keys; });
  return r ? json({ username: target.username, keys: r.result }) : fail(404, 'No such user');
}
async function adminPassword({ user, body }: Ctx) {
  const denied = await adminOnly(user!); if (denied) return denied;
  const err = checkCredentials('placeholder', body.password);
  if (err) return fail(400, err);
  const store = await getStore();
  const target = await store.findUser(String(body.username || ''));
  if (!target) return fail(404, 'No such user');
  await store.setPassword(target.id, await hashPassword(String(body.password)));
  return json({ ok: true });
}

// ---------------------------------------------------------------- misc
async function info() {
  return json({ event: serverEvent(), online: !!gameServerUrl() });
}
async function daily() {
  return json(dailyInfo(new Date()));
}
async function rooms() {
  const url = gameServerUrl();
  if (!url) return json({ rooms: [], offline: true });
  try {
    const r = await fetch(url + '/rooms', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    return json(await r.json());
  } catch { return json({ rooms: [], offline: true }); }
}
async function wsToken({ user }: Ctx) {
  const url = gameServerUrl();
  if (!url) return fail(503, 'Online rooms are not set up on this server');
  return json({ token: await signGameToken(user!), url: url.replace(/^http/, 'ws') + '/ws' });
}

// ---------------------------------------------------------------- routing
type Handler = (c: Ctx) => Promise<Response>;
interface Route { auth: boolean; run: Handler }
const R = (auth: boolean, run: Handler): Route => ({ auth, run });

const ROUTES: Record<string, Route> = {
  'POST auth/register': R(false, register),
  'POST auth/login': R(false, login),
  'POST auth/logout': R(false, logout),
  'GET auth/me': R(false, me),
  'GET info': R(false, info),
  'GET daily': R(false, daily),
  'GET rooms': R(true, rooms),
  'GET ws-token': R(true, wsToken),
  'GET profile': R(true, profile),
  'POST buy': R(true, buy),
  'POST equip': R(true, equip),
  'POST claim': R(true, claim),
  'POST weekly/claim': R(true, weeklyClaim),
  'POST season/claim': R(true, seasonClaim),
  'POST title': R(true, title),
  'POST ach/seen': R(true, achSeen),
  'POST run/start': R(true, runStart),
  'POST run/end': R(true, runEnd),
  'POST leaderboard': R(false, leaderboard),
  'POST gift/redeem': R(true, giftRedeem),
  'GET admin/overview': R(true, adminOverview),
  'POST admin/gift/create': R(true, adminGiftCreate),
  'POST admin/gift/toggle': R(true, adminGiftToggle),
  'POST admin/gift/delete': R(true, adminGiftDelete),
  'POST admin/grant': R(true, adminGrant),
  'POST admin/password': R(true, adminPassword),
  'POST packs/publish': R(true, packsPublish),
  'GET packs': R(false, packsList),
  'POST packs/remove': R(true, packsRemove),
  'POST packs/report': R(true, packsReport),
};

export async function dispatch(req: Request, path: string[] = []): Promise<Response> {
  const method = req.method.toUpperCase();
  const key = `${method} ${path.join('/')}`;
  const route = ROUTES[key] ?? (method === 'GET' && path[0] === 'packs' && path.length === 2 ? R(false, packsGet) : null);
  if (!route) return fail(404, 'Not found');
  try {
    const limit = path[0] === 'packs' && path[1] === 'publish' ? 5_000_000 : 20_000;
    let body: Body = {};
    if (method === 'POST') {
      const text = await req.text();
      if (text.length > limit) return fail(413, 'Request too large');
      try { const j = text ? JSON.parse(text) : {}; body = j && typeof j === 'object' ? j : {}; } catch { return fail(400, 'Invalid JSON'); }
    }
    const jar = await cookies();
    const user = await verifyToken(jar.get(COOKIE)?.value, 'session');
    if (route.auth && !user) return fail(401, 'Please sign in');
    return await route.run({ req, body, user, query: new URL(req.url).searchParams, seg: path });
  } catch (e: any) {
    console.error('API error', key, e);
    return fail(500, 'Server error');
  }
}
