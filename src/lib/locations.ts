// Physical locations in the library: bookcases (regály) holding shelves
// (police). Books point at a shelf through their optional `shelfId`, so
// renaming a bookcase or shelf never has to touch the books themselves.

import { getLocalBooks, addOrUpdateLocalBook } from '@/lib/localStorage';

export interface Shelf {
  id: string;
  name: string;
}

export interface Bookcase {
  id: string;
  name: string;
  shelves: Shelf[];
}

export interface ShelfLocation {
  bookcase: Bookcase;
  shelf: Shelf;
}

const STORAGE_KEY = 'yzobooks_locations';
const CHANGE_EVENT = 'yzobooks-locations-change';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function cleanName(name: string, fallback: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return trimmed || fallback;
}

// ---- pure helpers (no storage) -------------------------------------------

/** Czech plural: plural(1, ['kniha','knihy','knih']) → "1 kniha". */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

/** First "Police N" not taken yet, so new shelves never clash with existing names. */
export function nextShelfName(bookcase: Bookcase): string {
  const taken = new Set(bookcase.shelves.map((s) => s.name.toLocaleLowerCase('cs')));
  let n = bookcase.shelves.length + 1;
  while (taken.has(`police ${n}`)) n++;
  return `Police ${n}`;
}

export function addBookcase(list: Bookcase[], name: string): Bookcase[] {
  const fallback = `Regál ${String.fromCharCode(65 + (list.length % 26))}`;
  return [...list, { id: newId('case'), name: cleanName(name, fallback), shelves: [] }];
}

export function renameBookcase(list: Bookcase[], id: string, name: string): Bookcase[] {
  return list.map((c) => (c.id === id ? { ...c, name: cleanName(name, c.name) } : c));
}

export function removeBookcase(list: Bookcase[], id: string): Bookcase[] {
  return list.filter((c) => c.id !== id);
}

export function addShelf(list: Bookcase[], bookcaseId: string, name: string): Bookcase[] {
  return list.map((c) =>
    c.id === bookcaseId
      ? { ...c, shelves: [...c.shelves, { id: newId('shelf'), name: cleanName(name, nextShelfName(c)) }] }
      : c
  );
}

export function renameShelf(list: Bookcase[], shelfId: string, name: string): Bookcase[] {
  return list.map((c) => ({
    ...c,
    shelves: c.shelves.map((s) => (s.id === shelfId ? { ...s, name: cleanName(name, s.name) } : s)),
  }));
}

export function removeShelf(list: Bookcase[], shelfId: string): Bookcase[] {
  return list.map((c) => ({ ...c, shelves: c.shelves.filter((s) => s.id !== shelfId) }));
}

export function findShelf(list: Bookcase[], shelfId: string | null | undefined): ShelfLocation | null {
  if (!shelfId) return null;
  for (const bookcase of list) {
    const shelf = bookcase.shelves.find((s) => s.id === shelfId);
    if (shelf) return { bookcase, shelf };
  }
  return null;
}

/** "Regál A → Police 3", or null when the book has no (existing) shelf. */
export function formatLocation(list: Bookcase[], shelfId: string | null | undefined): string | null {
  const loc = findShelf(list, shelfId);
  return loc ? `${loc.bookcase.name} → ${loc.shelf.name}` : null;
}

/** All shelf ids inside a bookcase — the books on them lose their place when it is deleted. */
export function shelfIdsOf(list: Bookcase[], bookcaseId: string): string[] {
  return list.find((c) => c.id === bookcaseId)?.shelves.map((s) => s.id) ?? [];
}

// ---- storage -------------------------------------------------------------

function isBookcaseList(value: unknown): value is Bookcase[] {
  return (
    Array.isArray(value) &&
    value.every(
      (c) => c && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.shelves)
    )
  );
}

export function getLocations(): Bookcase[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return isBookcaseList(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load locations:', err);
    return [];
  }
}

export function saveLocations(list: Bookcase[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch (err) {
    console.error('Failed to save locations:', err);
  }
}

/** Calls `onChange` whenever locations change in this tab or another one. */
export function subscribeLocations(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Puts a book on a shelf (or takes it off with `null`), persisted the same
 * way as the rest of the book: the API when there is a server, localStorage
 * otherwise (GitHub Pages / offline).
 */
export async function assignBookShelf(bookId: string, shelfId: string | null): Promise<void> {
  const res = await fetch(`/api/books/${bookId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shelfId }),
  }).catch(() => null);
  if (res && res.ok) return;
  if (getLocalBooks().some((b) => b.id === bookId)) {
    addOrUpdateLocalBook({ id: bookId, shelfId });
  }
}
