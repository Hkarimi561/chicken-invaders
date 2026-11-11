// Persistence interface. Two implementations: Postgres (production, Supabase) and a JSON file (local development
// without a database). Both the Next.js API routes and the multiplayer game server use the same interface.
import { defaultProfile } from '../shared/catalog';

export type Profile = ReturnType<typeof defaultProfile> & Record<string, any>;

export interface User { id: string; username: string }
export interface UserWithHash extends User { hash: string }

export interface RunRow { runId: string; userId: string; kind: string; mut: string[]; daily: any; done: boolean; start: number }

export interface GalleryRow {
  id: string; owner: string; author: string; name: string; desc: string; size: number; thumb: string | null;
  downloads: number; reports: string[]; created: number; pack?: any;
}

export interface Store {
  readonly kind: 'postgres' | 'file';
  /** Creates the user and their starting profile. Returns null when the name is taken. */
  createUser(username: string, hash: string, profile: Profile): Promise<User | null>;
  findUser(username: string): Promise<UserWithHash | null>;
  getUser(id: string): Promise<User | null>;
  getProfile(userId: string): Promise<Profile | null>;
  /** Runs `fn` on the user's profile atomically (row lock) and saves it. */
  updateProfile<T>(userId: string, fn: (p: Profile) => T | Promise<T>): Promise<{ profile: Profile; result: T } | null>;
  /** Profiles that have played at least one run (for the leaderboards), keyed by user id. */
  rankedProfiles(limit: number): Promise<Map<string, Profile>>;

  startRun(run: RunRow): Promise<void>;
  /** Marks the run done and returns it, only if it belongs to the user and was not finished before. */
  finishRun(runId: string, userId: string): Promise<RunRow | null>;

  galleryList(sort: 'new' | 'popular', limit: number): Promise<{ rows: GalleryRow[]; total: number }>;
  galleryGet(id: string, countDownload: boolean): Promise<GalleryRow | null>;
  galleryCountByOwner(userId: string): Promise<number>;
  galleryCount(): Promise<number>;
  galleryInsert(row: GalleryRow): Promise<void>;
  galleryRemove(id: string, userId: string): Promise<boolean>;
  galleryReport(id: string, userId: string): Promise<boolean>;

  /** Counts an attempt under `key` and says whether it is still within `max` per `windowSec`. */
  throttle(key: string, windowSec: number, max: number): Promise<boolean>;
}

let instance: Store | null = null;
export async function getStore(): Promise<Store> {
  if (instance) return instance;
  if (process.env.DATABASE_URL) {
    const { PgStore } = await import('./store-pg');
    instance = new PgStore(process.env.DATABASE_URL);
  } else {
    if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL is not set. Add your Supabase Postgres connection string to the environment.');
    const { FileStore } = await import('./store-file');
    instance = new FileStore();
  }
  return instance;
}
