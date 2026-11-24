// Serial scanning: every scanned code becomes a book on the chosen shelf at
// once, and its title and cover are filled in from the catalogs afterwards.
// The camera never waits for the network.

import { createBook, updateBook } from '@/lib/bookStore';
import type { LocalBook } from '@/lib/localStorage';
import { assignBookShelf } from '@/lib/locations';
import { BACKGROUND_LOOKUP_DEADLINE_MS, comparableCode, lookupBooksByISBN, normalizeISBNInput, type BookSearchResult } from '@/lib/scanner';

export type QuickAddState =
  | 'saving' // saved or being saved, title not known yet
  | 'added' // new book with catalog data
  | 'unknown' // new book, no catalog knows the code
  | 'moved' // already in the library, put on the chosen shelf
  | 'duplicate' // already in the library, nothing to change
  | 'failed';

export interface QuickAddItem {
  isbn: string;
  state: QuickAddState;
  title: string;
  author: string;
  coverUrl: string;
}

// Title of a book whose catalog data hasn't arrived (or wasn't found).
export const placeholderTitle = (isbn: string) => `ISBN ${isbn}`;

export function needsCatalogData(book: Pick<LocalBook, 'title' | 'isbn'>): boolean {
  return Boolean(book.isbn) && book.title === placeholderTitle(book.isbn);
}

function catalogFields(found: BookSearchResult): Partial<LocalBook> {
  return {
    title: found.title,
    author: found.author,
    genre: found.genre,
    publisher: found.publisher,
    publishedYear: found.publishedYear,
    edition: found.edition,
    pageCount: found.pageCount,
    description: found.description,
    coverUrl: found.coverUrl,
  };
}

// Fill in a placeholder book; false when no catalog knows its code.
export async function completeBook(id: string, isbn: string): Promise<BookSearchResult | null> {
  const [found] = await lookupBooksByISBN(isbn, BACKGROUND_LOOKUP_DEADLINE_MS);
  if (!found?.title) return null;
  await updateBook(id, catalogFields(found));
  return found;
}

export interface QuickAdder {
  add: (isbn: string, shelfId: string | null, onChange: (item: QuickAddItem) => void) => Promise<void>;
}

// One scanning session. `library` is what is already in the library, so a
// known book is moved to the shelf instead of being added twice.
export function createQuickAdder(library: LocalBook[]): QuickAdder {
  const known = new Map<string, Pick<LocalBook, 'id' | 'title' | 'author' | 'coverUrl' | 'shelfId'>>();
  for (const b of library) {
    const code = comparableCode(normalizeISBNInput(b.isbn || ''));
    if (code && !known.has(code)) known.set(code, b);
  }

  return {
    async add(isbn, shelfId, onChange) {
      const existing = known.get(isbn);
      if (existing) {
        const item = { isbn, title: existing.title, author: existing.author || '', coverUrl: existing.coverUrl || '' };
        if (!shelfId || existing.shelfId === shelfId) return onChange({ ...item, state: 'duplicate' });
        existing.shelfId = shelfId;
        onChange({ ...item, state: 'moved' });
        await assignBookShelf(existing.id, shelfId);
        return;
      }

      const blank: QuickAddItem = { isbn, state: 'saving', title: placeholderTitle(isbn), author: '', coverUrl: '' };
      // Reserved before the first await, so a second read of the same code
      // can't create the book twice.
      const entry = { id: '', title: blank.title, author: '', coverUrl: '', shelfId };
      known.set(isbn, entry);
      onChange(blank);
      try {
        const book = await createBook({ title: blank.title, isbn, shelfId, status: 'UNREAD' });
        entry.id = book.id;
        // Moved to another shelf while it was being saved.
        if (entry.shelfId !== shelfId) await assignBookShelf(book.id, entry.shelfId);
        const found = await completeBook(book.id, isbn);
        if (!found) return onChange({ ...blank, state: 'unknown' });
        Object.assign(entry, { title: found.title, author: found.author, coverUrl: found.coverUrl });
        onChange({ isbn, state: 'added', title: found.title, author: found.author, coverUrl: found.coverUrl });
      } catch (err) {
        console.error('Quick add failed:', err);
        if (!entry.id) known.delete(isbn);
        onChange({ ...blank, state: 'failed' });
      }
    },
  };
}
