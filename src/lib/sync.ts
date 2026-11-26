// Two-way sync between the library on this device (localStorage) and the
// user's account. The device copy stays the one the app works with, so
// everything keeps working offline; the sync sends local changes up and
// brings other devices' changes down. Conflicts: the later edit wins.

import { getLocalBooks, saveLocalBooks, type LocalBook } from '@/lib/localStorage';
import { getLocations, saveLocations, type Bookcase } from '@/lib/locations';
import { getLibraryMap, saveLibraryMap, type LibraryMapData } from '@/lib/libraryMap';
import { clearSyncBookkeeping, clearTombstones, docTime, getTombstones, type DocKey } from '@/lib/localChanges';

// One stored thing in the account: a book, or a whole document.
export interface RemoteItem {
  kind: 'book' | 'doc';
  id: string;
  data: unknown;
  clientUpdatedAt: number; // the editing device's clock, for "later edit wins"
  deleted: boolean;
  serverUpdatedAt: string; // the server's clock, for "what's new since"
}

export interface RemoteStore {
  /** Items changed after `since` (server time), oldest first. */
  pull(since: string | null): Promise<RemoteItem[]>;
  push(items: Omit<RemoteItem, 'serverUpdatedAt'>[]): Promise<void>;
}

const STATE_KEY = 'yzobooks_sync';
// Re-read this much before the last cursor: a row written in a transaction
// that started earlier can become visible after a newer one.
const CURSOR_OVERLAP_MS = 60_000;

interface SyncState {
  owner: string | null; // account the local data belongs to
  cursor: string | null; // newest server time seen
  pushedAt: number; // local clock of the last successful push
}

function readState(): SyncState {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (s && typeof s === 'object') return { owner: s.owner ?? null, cursor: s.cursor ?? null, pushedAt: s.pushedAt || 0 };
  } catch {
    // corrupt: start over
  }
  return { owner: null, cursor: null, pushedAt: 0 };
}

function writeState(state: SyncState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // storage blocked
  }
}

const bookTime = (b: Pick<LocalBook, 'updatedAt'>) => Date.parse(b.updatedAt) || 0;

/** Removes the library from this device (signing out, another account). */
export function clearLocalLibrary(): void {
  saveLocalBooks([], { quiet: true });
  saveLocations([], 0);
  saveLibraryMap(getLibraryMapDefault(), 0);
  clearSyncBookkeeping();
  writeState({ owner: null, cursor: null, pushedAt: 0 });
}

function getLibraryMapDefault(): LibraryMapData {
  return { room: { w: 800, h: 600 }, door: { x: 400, y: 600 }, spots: {} };
}

export interface SyncResult {
  pulled: number;
  pushed: number;
}

/**
 * One round of syncing for `userId`. Local data of another account is
 * dropped first; local data made before signing in joins the account.
 */
export async function syncOnce(remote: RemoteStore, userId: string): Promise<SyncResult> {
  let state = readState();
  if (state.owner && state.owner !== userId) {
    clearLocalLibrary();
    state = readState();
  }
  if (state.owner !== userId) state = { owner: userId, cursor: null, pushedAt: 0 };

  // ---- down: other devices' changes
  const since = state.cursor ? new Date(Date.parse(state.cursor) - CURSOR_OVERLAP_MS).toISOString() : null;
  const incoming = await remote.pull(since);
  let pulled = 0;
  let cursor = state.cursor;
  const books = new Map(getLocalBooks().map((b) => [b.id, b]));
  const tombstones = new Map(getTombstones().map((t) => [t.id, t.at]));
  let booksChanged = false;

  for (const item of incoming) {
    if (!cursor || item.serverUpdatedAt > cursor) cursor = item.serverUpdatedAt;
    if (item.kind === 'book') {
      const local = books.get(item.id);
      const localTime = local ? bookTime(local) : tombstones.get(item.id) ?? -1;
      if (item.clientUpdatedAt <= localTime) continue;
      if (item.deleted) {
        if (local) {
          books.delete(item.id);
          booksChanged = true;
          pulled++;
        }
      } else {
        books.set(item.id, { ...(item.data as LocalBook), id: item.id });
        tombstones.delete(item.id);
        booksChanged = true;
        pulled++;
      }
    } else if (item.id === 'locations' || item.id === 'map') {
      const key = item.id as DocKey;
      if (item.clientUpdatedAt <= docTime(key) || item.deleted) continue;
      if (key === 'locations') saveLocations(item.data as Bookcase[], item.clientUpdatedAt);
      else saveLibraryMap(item.data as LibraryMapData, item.clientUpdatedAt);
      pulled++;
    }
  }
  if (booksChanged) {
    // Newest first, as the app lists them.
    const list = [...books.values()].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    saveLocalBooks(list, { quiet: true });
  }

  // ---- up: this device's changes since the last push
  const startedAt = Date.now();
  const changedBooks = getLocalBooks().filter((b) => bookTime(b) > state.pushedAt);
  const deletions = getTombstones().filter((t) => !books.has(t.id));
  const out: Omit<RemoteItem, 'serverUpdatedAt'>[] = [
    ...changedBooks.map((b) => ({ kind: 'book' as const, id: b.id, data: b, clientUpdatedAt: bookTime(b), deleted: false })),
    ...deletions.map((t) => ({ kind: 'book' as const, id: t.id, data: null, clientUpdatedAt: t.at, deleted: true })),
  ];
  for (const key of ['locations', 'map'] as DocKey[]) {
    const at = docTime(key);
    if (at > state.pushedAt) out.push({ kind: 'doc', id: key, data: key === 'locations' ? getLocations() : getLibraryMap(), clientUpdatedAt: at, deleted: false });
  }
  if (out.length) await remote.push(out);
  clearTombstones(deletions.map((t) => t.id));

  writeState({ owner: userId, cursor, pushedAt: out.length ? startedAt : state.pushedAt });
  return { pulled, pushed: out.length };
}

export function localOwner(): string | null {
  return readState().owner;
}
