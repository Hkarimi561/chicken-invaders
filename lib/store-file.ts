// Local-development store: one JSON file (data/dev-db.json), read and written on every call so the Next.js dev
// server and the game server (separate processes) see the same data. Not for production.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sanitizeProfile } from '../shared/catalog';
import type { Store, Profile, User, UserWithHash, RunRow, GalleryRow, GiftRow, AdminUserRow, RedeemResult } from './store';

interface Db {
  users: Record<string, { id: string; username: string; hash: string }>;
  profiles: Record<string, Profile>;
  runs: Record<string, RunRow>;
  gallery: Record<string, GalleryRow>;
  attempts: Record<string, number[]>;
  gifts: Record<string, GiftRow & { used: string[] }>;
  created: Record<string, number>;
}
const empty = (): Db => ({ users: {}, profiles: {}, runs: {}, gallery: {}, attempts: {}, gifts: {}, created: {} });

export class FileStore implements Store {
  readonly kind = 'file' as const;
  private file = path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'dev-db.json');
  private warned = false;

  private load(): Db {
    if (!this.warned) { this.warned = true; console.warn(`[store] DATABASE_URL is not set: using the local file ${this.file} (development only)`); }
    try { return { ...empty(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch { return empty(); }
  }
  private save(db: Db) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, this.file);
  }

  async createUser(username: string, hash: string, profile: Profile): Promise<User | null> {
    const db = this.load();
    if (Object.values(db.users).some((u) => u.username.toLowerCase() === username.toLowerCase())) return null;
    const id = crypto.randomUUID();
    db.users[id] = { id, username, hash };
    db.created[id] = Date.now();
    db.profiles[id] = profile;
    this.save(db);
    return { id, username };
  }
  async findUser(username: string): Promise<UserWithHash | null> {
    return Object.values(this.load().users).find((u) => u.username.toLowerCase() === username.toLowerCase()) || null;
  }
  async getUser(id: string) { const u = this.load().users[id]; return u ? { id: u.id, username: u.username } : null; }
  async getProfile(userId: string) { const p = this.load().profiles[userId]; return p ? (sanitizeProfile(p) as Profile) : null; }

  async updateProfile<T>(userId: string, fn: (p: Profile) => T | Promise<T>) {
    const db = this.load();
    if (!db.profiles[userId]) return null;
    const profile = sanitizeProfile(db.profiles[userId]) as Profile;
    const result = await fn(profile);
    const fresh = this.load(); // another process may have written while fn ran
    fresh.profiles[userId] = profile;
    this.save(fresh);
    return { profile, result };
  }
  async rankedProfiles(limit: number) {
    const db = this.load();
    return new Map<string, Profile>(Object.entries(db.profiles).filter(([, p]) => (p.stats?.runs || 0) > 0).slice(0, limit).map(([id, p]) => [id, sanitizeProfile(p) as Profile]));
  }

  async startRun(run: RunRow) {
    const db = this.load();
    const now = Date.now();
    for (const [k, r] of Object.entries(db.runs)) if (now - r.start > 6 * 3600_000) delete db.runs[k];
    db.runs[run.runId] = run;
    this.save(db);
  }
  async finishRun(runId: string, userId: string) {
    const db = this.load();
    const r = db.runs[runId];
    if (!r || r.userId !== userId || r.done) return null;
    r.done = true;
    this.save(db);
    return r;
  }

  async galleryList(sort: 'new' | 'popular', limit: number) {
    const rows = Object.values(this.load().gallery).filter((g) => g.reports.length < 3);
    rows.sort(sort === 'popular' ? (a, b) => b.downloads - a.downloads || b.created - a.created : (a, b) => b.created - a.created);
    return { rows: rows.slice(0, limit).map(({ pack, ...m }) => m as GalleryRow), total: rows.length };
  }
  async galleryGet(id: string, countDownload: boolean) {
    const db = this.load();
    const g = db.gallery[id];
    if (!g || g.reports.length >= 3) return null;
    if (countDownload) { g.downloads++; this.save(db); }
    return g;
  }
  async galleryCountByOwner(userId: string) { return Object.values(this.load().gallery).filter((g) => g.owner === userId).length; }
  async galleryCount() { return Object.keys(this.load().gallery).length; }
  async galleryInsert(row: GalleryRow) { const db = this.load(); db.gallery[row.id] = { ...row, reports: [], downloads: 0 }; this.save(db); }
  async galleryRemove(id: string, userId: string) {
    const db = this.load();
    if (!db.gallery[id] || db.gallery[id].owner !== userId) return false;
    delete db.gallery[id]; this.save(db); return true;
  }
  async galleryReport(id: string, userId: string) {
    const db = this.load();
    const g = db.gallery[id];
    if (!g) return false;
    if (!g.reports.includes(userId)) { g.reports.push(userId); this.save(db); }
    return true;
  }

  async listUsers(limit: number, search: string): Promise<AdminUserRow[]> {
    const db = this.load();
    const q = search.toLowerCase();
    return Object.values(db.users).filter((u) => u.username.toLowerCase().includes(q)).slice(0, limit).map((u) => {
      const p = db.profiles[u.id] || ({} as Profile);
      return { id: u.id, username: u.username, created: db.created[u.id] || 0, keys: Number(p.keys) || 0, pending: Number(p.pending) || 0, runs: Number(p.stats?.runs) || 0, bestWave: Number(p.stats?.bestWave) || 0 };
    });
  }
  async countUsers() { return Object.keys(this.load().users).length; }
  async setPassword(userId: string, hash: string) {
    const db = this.load();
    if (!db.users[userId]) return false;
    db.users[userId].hash = hash; this.save(db); return true;
  }

  async giftCreate(g: GiftRow) {
    const db = this.load();
    if (db.gifts[g.code]) return false;
    db.gifts[g.code] = { ...g, uses: 0, disabled: false, used: [] };
    this.save(db); return true;
  }
  async giftList(): Promise<GiftRow[]> {
    return Object.values(this.load().gifts).map(({ used, ...g }) => g).sort((a, b) => b.created - a.created);
  }
  async giftSetDisabled(code: string, disabled: boolean) {
    const db = this.load(); if (!db.gifts[code]) return false;
    db.gifts[code].disabled = disabled; this.save(db); return true;
  }
  async giftDelete(code: string) {
    const db = this.load(); if (!db.gifts[code]) return false;
    delete db.gifts[code]; this.save(db); return true;
  }
  async giftRedeem(code: string, userId: string): Promise<RedeemResult> {
    const db = this.load();
    const g = db.gifts[code];
    if (!g) return { ok: false, error: 'That gift card code is not valid' };
    if (g.disabled) return { ok: false, error: 'That gift card is no longer active' };
    if (g.expires && g.expires < Date.now()) return { ok: false, error: 'That gift card has expired' };
    if (g.uses >= g.maxUses) return { ok: false, error: 'That gift card has already been used up' };
    if (g.used.includes(userId)) return { ok: false, error: 'You already used this gift card' };
    if (!db.profiles[userId]) return { ok: false, error: 'Unknown account' };
    const profile = sanitizeProfile(db.profiles[userId]) as Profile;
    profile.keys += g.keys;
    db.profiles[userId] = profile;
    g.uses++; g.used.push(userId);
    this.save(db);
    return { ok: true, keys: g.keys, profile };
  }

  async throttle(key: string, windowSec: number, max: number) {
    const db = this.load();
    const now = Date.now();
    const list = (db.attempts[key] || []).filter((t) => now - t < windowSec * 1000);
    if (list.length >= max) return false;
    list.push(now); db.attempts[key] = list; this.save(db);
    return true;
  }
}
