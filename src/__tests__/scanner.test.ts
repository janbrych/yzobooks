import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchKnihovnyCz,
  extractISBN,
  processImageOrQuery,
  resolveBookFromText,
  isValidISBN10,
  isValidISBN13,
  UNRECOGNIZED_TITLE,
  cleanAuthorName,
  normalizeISBNInput,
  validateISBNInput,
  lookupBookByISBN,
  lookupBooksByISBN,
  searchOpenLibraryByISBN,
  catalogCode,
  isRelevantMatch,
  resolveBookFromBarcode,
  searchGoogleBooks,
  resetGoogleBooksBackoff,
  BookSearchResult,
} from '@/lib/scanner';

const knihovnyResponse = (records: unknown[]) =>
  ({
    ok: true,
    headers: { get: () => 'application/json' } as unknown as Headers,
    json: async () => ({ records }),
  }) as unknown as Response;

const book = (title: string, author = ''): BookSearchResult => ({
  title,
  author,
  genre: '',
  publisher: '',
  publishedYear: '',
  edition: '',
  pageCount: null,
  isbn: '',
  description: '',
  coverUrl: '',
});

describe('scanner module unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGoogleBooksBackoff();
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
      expect.stringContaining('https://www.knihovny.cz/api/v1/search?lookfor=9788020455505&type=ISN'),
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
      expect.stringContaining('https://www.knihovny.cz/api/v1/search?lookfor=9788020455505&type=ISN'),
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

  it('cleanAuthorName turns catalog authority names into plain reader-facing names', () => {
    expect(cleanAuthorName('Karel Čapek, 1890-1938')).toBe('Karel Čapek');
    expect(cleanAuthorName('Blanka Kochová, 1991-')).toBe('Blanka Kochová');
    expect(cleanAuthorName('Čapek, Karel')).toBe('Karel Čapek');
    expect(cleanAuthorName('Jan Novák')).toBe('Jan Novák');
  });

  it('searchKnihovnyCz cleans author names, drops secondary contributors and dashes in ISBNs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' } as unknown as Headers,
      json: async () => ({
        records: [
          {
            title: 'Bílá nemoc',
            authors: { primary: { 'Karel Čapek, 1890-1938': [] }, secondary: { 'Blanka Kochová, 1991-': [] } },
            isbns: ['978-80-7483-208-6'],
          },
        ],
      }),
    } as unknown as Response);

    const [result] = await searchKnihovnyCz('9788074832086');
    expect(result.author).toBe('Karel Čapek'); // translators/illustrators are not authors
    expect(result.isbn).toBe('9788074832086');
  });

  it('normalizeISBNInput strips prefixes and separators from typed codes', () => {
    expect(normalizeISBNInput('ISBN 978-80-7483-208-6')).toBe('9788074832086');
    expect(normalizeISBNInput(' 80-7178-432-x ')).toBe('807178432X');
    expect(normalizeISBNInput('EAN: 8594001150019')).toBe('8594001150019');
  });

  it('validateISBNInput reports valid ISBN/EAN codes and explains invalid ones', () => {
    expect(validateISBNInput('')).toBeNull();
    expect(validateISBNInput('978-80-7483-208-6')).toMatchObject({ code: '9788074832086', valid: true, message: 'Platné ISBN-13' });
    expect(validateISBNInput('8594001150014')).toMatchObject({ valid: true, message: 'Platný EAN-13 (není ISBN)' });
    expect(validateISBNInput('0306406152')).toMatchObject({ valid: true, message: 'Platné ISBN-10' });
    expect(validateISBNInput('9788074832087')?.valid).toBe(false);
    expect(validateISBNInput('97880748')).toMatchObject({ valid: false, message: expect.stringContaining('zadáno 8') });
  });

  it('lookupBookByISBN rejects invalid codes without hitting the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await lookupBookByISBN('9788074832087')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lookupBookByISBN never falls back to a fuzzy text search when the code is unknown', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);
    expect(await lookupBookByISBN('978-80-7483-208-6')).toBeNull();
    const urls = fetchSpy.mock.calls.map(([url]) => String(url));
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain('knihovny.cz');
    expect(urls[1]).toContain('isbn%3A9788074832086');
    expect(urls[2]).toContain('openlibrary.org/api/books?bibkeys=ISBN:9788074832086');
  });

  it('lookupBookByISBN returns the catalog match for a valid code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' } as unknown as Headers,
      json: async () => ({ records: [{ title: 'Bílá nemoc', authors: { primary: { 'Karel Čapek, 1890-1938': [] } }, isbns: ['978-80-7483-208-6'] }] }),
    } as unknown as Response);

    const result = await lookupBookByISBN('978-80-7483-208-6');
    expect(result).toMatchObject({ title: 'Bílá nemoc', author: 'Karel Čapek', isbn: '9788074832086' });
  });

  // --- Regressions found by testing against the live catalogs ---

  it('searchKnihovnyCz asks for the ISBN/publisher/year fields (the API omits them by default)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(knihovnyResponse([]));
    await searchKnihovnyCz('9788074832086');
    const url = String(fetchSpy.mock.calls[0][0]);
    for (const field of ['isbns', 'publishers', 'publicationDates', 'physicalDescriptions']) {
      expect(url).toContain(`field[]=${field}`);
    }
  });

  it('searchKnihovnyCz drops records that do not list the searched code (e.g. 9780000000002)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      knihovnyResponse([{ title: 'Josef Jambor : Tišnovská sbírka', isbns: ['978-80-7027-315-9'] }])
    );
    expect(await searchKnihovnyCz('9780000000002')).toEqual([]);
  });

  it('searchKnihovnyCz maps year, cleaned publisher, page count and ISBN qualifiers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      knihovnyResponse([
        {
          title: 'Babička',
          isbns: ['978-80-7258-989-0 (brož.)'],
          publishers: ['Národní divadlo,', 'Národní divadlo,'],
          publicationDates: ['c2007'],
          physicalDescriptions: ['383 stran ; 20 cm'],
          edition: ['4. vydání,'],
        },
      ])
    );
    const [result] = await searchKnihovnyCz('9788072589890');
    expect(result).toMatchObject({
      isbn: '9788072589890',
      publisher: 'Národní divadlo',
      publishedYear: '2007',
      pageCount: 383,
      edition: '4. vydání',
    });
  });

  it('searchKnihovnyCz matches a record listing the ISBN-10 form of a searched ISBN-13', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(knihovnyResponse([{ title: 'The Thief Lord', isbns: ['0-439-42089-X'] }]));
    expect(await searchKnihovnyCz('9780439420891')).toHaveLength(1);
  });

  it('catalogCode ignores letters in catalog qualifiers like "(box)"', () => {
    expect(catalogCode('978-80-00-06780-3 (box)')).toBe('9788000067803');
    expect(catalogCode('80-7178-432-X (váz.)')).toBe('807178432X');
  });

  it('lookupBooksByISBN keeps every distinct title sharing a box-set ISBN, but merges duplicates', async () => {
    const isbns = ['978-80-00-06780-3'];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      knihovnyResponse([
        { title: 'Harry Potter a vězeň z Azkabanu', isbns },
        { title: 'Harry Potter a Kámen mudrců', isbns },
        { title: 'Harry Potter a Kámen mudrců', isbns },
      ])
    );
    const results = await lookupBooksByISBN('9788000067803');
    expect(results.map((r) => r.title)).toEqual(['Harry Potter a vězeň z Azkabanu', 'Harry Potter a Kámen mudrců']);
  });

  it('searchOpenLibraryByISBN uses edition data, not the original work (Crime and Punishment, Penguin)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        'ISBN:9780140449136': {
          title: 'Crime and punishment',
          authors: [{ name: 'Fiódor Dostoievski' }],
          publishers: [{ name: 'Penguin' }],
          publish_date: '2003',
          number_of_pages: 671,
          cover: { large: 'https://covers.openlibrary.org/b/id/1-L.jpg' },
        },
      }),
    } as Response);
    const [result] = await searchOpenLibraryByISBN('978-0-14-044913-6');
    expect(result).toMatchObject({ title: 'Crime and punishment', publisher: 'Penguin', publishedYear: '2003', pageCount: 671 });
  });

  it('isRelevantMatch rejects catalog hits unrelated to the OCR text', () => {
    expect(isRelevantMatch(book('To Kill a Kingdom'), 'TO KILL A Mockingbird')).toBe(false);
    expect(isRelevantMatch(book('Le Bal'), '=, b bal Ds Ada')).toBe(false);
    expect(isRelevantMatch(book('Malý? : kdo zná jen malý cíl! sketch'), 'Malý\nprinc')).toBe(false);
    expect(isRelevantMatch(book('Kniha : 54. výstava'), 'KNIHA STOW')).toBe(false);
    expect(isRelevantMatch(book('Princ & princ', 'Linda de Haan'), 'princ\nde Saint-Exupéry')).toBe(false);
    expect(isRelevantMatch(book('Dune', 'Frank Herbert'), 'DUNE\nFRANK HERBERT')).toBe(true);
    expect(isRelevantMatch(book('Soil'), 'vás a SOIL Narrativa')).toBe(false); // one word, no author to confirm
    expect(isRelevantMatch(book('To kill a mockingbird'), 'TO KILL A Mockingbird')).toBe(true);
    expect(isRelevantMatch(book('Malý princ'), 'Malý\nprinc\nde Saint-Cxupéry')).toBe(true);
  });

  it('resolveBookFromText does not "confidently" match OCR noise to a random catalog book', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('openlibrary.org/search.json')) {
        return { ok: true, json: async () => ({ docs: [{ title: 'Aeneis', author_name: ['Vergilius'] }] }) } as Response;
      }
      return { ok: false } as Response;
    });
    const { confident } = await resolveBookFromText('D sv. 13 Aeneid-free noise');
    expect(confident).toBe(false);
  });

  it('resolveBookFromText prefers the hit that explains more of the cover', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('knihovny.cz')) {
        return knihovnyResponse([
          { title: 'Princ & princ', authors: { primary: { 'Linda de Haan': [] } } },
          { title: 'Malý princ', authors: { primary: { 'Antoine de Saint-Exupéry, 1900-1944': [] } } },
        ]);
      }
      return { ok: false } as Response;
    });
    const { result, confident } = await resolveBookFromText('Malý\n\nprinc\n\nde Saint-Cxupéry\n\nfntoine');
    expect(confident).toBe(true);
    expect(result.title).toBe('Malý princ');
  });

  it('resolveBookFromText looks up a scanned EAN-13 that is not an ISBN', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      knihovnyResponse([{ title: 'Osudy dobrého vojáka Švejka', isbns: ['9990004156548'] }])
    );
    const { result, confident } = await resolveBookFromText('isbn:9990004156548');
    expect(String(fetchSpy.mock.calls[0][0])).toContain('lookfor=9990004156548&type=ISN');
    expect(confident).toBe(true);
    expect(result.title).toBe('Osudy dobrého vojáka Švejka');
  });

  it('resolveBookFromText never uses a bare code as the fallback title', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);
    const { result, confident } = await resolveBookFromText('isbn:9788074832086');
    expect(confident).toBe(false);
    expect(result.title).toBe(UNRECOGNIZED_TITLE);
    expect(result.isbn).toBe('9788074832086');
  });

  it('resolveBookFromBarcode ignores misread / non-book barcodes so scanning continues', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await resolveBookFromBarcode('9788074832087')).toBeNull(); // bad checksum
    expect(await resolveBookFromBarcode('LIB-000123')).toBeNull(); // CODE_128 library sticker
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolveBookFromBarcode returns an ISBN-only, low-confidence result for an unknown code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response);
    const scanned = await resolveBookFromBarcode('5449000000996');
    expect(scanned).toMatchObject({ confident: false, result: { isbn: '5449000000996', title: '' } });
  });

  it('resolveBookFromBarcode passes along alternatives for a shared box-set code', async () => {
    const isbns = ['978-80-00-06780-3'];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      knihovnyResponse([
        { title: 'Harry Potter a vězeň z Azkabanu', isbns },
        { title: 'Harry Potter a Kámen mudrců', isbns },
      ])
    );
    const scanned = await resolveBookFromBarcode('9788000067803');
    expect(scanned?.confident).toBe(true);
    expect(scanned?.alternatives).toHaveLength(2);
  });

  it('searchGoogleBooks stops calling the API after a quota error (429)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 429 } as Response);
    await searchGoogleBooks('Dune');
    await searchGoogleBooks('Malý princ');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
