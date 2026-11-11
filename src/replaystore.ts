// Saved replays live in this browser (IndexedDB). A replay is just a seed plus the pilot's input changes.
import { sanitizeReplay } from '../shared/replay';

const DB = 'cb-replays', KEEP = 12;
const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('r', { keyPath: 'id' });
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const tx = async (mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<any> => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('r', mode);
    const req = fn(t.objectStore('r'));
    t.oncomplete = () => { db.close(); resolve((req as IDBRequest | undefined)?.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
};

export const listReplays = async () => {
  try { return ((await tx('readonly', (s) => s.getAll())) || []).sort((a, b) => b.when - a.when); } catch { return []; }
};
export const deleteReplay = (id) => tx('readwrite', (s) => s.delete(id));

/** Stores a finished run's recording; the oldest ones beyond a dozen are dropped. */
export async function saveReplay(rec) {
  const { _last, ...clean } = rec; // _last is recording bookkeeping, not data
  const id = 'r-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  await tx('readwrite', (s) => s.put({ ...clean, id }));
  const all = await listReplays();
  for (const old of all.slice(KEEP)) await deleteReplay(old.id);
  return id;
}

export function exportReplay(rep) {
  const { id, _last, ...clean } = rep;
  const url = URL.createObjectURL(new Blob([JSON.stringify(clean)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'replay-wave' + rep.wave + '-' + rep.score + '.cbreplay.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function importReplayFile(file) {
  if (file.size > 12_000_000) throw new Error('That file is too large to be a replay');
  let raw;
  try { raw = JSON.parse(await file.text()); } catch { throw new Error('That file is not valid JSON'); }
  const clean = sanitizeReplay(raw);
  const id = 'r-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  await tx('readwrite', (s) => s.put({ ...clean, id }));
  return id;
}

/** Re-validates a stored replay before playing it. */
export const loadable = (rep) => sanitizeReplay(rep);
