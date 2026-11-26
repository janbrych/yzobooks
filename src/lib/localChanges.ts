// Bookkeeping that lets the local copy of the library be synced: when each
// document (bookcases, map) last changed on this device, which books were
// deleted here, and one event for "something changed".

export const LOCAL_CHANGE_EVENT = 'yzobooks-local-change';
const DOC_TIMES_KEY = 'yzobooks_doc_times';
const TOMBSTONES_KEY = 'yzobooks_deleted_books';

export type DocKey = 'locations' | 'map';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked
  }
}

/** Tell the sync (and other listeners) that local data changed. */
export function announceLocalChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
}

export function docTime(key: DocKey): number {
  return read<Record<string, number>>(DOC_TIMES_KEY, {})[key] || 0;
}

export function setDocTime(key: DocKey, at: number): void {
  write(DOC_TIMES_KEY, { ...read<Record<string, number>>(DOC_TIMES_KEY, {}), [key]: at });
}

export interface Tombstone {
  id: string;
  at: number;
}

export function getTombstones(): Tombstone[] {
  const list = read<Tombstone[]>(TOMBSTONES_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function addTombstone(id: string): void {
  write(TOMBSTONES_KEY, [...getTombstones().filter((t) => t.id !== id), { id, at: Date.now() }]);
}

export function clearTombstones(ids: string[]): void {
  const drop = new Set(ids);
  write(TOMBSTONES_KEY, getTombstones().filter((t) => !drop.has(t.id)));
}

export function clearSyncBookkeeping(): void {
  try {
    localStorage.removeItem(DOC_TIMES_KEY);
    localStorage.removeItem(TOMBSTONES_KEY);
  } catch {
    // storage blocked
  }
}
