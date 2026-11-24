import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as scanner from '@/lib/scanner';
import { createQuickAdder, needsCatalogData, type QuickAddItem } from '@/lib/quickAdd';
import { addOrUpdateLocalBook, deleteLocalBook, getLocalBooks } from '@/lib/localStorage';

vi.mock('@/lib/scanner', async (original) => ({ ...(await original<typeof scanner>()), lookupBooksByISBN: vi.fn() }));
const lookup = vi.mocked(scanner.lookupBooksByISBN);
const ISBN = '9788000061917';
const record = { title: 'Harry Potter', author: 'J. K. Rowling', coverUrl: 'https://x/c.jpg' } as scanner.BookSearchResult;

describe('createQuickAdder', () => {
  beforeEach(() => {
    localStorage.clear();
    lookup.mockReset();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('saves the book on the shelf before the catalog answers, then completes it', async () => {
    let answer!: (r: scanner.BookSearchResult[]) => void;
    lookup.mockReturnValue(new Promise((r) => (answer = r)));
    const items: QuickAddItem[] = [];
    const done = createQuickAdder([]).add(ISBN, 'shelf1', (i) => items.push(i));
    await vi.waitFor(() => expect(lookup).toHaveBeenCalled());
    expect(getLocalBooks()[0]).toMatchObject({ isbn: ISBN, shelfId: 'shelf1' });
    expect(needsCatalogData(getLocalBooks()[0])).toBe(true);
    answer([record]);
    await done;
    expect(items.map((i) => i.state)).toEqual(['saving', 'added']);
    expect(getLocalBooks()).toHaveLength(1);
    expect(getLocalBooks()[0]).toMatchObject({ title: 'Harry Potter', shelfId: 'shelf1', isbn: ISBN });
  });

  it('keeps a book no catalog knows, to be completed later', async () => {
    lookup.mockResolvedValue([]);
    const items: QuickAddItem[] = [];
    await createQuickAdder([]).add(ISBN, null, (i) => items.push(i));
    expect(items.at(-1)?.state).toBe('unknown');
    expect(needsCatalogData(getLocalBooks()[0])).toBe(true);
  });

  it('moves a book already in the library (stored under ISBN-10 too) instead of adding it twice', async () => {
    const book = addOrUpdateLocalBook({ title: 'Kniha', isbn: '0-306-40615-2' });
    const adder = createQuickAdder(getLocalBooks());
    const items: QuickAddItem[] = [];
    await adder.add('9780306406157', 'shelf2', (i) => items.push(i));
    await adder.add('9780306406157', 'shelf2', (i) => items.push(i));
    expect(items.map((i) => i.state)).toEqual(['moved', 'duplicate']);
    expect(getLocalBooks()).toHaveLength(1);
    expect(getLocalBooks()[0]).toMatchObject({ id: book.id, shelfId: 'shelf2' });
  });

  it('never creates a book twice when the code is read again during saving', async () => {
    lookup.mockResolvedValue([record]);
    const adder = createQuickAdder([]);
    await Promise.all([adder.add(ISBN, 's', () => {}), adder.add(ISBN, 's', () => {})]);
    expect(getLocalBooks()).toHaveLength(1);
  });

  it('does not bring back a book deleted while its data was being looked up', async () => {
    lookup.mockImplementation(async () => {
      deleteLocalBook(getLocalBooks()[0].id);
      return [record];
    });
    await createQuickAdder([]).add(ISBN, null, () => {});
    expect(getLocalBooks()).toHaveLength(0);
  });
});
