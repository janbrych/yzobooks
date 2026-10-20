import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchKnihovnyCz, extractISBN, processImageOrQuery } from '@/lib/scanner';

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
});
