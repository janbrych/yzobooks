import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchKnihovnyCz,
  extractISBN,
  processImageOrQuery,
  resolveBookFromText,
  isValidISBN10,
  isValidISBN13,
  UNRECOGNIZED_TITLE,
} from '@/lib/scanner';

describe('scanner module unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('searchKnihovnyCz handles successful JSON response', async () => {
    const mockData = {
      resultCount: 1,
      records: [
        {
          id: '123',
          title: 'Testovací Kniha',
          authors: {
            primary: { 'Jan Novák': {} },
          },
          publishers: ['Nakladatelství XYZ'],
          publicationDates: ['2023'],
          isbns: ['9788020455505'],
          summary: ['Popis knihy'],
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: {
        get: (headerName: string) => (headerName.toLowerCase() === 'content-type' ? 'application/json' : null),
      } as unknown as Headers,
      json: async () => mockData,
    } as unknown as Response);

    const results = await searchKnihovnyCz('9788020455505');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://www.knihovny.cz/api/v1/search?lookfor=9788020455505&type=ISN',
      expect.objectContaining({
        headers: { Accept: 'application/json' },
      })
    );

    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Testovací Kniha');
    expect(results[0].author).toBe('Jan Novák');
    expect(results[0].publisher).toBe('Nakladatelství XYZ');
    expect(results[0].isbn).toBe('9788020455505');
  });

  it('searchKnihovnyCz returns empty array on non-JSON / HTML error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: {
        get: (headerName: string) => (headerName.toLowerCase() === 'content-type' ? 'text/html' : null),
      } as unknown as Headers,
      json: async () => ({}),
    } as unknown as Response);

    const results = await searchKnihovnyCz('9788020455505');
    expect(results).toEqual([]);
  });

  it('processImageOrQuery queries Knihovny.cz first when given an ISBN query', async () => {
    const mockKnihovnyData = {
      records: [
        {
          title: 'Kniha z Knihovny.cz',
          authors: { primary: { 'Petr Rychlý': {} } },
          isbns: ['9788020455505'],
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('knihovny.cz')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' } as unknown as Headers,
          json: async () => mockKnihovnyData,
        } as Response;
      }
      return { ok: false } as Response;
    });

    const res = await processImageOrQuery({ query: 'isbn:9788020455505' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://www.knihovny.cz/api/v1/search?lookfor=9788020455505&type=ISN',
      expect.anything()
    );
    expect(res.result.title).toBe('Kniha z Knihovny.cz');
    expect(res.result.author).toBe('Petr Rychlý');
  });

  it('extractISBN extracts 13-digit and 10-digit ISBNs correctly', () => {
    expect(extractISBN('ISBN 978-80-204-5550-5')).toBe('9788020455505');
    expect(extractISBN('ISBN 80-204-5550-X')).toBe('802045550X');
    expect(extractISBN('Žádný kód v textu')).toBeNull();
  });

  it('isValidISBN13 / isValidISBN10 validate checksums correctly', () => {
    expect(isValidISBN13('9780316769488')).toBe(true);
    expect(isValidISBN13('9780316769480')).toBe(false); // wrong check digit
    expect(isValidISBN10('0316769487')).toBe(true);
    expect(isValidISBN10('0316769480')).toBe(false);
  });

  it('extractISBN prefers a checksum-valid ISBN over invalid-looking digit noise earlier in the text', () => {
    // "123456789" is not a valid ISBN-10 (bad checksum); the real ISBN-13
    // later in the text should be picked instead of the first candidate found.
    const text = 'Cena: 123456789 Kč\nISBN 978-0-316-76948-8';
    expect(extractISBN(text)).toBe('9780316769488');
  });

  it('resolveBookFromText filters out numeric/barcode noise lines before building a search query', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('googleapis.com')) {
        const parsed = new URL(urlStr);
        expect(parsed.searchParams.get('q')).not.toMatch(/\d{3,}/); // no long digit runs leaked into the query
        return {
          ok: true,
          json: async () => ({
            items: [{ volumeInfo: { title: 'Dune', authors: ['Frank Herbert'] } }],
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    const { result, confident } = await resolveBookFromText('123456789012\nDune\nFrank Herbert\n8,50 Kč');

    expect(fetchSpy).toHaveBeenCalled();
    expect(confident).toBe(true);
    expect(result.title).toBe('Dune');
  });

  it('resolveBookFromText returns confident:false with a clear placeholder title when nothing matches', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);

    const { result, confident } = await resolveBookFromText('', undefined);

    expect(confident).toBe(false);
    expect(result.title).toBe(UNRECOGNIZED_TITLE);
  });

  it('processImageOrQuery passes a direct text query straight through to resolveBookFromText', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('knihovny.cz')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' } as unknown as Headers,
          json: async () => ({ records: [{ title: 'Jáma a kyvadlo', authors: { primary: { 'Edgar Allan Poe': {} } }, isbns: ['9780316769488'] }] }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    const res = await processImageOrQuery({ query: 'isbn:9780316769488' });
    expect(res.confident).toBe(true);
    expect(res.result.title).toBe('Jáma a kyvadlo');
  });
});
