import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findAuthorPhotoUrl, findCoverUrl, findCoverForBook, primaryAuthorName } from '@/lib/bookMedia';
import { BookCover, AuthorAvatar } from '@/components/BookImages';
import { ReadToggle } from '@/components/ReadToggle';

// jsdom never loads images, so stand in for the browser: every URL listed in
// `imageSizes` "loads" with that size, anything else fails to load.
let imageSizes: Record<string, [number, number]> = {};

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(url: string) {
    setTimeout(() => {
      const size = imageSizes[url];
      if (size) {
        [this.naturalWidth, this.naturalHeight] = size;
        this.onload?.();
      } else {
        this.onerror?.();
      }
    }, 0);
  }
}

const jsonResponse = (data: unknown) => ({ ok: true, json: async () => data }) as Response;

describe('book media lookup', () => {
  beforeEach(() => {
    imageSizes = {};
    vi.stubGlobal('Image', FakeImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('primaryAuthorName picks the first author in reading order', () => {
    expect(primaryAuthorName('Karel Čapek, Josef Čapek')).toBe('Karel Čapek');
    expect(primaryAuthorName('Čapek, Karel')).toBe('Karel Čapek');
    expect(primaryAuthorName('Karel Čapek, 1890-1938')).toBe('Karel Čapek');
    expect(primaryAuthorName('Terry Pratchett a Neil Gaiman')).toBe('Terry Pratchett');
  });

  it('findCoverUrl skips the Knihovny.cz "no cover" placeholder and falls back to Open Library', async () => {
    const knihovny = 'https://www.knihovny.cz/Cover/Show?isbn=9788074832086&size=large';
    const openLibrary = 'https://covers.openlibrary.org/b/isbn/9788074832086-L.jpg?default=false';
    imageSizes[knihovny] = [65, 80];
    imageSizes[openLibrary] = [300, 450];

    expect(await findCoverUrl('978-80-7483-208-6')).toBe(openLibrary);
  });

  it('findCoverUrl keeps a working cover returned by the catalog search', async () => {
    const google = 'https://books.google.com/cover.jpg';
    imageSizes[google] = [128, 196];
    expect(await findCoverUrl('9788074832086', google)).toBe(google);
  });

  it('findCoverUrl returns null when no source has a cover', async () => {
    expect(await findCoverUrl('9788074832086', 'data:image/jpeg;base64,xyz')).toBeNull();
  });

  it('findAuthorPhotoUrl prefers the Czech Wikipedia portrait', async () => {
    const portrait = 'https://upload.wikimedia.org/capek.jpg';
    imageSizes[portrait] = [330, 440];
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ type: 'standard', thumbnail: { source: portrait } }));

    expect(await findAuthorPhotoUrl('Karel Čapek, 1890-1938')).toBe(portrait);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      'https://cs.wikipedia.org/api/rest_v1/page/summary/Karel_%C4%8Capek'
    );
  });

  it('findAuthorPhotoUrl ignores disambiguation pages and falls back to Open Library', async () => {
    const olPhoto = 'https://covers.openlibrary.org/a/olid/OL1A-M.jpg?default=false';
    imageSizes[olPhoto] = [180, 240];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('wikipedia.org')) return jsonResponse({ type: 'disambiguation' });
      return jsonResponse({ docs: [{ key: 'OL1A' }] });
    });

    expect(await findAuthorPhotoUrl('Jan Novák')).toBe(olPhoto);
  });

  it('findCoverForBook finds a cover for a book without ISBN via a matching catalog record', async () => {
    const cover = 'https://www.knihovny.cz/Cover/Show?isbn=8070613432&size=large';
    imageSizes[cover] = [170, 240];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' } as unknown as Headers,
      json: async () => ({
        records: [
          // review without ISBN, then a same-titled book by someone else, then the real one
          { title: 'Saturnin : Zdeněk Jirotka - recenze', isbns: [], authors: { primary: { 'Klára Špičková': [] } } },
          { title: 'Saturnin', isbns: ['80-00-00000-0'], authors: { primary: { 'Jan Jiný': [] } } },
          { title: 'Saturnin', isbns: ['80-7061-343-2'], authors: { primary: { 'Zdeněk Jirotka, 1911-2003': [] } } },
        ],
      }),
    } as unknown as Response);

    expect(await findCoverForBook({ title: 'Saturnin', author: 'Zdeněk Jirotka', isbn: '' })).toBe(cover);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('type=Title');
  });

  it('findCoverForBook returns null when nothing matches', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);
    expect(await findCoverForBook({ title: 'Moje rodinná kronika', author: 'Babička Marie' })).toBeNull();
  });

  it('findAuthorPhotoUrl returns null without an author', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await findAuthorPhotoUrl('')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('book image components', () => {
  it('BookCover shows a placeholder without a cover and after a broken one', () => {
    const { rerender } = render(<BookCover title="Bílá nemoc" />);
    expect(screen.getByTestId('cover-placeholder')).toHaveTextContent('Bílá nemoc');

    rerender(<BookCover title="Bílá nemoc" src="https://example.com/broken.jpg" />);
    const img = screen.getByRole('img', { name: 'Bílá nemoc' });
    fireEvent.error(img);
    expect(screen.getByTestId('cover-placeholder')).toBeInTheDocument();
  });

  it('AuthorAvatar falls back to the author initials', () => {
    render(<AuthorAvatar name="Karel Čapek" />);
    expect(screen.getByTestId('author-placeholder')).toHaveTextContent('KČ');
  });

  it('ReadToggle reports the toggled state', () => {
    const onChange = vi.fn();
    render(<ReadToggle checked={false} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Přečteno' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
