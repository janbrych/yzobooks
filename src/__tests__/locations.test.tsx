import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  addBookcase,
  addShelf,
  assignBookShelf,
  findShelf,
  formatLocation,
  getLocations,
  nextShelfName,
  plural,
  removeBookcase,
  removeShelf,
  renameBookcase,
  renameShelf,
  saveLocations,
  shelfIdsOf,
  type Bookcase,
} from '@/lib/locations';
import { addOrUpdateLocalBook, getLocalBooks } from '@/lib/localStorage';
import { BookCard } from '@/components/BookCard';

function sample(): Bookcase[] {
  let list = addBookcase([], 'Regál A');
  list = addShelf(list, list[0].id, '');
  list = addShelf(list, list[0].id, 'Police 3');
  return list;
}

describe('locations model', () => {
  it('creates bookcases and shelves with sensible default names', () => {
    const list = sample();
    expect(list).toHaveLength(1);
    expect(list[0].shelves.map((s) => s.name)).toEqual(['Police 1', 'Police 3']);
    expect(addBookcase(list, '   ')[1].name).toBe('Regál B');
    // "Police 3" exists, so the next default skips it
    expect(nextShelfName(list[0])).toBe('Police 4');
  });

  it('declines Czech plurals', () => {
    const forms: [string, string, string] = ['kniha', 'knihy', 'knih'];
    expect([0, 1, 3, 5].map((n) => plural(n, forms))).toEqual(['0 knih', '1 kniha', '3 knihy', '5 knih']);
  });

  it('formats a book location as "Regál → Police"', () => {
    const list = sample();
    const shelf = list[0].shelves[1];
    expect(formatLocation(list, shelf.id)).toBe('Regál A → Police 3');
    expect(formatLocation(list, null)).toBeNull();
    expect(formatLocation(list, 'missing')).toBeNull();
  });

  it('renames without accepting empty names', () => {
    const list = sample();
    const shelf = list[0].shelves[0];
    const renamed = renameShelf(renameBookcase(list, list[0].id, '  Beletrie  '), shelf.id, 'Horní');
    expect(formatLocation(renamed, shelf.id)).toBe('Beletrie → Horní');
    expect(renameBookcase(renamed, list[0].id, '')[0].name).toBe('Beletrie');
  });

  it('deletes shelves and bookcases', () => {
    const list = sample();
    const [s1, s2] = list[0].shelves;
    expect(shelfIdsOf(list, list[0].id)).toEqual([s1.id, s2.id]);
    expect(findShelf(removeShelf(list, s1.id), s1.id)).toBeNull();
    expect(removeBookcase(list, list[0].id)).toEqual([]);
  });
});

describe('locations storage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips through localStorage and ignores corrupt data', () => {
    const list = sample();
    saveLocations(list);
    expect(getLocations()).toEqual(list);
    localStorage.setItem('yzobooks_locations', '{"nope":1}');
    expect(getLocations()).toEqual([]);
  });

  it('stores the shelf on a local book when there is no server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const book = addOrUpdateLocalBook({ title: 'Krakatit' });
    expect(book.shelfId).toBeNull();
    await assignBookShelf(book.id, 'shelf_1');
    expect(getLocalBooks()[0].shelfId).toBe('shelf_1');
    await assignBookShelf(book.id, null);
    expect(getLocalBooks()[0].shelfId).toBeNull();
  });
});

describe('book detail', () => {
  it('shows where the book stands', () => {
    const list = sample();
    const shelf = list[0].shelves[1];
    const noop = () => {};
    render(
      <BookCard
        book={{ id: 'b1', title: 'R.U.R.', status: 'UNREAD', shelfId: shelf.id }}
        onEdit={noop}
        onDelete={noop}
        onSetStatus={noop}
        locations={list}
        onSetShelf={noop}
      />
    );
    screen.getByRole('button', { name: 'R.U.R.' }).click();
    return screen.findByTestId('book-location').then((el) => expect(el.textContent).toBe('Regál A → Police 3'));
  });
});
