import { Pool } from 'pg';
import { sanitizeProfile } from '../shared/catalog';
import type { Store, Profile, User, UserWithHash, RunRow, GalleryRow } from './store';

const META = 'id, owner_id, author, name, descr, size, thumb, downloads, reports, created_at';
const toGallery = (r: any): GalleryRow => ({
  id: r.id, owner: r.owner_id, author: r.author, name: r.name, desc: r.descr, size: r.size, thumb: r.thumb,
  downloads: r.downloads, reports: r.reports || [], created: Number(r.created_at), pack: r.pack,
});

export class PgStore implements Store {
  readonly kind = 'postgres' as const;
  private pool: Pool;

  constructor(url: string) {
    // Supabase's pooled connection (port 6543) is the one to use from serverless functions; keep each instance small.
    const local = /localhost|127\.0\.0\.1/.test(url);
    this.pool = new Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX) || 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: local ? undefined : { rejectUnauthorized: false },
    });
    this.pool.on('error', (e) => console.error('Postgres pool error:', e.message));
  }

  async createUser(username: string, hash: string, profile: Profile): Promise<User | null> {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      const r = await c.query(
        'insert into users (username, username_key, password_hash) values ($1, $2, $3) on conflict (username_key) do nothing returning id, username',
        [username, username.toLowerCase(), hash],
      );
      if (!r.rowCount) { await c.query('rollback'); return null; }
      await c.query('insert into profiles (user_id, data) values ($1, $2)', [r.rows[0].id, JSON.stringify(profile)]);
      await c.query('commit');
      return { id: r.rows[0].id, username: r.rows[0].username };
    } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
  }

  async findUser(username: string): Promise<UserWithHash | null> {
    const r = await this.pool.query('select id, username, password_hash from users where username_key = $1', [username.toLowerCase()]);
    return r.rows[0] ? { id: r.rows[0].id, username: r.rows[0].username, hash: r.rows[0].password_hash } : null;
  }

  async getUser(id: string): Promise<User | null> {
    const r = await this.pool.query('select id, username from users where id = $1', [id]);
    return r.rows[0] || null;
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const r = await this.pool.query('select data from profiles where user_id = $1', [userId]);
    return r.rows[0] ? (sanitizeProfile(r.rows[0].data) as Profile) : null;
  }

  async updateProfile<T>(userId: string, fn: (p: Profile) => T | Promise<T>) {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      const r = await c.query('select data from profiles where user_id = $1 for update', [userId]);
      if (!r.rows[0]) { await c.query('rollback'); return null; }
      const profile = sanitizeProfile(r.rows[0].data) as Profile;
      const result = await fn(profile);
      await c.query('update profiles set data = $2, updated_at = now() where user_id = $1', [userId, JSON.stringify(profile)]);
      await c.query('commit');
      return { profile, result };
    } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
  }

  async rankedProfiles(limit: number) {
    const r = await this.pool.query(
      "select user_id, data from profiles where coalesce((data->'stats'->>'runs')::int, 0) > 0 order by updated_at desc limit $1", [limit],
    );
    return new Map<string, Profile>(r.rows.map((x) => [x.user_id, sanitizeProfile(x.data) as Profile]));
  }

  async startRun(run: RunRow) {
    await this.pool.query("delete from runs where started_at < now() - interval '6 hours'");
    await this.pool.query('insert into runs (run_id, user_id, kind, mut, daily) values ($1, $2, $3, $4, $5)',
      [run.runId, run.userId, run.kind, JSON.stringify(run.mut), run.daily ? JSON.stringify(run.daily) : null]);
  }

  async finishRun(runId: string, userId: string): Promise<RunRow | null> {
    const r = await this.pool.query(
      'update runs set done = true where run_id = $1 and user_id = $2 and done = false returning run_id, user_id, kind, mut, daily, started_at', [runId, userId],
    );
    const x = r.rows[0];
    return x ? { runId: x.run_id, userId: x.user_id, kind: x.kind, mut: x.mut, daily: x.daily, done: true, start: new Date(x.started_at).getTime() } : null;
  }

  async galleryList(sort: 'new' | 'popular', limit: number) {
    const order = sort === 'popular' ? 'downloads desc, created_at desc' : 'created_at desc';
    const rows = await this.pool.query(`select ${META} from gallery_packs where jsonb_array_length(reports) < 3 order by ${order} limit $1`, [limit]);
    const total = await this.pool.query('select count(*)::int as n from gallery_packs where jsonb_array_length(reports) < 3');
    return { rows: rows.rows.map(toGallery), total: total.rows[0].n };
  }

  async galleryGet(id: string, countDownload: boolean) {
    const q = countDownload
      ? 'update gallery_packs set downloads = downloads + 1 where id = $1 and jsonb_array_length(reports) < 3 returning ' + META + ', pack'
      : 'select ' + META + ', pack from gallery_packs where id = $1 and jsonb_array_length(reports) < 3';
    const r = await this.pool.query(q, [id]);
    return r.rows[0] ? toGallery(r.rows[0]) : null;
  }

  async galleryCountByOwner(userId: string) {
    return (await this.pool.query('select count(*)::int as n from gallery_packs where owner_id = $1', [userId])).rows[0].n;
  }
  async galleryCount() { return (await this.pool.query('select count(*)::int as n from gallery_packs')).rows[0].n; }

  async galleryInsert(g: GalleryRow) {
    await this.pool.query(
      'insert into gallery_packs (id, owner_id, author, name, descr, size, thumb, downloads, reports, pack, created_at) values ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10)',
      [g.id, g.owner, g.author, g.name, g.desc, g.size, g.thumb, JSON.stringify([]), JSON.stringify(g.pack), g.created],
    );
  }
  async galleryRemove(id: string, userId: string) {
    return !!(await this.pool.query('delete from gallery_packs where id = $1 and owner_id = $2', [id, userId])).rowCount;
  }
  async galleryReport(id: string, userId: string) {
    const r = await this.pool.query(
      'update gallery_packs set reports = reports || to_jsonb($2::text) where id = $1 and not (reports ? $2) returning id', [id, userId],
    );
    if (r.rowCount) return true;
    return !!(await this.pool.query('select 1 from gallery_packs where id = $1', [id])).rowCount;
  }

  async throttle(key: string, windowSec: number, max: number) {
    await this.pool.query("delete from auth_attempts where at < now() - interval '1 day'");
    const r = await this.pool.query(
      "select count(*)::int as n from auth_attempts where key = $1 and at > now() - ($2 || ' seconds')::interval", [key, String(windowSec)],
    );
    if (r.rows[0].n >= max) return false;
    await this.pool.query('insert into auth_attempts (key) values ($1)', [key]);
    return true;
  }
}
