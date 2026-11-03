// Client-side OCR and online book recognition utility for static / GitHub Pages support

import { createWorker, PSM, type Worker } from 'tesseract.js';

// Re-creating and tearing down a Tesseract worker (which loads the language
// model) on every single scan is the dominant cost of the recognition loop —
// during continuous auto-scanning this happened every ~2 seconds. Keep one
// worker alive for the lifetime of the page/session and reuse it for every
// recognize() call instead.
let workerPromise: Promise<Worker> | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('ces+eng');
      // SPARSE_TEXT suits book covers much better than the default AUTO mode:
      // cover text is scattered in blocks of varying size/orientation rather
      // than one uniform paragraph.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return worker;
    })().catch((err) => {
      workerPromise = null; // allow retrying on the next call if init failed
      throw err;
    });
  }
  return workerPromise;
}

export interface BookSearchResult {
  title: string;
  author: string;
  genre: string;
  publisher: string;
  publishedYear: string;
  edition: string;
  pageCount: number | null;
  isbn: string;
  description: string;
  coverUrl: string;
}

interface GoogleBooksItem {
  volumeInfo?: {
    title?: string;
    authors?: string[];
    categories?: string[];
    publisher?: string;
    publishedDate?: string;
    pageCount?: number;
    description?: string;
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
  };
}

interface OpenLibraryDoc {
  title?: string;
  author_name?: string[];
  subject?: string[];
  publisher?: string[];
  first_publish_year?: number;
  publish_year?: number[];
  edition_count?: number;
  number_of_pages_median?: number;
  isbn?: string[];
  first_sentence?: string[];
  cover_i?: number;
}

// Validate an ISBN-13 checksum (mod 10, alternating weights 1/3)
export function isValidISBN13(isbn: string): boolean {
  if (!/^[0-9]{13}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(isbn[12]);
}

// Validate an ISBN-10 checksum (mod 11, weights 10..1, 'X' = 10)
export function isValidISBN10(isbn: string): boolean {
  if (!/^[0-9]{9}[0-9X]$/i.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(isbn[i]) * (10 - i);
  }
  const last = isbn[9].toUpperCase() === 'X' ? 10 : Number(isbn[9]);
  sum += last;
  return sum % 11 === 0;
}

export function isValidISBN(isbn: string): boolean {
  if (isbn.length === 13) return isValidISBN13(isbn);
  if (isbn.length === 10) return isValidISBN10(isbn);
  return false;
}

// Helper to extract and validate ISBN digits from text.
// Checksum validation rejects random digit runs that OCR noise (prices, page
// numbers, other barcodes) would otherwise produce as false-positive ISBNs.
export function extractISBN(text: string): string | null {
  if (!text) return null;

  // Search for 13-digit ISBN starting with 978 or 979
  const isbn13Regex = /(?:ISBN(?:-13)?:?\s*)?(97[89][-\s]?[0-9]{1,5}[-\s]?[0-9]{1,7}[-\s]?[0-9]{1,7}[-\s]?[0-9])/gi;
  let match;
  const isbn13Candidates: string[] = [];
  while ((match = isbn13Regex.exec(text)) !== null) {
    const cleaned = match[1].replace(/[-\s]/g, '');
    if (cleaned.length === 13) isbn13Candidates.push(cleaned);
  }
  const validIsbn13 = isbn13Candidates.find(isValidISBN13);
  if (validIsbn13) return validIsbn13;

  // Search for 10-digit ISBN
  const isbn10Regex = /(?:ISBN(?:-10)?:?\s*)?([0-9]{1,5}[-\s]?[0-9]{1,7}[-\s]?[0-9]{1,7}[-\s]?[0-9X])/gi;
  const isbn10Candidates: string[] = [];
  while ((match = isbn10Regex.exec(text)) !== null) {
    const cleaned = match[1].replace(/[-\s]/g, '');
    if (cleaned.length === 10) isbn10Candidates.push(cleaned);
  }
  const validIsbn10 = isbn10Candidates.find(isValidISBN10);
  if (validIsbn10) return validIsbn10;

  // Raw digits fallback for barcode OCR output without spaces/dashes
  const rawDigits = text.replace(/[^0-9X]/gi, '');
  const rawMatches13 = rawDigits.match(/97[89][0-9]{10}/g) || [];
  const validRaw13 = rawMatches13.find(isValidISBN13);
  if (validRaw13) return validRaw13;

  // If nothing passed checksum validation, fall back to the best-formed
  // (but unverified) candidate rather than giving up entirely — some OCR
  // engines misread a single digit, and an unchecked candidate still beats
  // no candidate when searching the book catalogs.
  return isbn13Candidates[0] || isbn10Candidates[0] || rawMatches13[0] || null;
}

// Strip only the separators users and scanners put into codes ("978-80-…",
// "ISBN 80 …") so the checksum validators can be applied to what's left.
export function normalizeISBNInput(raw: string): string {
  return raw.replace(/^\s*(?:ISBN|EAN)(?:-1[03])?:?/i, '').replace(/[^0-9X]/gi, '').toUpperCase();
}

export interface ISBNValidation {
  code: string;
  valid: boolean;
  message: string;
}

// Human-readable verdict for a typed/scanned code, used by the manual entry
// field. Any EAN-13 shares the ISBN-13 checksum, so both are accepted.
export function validateISBNInput(raw: string): ISBNValidation | null {
  const code = normalizeISBNInput(raw);
  if (!code) return null;
  if (code.length === 13) {
    if (!isValidISBN13(code)) return { code, valid: false, message: 'Neplatný kontrolní součet – zkontrolujte číslice.' };
    return { code, valid: true, message: /^97[89]/.test(code) ? 'Platné ISBN-13' : 'Platný EAN-13 (není ISBN)' };
  }
  if (code.length === 10) {
    if (!isValidISBN10(code)) return { code, valid: false, message: 'Neplatný kontrolní součet – zkontrolujte číslice.' };
    return { code, valid: true, message: 'Platné ISBN-10' };
  }
  return { code, valid: false, message: `Kód musí mít 10 nebo 13 číslic (zadáno ${code.length}).` };
}

// Library catalogs (Knihovny.cz in particular) return authority-form names
// like "Karel Čapek, 1890-1938" or "Čapek, Karel" — turn those into the plain
// "Karel Čapek" a reader expects and an author-photo lookup can match.
export function cleanAuthorName(name: string): string {
  const withoutDates = name.replace(/,?\s*\(?\d{3,4}\s*-\s*(?:\d{3,4})?\)?\s*$/, '').trim();
  const parts = withoutDates.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2 && !/\s/.test(parts[0])) {
    return `${parts[1]} ${parts[0]}`;
  }
  return withoutDates;
}

// Pull the code out of a catalog ISBN entry such as "978-80-7258-989-0 (brož.)"
// — normalizing the whole string would keep an "x" from qualifiers like "(box)".
export function catalogCode(entry: string): string {
  const match = entry.match(/[0-9][0-9\-\s]{7,15}[0-9Xx]/);
  return match ? normalizeISBNInput(match[0]) : '';
}

function isbn10To13(isbn10: string): string {
  const base = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  return base + String((10 - (sum % 10)) % 10);
}

// Compare codes across ISBN-10 / ISBN-13 forms of the same book.
function comparableCode(code: string): string {
  return code.length === 10 && isValidISBN10(code) ? isbn10To13(code) : code;
}

// Knihovny.cz only returns the fields it is asked for — without these the
// records come back without ISBNs, publishers, years or page counts.
const KNIHOVNY_FIELDS = [
  'title',
  'authors',
  'isbns',
  'publishers',
  'publicationDates',
  'physicalDescriptions',
  'edition',
  'subjects',
  'summary',
];

function knihovnyUrl(lookfor: string, type: string, limit: number): string {
  const fields = KNIHOVNY_FIELDS.map((f) => `&field[]=${f}`).join('');
  return `https://www.knihovny.cz/api/v1/search?lookfor=${encodeURIComponent(lookfor)}&type=${type}&limit=${limit}${fields}`;
}

const firstString = (value: unknown): string =>
  Array.isArray(value) ? (value.length ? String(value[0]) : '') : value ? String(value) : '';

// Catalog values keep ISBD punctuation: "Albatros," / "Praha :".
const stripTrailingPunctuation = (value: string) => value.replace(/[\s,;:/]+$/, '').trim();

function mapKnihovnyRecord(rec: Record<string, unknown>, coverIsbn: string): BookSearchResult {
  const authorsObj = rec.authors as { primary?: Record<string, unknown>; secondary?: Record<string, unknown> } | undefined;
  const primaryAuthor = authorsObj?.primary ? Object.keys(authorsObj.primary)[0] || '' : '';
  const secondaryAuthors = authorsObj?.secondary ? Object.keys(authorsObj.secondary) : [];
  const author = [primaryAuthor, ...secondaryAuthors].map(cleanAuthorName).filter(Boolean).join(', ');

  const publishers = rec.publishers;
  const publisher = Array.isArray(publishers)
    ? [...new Set(publishers.map((p) => stripTrailingPunctuation(String(p))).filter(Boolean))].join(', ')
    : stripTrailingPunctuation(String(publishers || ''));
  const yearMatch = firstString(rec.publicationDates).match(/\d{4}/);
  const subjects = rec.subjects;
  const genre = Array.isArray(subjects) ? subjects.flat().slice(0, 3).join(', ') : '';
  const summary = rec.summary;
  const description = Array.isArray(summary) ? summary.join(' ') : String(summary || '');
  const pagesMatch = firstString(rec.physicalDescriptions).match(/(\d+)\s*(?:stran|stránek|s\.|pages|p\.)/i);
  const isbns = Array.isArray(rec.isbns) ? rec.isbns.map((i) => catalogCode(String(i))).filter(Boolean) : [];
  const isbn = coverIsbn || isbns[0] || '';

  return {
    title: String(rec.title || rec.cleanTitle || ''),
    author,
    genre,
    publisher,
    publishedYear: yearMatch ? yearMatch[0] : '',
    edition: stripTrailingPunctuation(firstString(rec.edition)),
    pageCount: pagesMatch ? Number(pagesMatch[1]) : null,
    isbn,
    description,
    coverUrl: isbn ? `https://www.knihovny.cz/Cover/Show?isbn=${encodeURIComponent(isbn)}&size=medium` : '',
  };
}

async function fetchKnihovnyRecords(url: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('json')) return [];
    const data = await res.json();
    return Array.isArray(data?.records) ? data.records : [];
  } catch (err) {
    console.error('Knihovny.cz API search error:', err);
    return [];
  }
}

// Direct search Knihovny.cz API by ISBN/EAN. The ISN index also matches
// records that merely mention the code somewhere, so only records that list
// the code among their own ISBNs are kept.
export async function searchKnihovnyCz(isbn: string): Promise<BookSearchResult[]> {
  const code = normalizeISBNInput(isbn);
  if (!code) return [];
  const wanted = comparableCode(code);

  const records = await fetchKnihovnyRecords(knihovnyUrl(code, 'ISN', 20));
  return records
    .filter((rec) => {
      const isbns = Array.isArray(rec.isbns) ? rec.isbns : [];
      // Records fetched without the isbns field (older mocks / API changes)
      // can't be checked — keep them rather than dropping every result.
      if (!('isbns' in rec)) return true;
      return isbns.some((entry) => comparableCode(catalogCode(String(entry))) === wanted);
    })
    .map((rec) => mapKnihovnyRecord(rec, code));
}

// Free-text Knihovny.cz search — the best source for Czech titles recognized
// from a cover photo.
export async function searchKnihovnyCzText(query: string): Promise<BookSearchResult[]> {
  if (!query.trim()) return [];
  const records = await fetchKnihovnyRecords(knihovnyUrl(query, 'AllFields', 5));
  return records.map((rec) => mapKnihovnyRecord(rec, ''));
}

// The keyless Google Books quota runs out regularly (HTTP 429); once it does,
// stop spending a round trip on it for every query of every scan.
const GOOGLE_QUOTA_BACKOFF_MS = 10 * 60 * 1000;
let googleBlockedUntil = 0;

export function resetGoogleBooksBackoff(): void {
  googleBlockedUntil = 0;
}

// Direct search Google Books API
export async function searchGoogleBooks(query: string): Promise<BookSearchResult[]> {
  if (Date.now() < googleBlockedUntil) return [];
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`);
    if (res.status === 429) googleBlockedUntil = Date.now() + GOOGLE_QUOTA_BACKOFF_MS;
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items) return [];

    return data.items.map((item: GoogleBooksItem) => {
      const info = item.volumeInfo || {};
      const industryIdentifiers = info.industryIdentifiers || [];
      const isbnObj = industryIdentifiers.find((i) => i.type === 'ISBN_13') || industryIdentifiers.find((i) => i.type === 'ISBN_10');

      return {
        title: info.title || '',
        author: info.authors ? info.authors.join(', ') : '',
        genre: info.categories ? info.categories.join(', ') : '',
        publisher: info.publisher || '',
        publishedYear: info.publishedDate ? info.publishedDate.substring(0, 4) : '',
        edition: info.publishedDate || '',
        pageCount: info.pageCount || null,
        isbn: isbnObj ? isbnObj.identifier : '',
        description: info.description || '',
        coverUrl: info.imageLinks ? (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail)?.replace('http://', 'https://') : '',
      };
    });
  } catch (err) {
    console.error('Google Books API search error:', err);
    return [];
  }
}

// Direct search Open Library API
export async function searchOpenLibrary(query: string): Promise<BookSearchResult[]> {
  try {
    const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.docs) return [];

    return data.docs.map((doc: OpenLibraryDoc) => ({
      title: doc.title || '',
      author: doc.author_name ? doc.author_name.join(', ') : '',
      genre: doc.subject ? doc.subject.slice(0, 3).join(', ') : '',
      publisher: doc.publisher ? doc.publisher[0] : '',
      publishedYear: doc.first_publish_year ? String(doc.first_publish_year) : doc.publish_year ? String(doc.publish_year[0]) : '',
      edition: doc.edition_count ? `${doc.edition_count}. vydání` : '',
      pageCount: doc.number_of_pages_median || null,
      isbn: doc.isbn ? doc.isbn[0] : '',
      description: doc.first_sentence ? doc.first_sentence.join(' ') : '',
      coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : '',
    }));
  } catch (err) {
    console.error('OpenLibrary API search error:', err);
    return [];
  }
}

interface OpenLibraryEdition {
  title?: string;
  subtitle?: string;
  authors?: Array<{ name?: string }>;
  publishers?: Array<{ name?: string }>;
  publish_date?: string;
  number_of_pages?: number;
  subjects?: Array<{ name?: string }>;
  cover?: { medium?: string; large?: string };
}

// Edition-level Open Library lookup. search.json answers with *work* data
// (the original title, language and first publication year), which is wrong
// for a specific edition: the Penguin English "Crime and Punishment" came
// back as "Преступление и наказание", 1866.
export async function searchOpenLibraryByISBN(isbn: string): Promise<BookSearchResult[]> {
  try {
    const code = normalizeISBNInput(isbn);
    const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(code)}&format=json&jscmd=data`);
    if (!res.ok) return [];
    const data = await res.json();
    const edition = data?.[`ISBN:${code}`] as OpenLibraryEdition | undefined;
    if (!edition?.title) return [];
    const yearMatch = (edition.publish_date || '').match(/\d{4}/);
    return [
      {
        title: edition.subtitle ? `${edition.title}: ${edition.subtitle}` : edition.title,
        author: (edition.authors || []).map((a) => a.name).filter(Boolean).join(', '),
        genre: (edition.subjects || []).slice(0, 3).map((s) => s.name).filter(Boolean).join(', '),
        publisher: (edition.publishers || []).map((p) => p.name).filter(Boolean).join(', '),
        publishedYear: yearMatch ? yearMatch[0] : '',
        edition: '',
        pageCount: edition.number_of_pages || null,
        isbn: code,
        description: '',
        coverUrl: edition.cover?.large || edition.cover?.medium || '',
      },
    ];
  } catch (err) {
    console.error('OpenLibrary edition lookup error:', err);
    return [];
  }
}

// Catalog lookup by an exact ISBN/EAN, most local source first.
async function searchByISBN(isbn: string): Promise<BookSearchResult[]> {
  let results = await searchKnihovnyCz(isbn);
  if (results.length === 0) {
    results = await searchGoogleBooks(`isbn:${isbn}`);
  }
  if (results.length === 0) {
    results = await searchOpenLibraryByISBN(isbn);
  }
  return dedupeResults(results);
}

// Several catalog records for one code are usually the same book held by
// different libraries; genuinely different titles (a box-set ISBN shared by
// every volume) are kept so the user can pick the right one.
function dedupeResults(results: BookSearchResult[]): BookSearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = foldText(r.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Look up a manually entered or scanned code. Unlike resolveBookFromText this
// never falls back to a fuzzy text search: a wrong-but-plausible match is
// exactly what the user is trying to correct by typing the code in.
export async function lookupBooksByISBN(raw: string): Promise<BookSearchResult[]> {
  const isbn = normalizeISBNInput(raw);
  if (!isValidISBN(isbn)) return [];
  const results = await searchByISBN(isbn);
  return results.map((r) => ({ ...r, isbn: r.isbn || isbn }));
}

export async function lookupBookByISBN(raw: string): Promise<BookSearchResult | null> {
  const [best] = await lookupBooksByISBN(raw);
  return best || null;
}

// Placeholder title used only when no real catalog match was found — a single
// constant so every caller (client + server) can detect a low-confidence
// result the same way, instead of each re-implementing its own string check.
export const UNRECOGNIZED_TITLE = 'Nerozpoznaná kniha';

const CZ_CHARS = 'áěíéóúůýžščřďťňÁĚÍÉÓÚŮÝŽŠČŘĎŤŇ';

// A line is "noise" for search-query purposes when it's dominated by digits
// or symbols (barcode numbers, prices, page counts) rather than real words —
// those lines actively hurt a title/author search rather than helping it.
function isNoiseLine(line: string): boolean {
  const letters = (line.match(new RegExp(`[a-zA-Z${CZ_CHARS}]`, 'g')) || []).length;
  const digits = (line.match(/[0-9]/g) || []).length;
  if (letters === 0) return true;
  return digits > letters;
}

// OCR of real covers produces lines like "=, b" or "| Za oc® n Ss," — keep
// only lines with at least one word-like token of 3+ letters.
function hasRealWord(line: string): boolean {
  return line.split(/\s+/).some((w) => new RegExp(`^[a-zA-Z${CZ_CHARS}]{3,}$`).test(w));
}

function cleanLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim().replace(new RegExp(`[^a-zA-Z0-9${CZ_CHARS}\\s]`, 'g'), ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 2 && !isNoiseLine(l) && hasRealWord(l));
}

// Lowercase and strip diacritics so "Malý princ" matches OCR's "maly princ".
function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Articles plus words that appear on so many covers ("KNIHA", "román") that
// matching them alone says nothing about which book it is.
const STOP_WORDS = new Set([
  'the', 'and', 'der', 'die', 'das', 'les', 'des', 'pro', 'nebo', 'jak', 'book', 'books', 'novel',
  'roman', 'kniha', 'knihy', 'povidky', 'basne', 'sbirka', 'pribehy', 'vybor', 'dil', 'svazek',
]);

function significantWords(text: string): string[] {
  const words = foldText(text)
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

// A text search always returns *something*; only trust a hit whose title
// actually appears in what the camera read. Without this, OCR noise such as
// "D sv. 13" was "confidently" recognized as Vergil's Aeneid.
// How well a catalog hit explains the OCR text: matched title words count
// most, a matching author breaks ties ("Malý princ" beats "Princ & princ").
export function relevanceScore(result: BookSearchResult, ocrText: string): number {
  if (!isRelevantMatch(result, ocrText)) return 0;
  const ocrWords = new Set(significantWords(ocrText));
  const titleHits = significantWords(result.title).filter((w) => ocrWords.has(w)).length;
  const authorHits = significantWords(result.author).filter((w) => ocrWords.has(w)).length;
  return titleHits * 10 + Math.min(authorHits, 3) * 3;
}

export function isRelevantMatch(result: BookSearchResult, ocrText: string): boolean {
  const ocrWords = new Set(significantWords(ocrText));
  const coverage = (words: string[]) => words.filter((w) => ocrWords.has(w)).length / words.length;

  const mainTitle = significantWords(result.title.split(/[:/=]/)[0]);
  const fullTitle = significantWords(result.title);
  if (mainTitle.length === 0) return false;
  // A single word ("Bál", "Malý?", "Princ & princ") matches far too many
  // covers: it needs to be long and the author has to be on the cover too.
  if (mainTitle.length === 1) {
    if (mainTitle[0].length < 4) return false;
    const authorWords = significantWords(result.author);
    if (!authorWords.some((w) => ocrWords.has(w))) return false;
  }
  // The main title must be on the cover, and a long subtitle may not be
  // completely unrelated to it.
  return coverage(mainTitle) >= 0.6 && coverage(fullTitle) >= 0.25;
}

function buildTextQueries(lines: string[]): string[] {
  // Prefer the alphabetically-richest lines (likely title/author) over
  // whatever happened to be first/last on the cover — but also try each of
  // the top lines alone, since one garbled line spoils a combined query.
  const rankedLines = [...lines].sort((a, b) => b.length - a.length);
  const firstWords = (line: string | undefined, n: number) => (line || '').split(' ').slice(0, n).join(' ');
  return [
    lines.slice(0, 3).join(' '),
    lines.slice(0, 2).join(' '),
    lines[0],
    firstWords(lines[0], 2),
    rankedLines.slice(0, 2).join(' '),
    rankedLines[0],
    lines[1],
  ]
    .filter((q, idx, arr) => q && q.length > 2 && arr.indexOf(q) === idx)
    .slice(0, 6);
}

// A bare code ("isbn:9990004156548", or what a barcode scanner returns) that
// extractISBN skips because it isn't a 978/979 ISBN, e.g. a plain EAN-13.
function codeFromQuery(text: string): string | null {
  const validation = validateISBNInput(text.replace(/^\s*isbn:/i, ''));
  return validation?.valid && /^\s*(?:isbn:)?[\s0-9Xx-]+$/i.test(text) ? validation.code : null;
}

// Resolve a book from already-extracted OCR/typed text, trying ISBN lookups
// first and falling back to progressively looser title/author text search.
// Shared by both the server OCR route and the client-side OCR path so the
// two never drift out of sync with each other again.
export async function resolveBookFromText(
  extractedText: string,
  imageFallback?: string
): Promise<{ result: BookSearchResult; confident: boolean; rawText: string; alternatives?: BookSearchResult[] }> {
  const isbn = extractISBN(extractedText) || codeFromQuery(extractedText);
  const lines = extractedText ? cleanLines(extractedText) : [];

  if (isbn) {
    const byCode = await lookupBooksByISBN(isbn);
    if (byCode.length > 0) {
      return {
        result: { ...byCode[0], coverUrl: byCode[0].coverUrl || imageFallback || '' },
        confident: true,
        rawText: extractedText,
        alternatives: byCode.length > 1 ? byCode : undefined,
      };
    }
  }

  // Collect the best-scoring hit across queries and sources; stop early only
  // once a hit explains the cover well (2+ title words plus the author).
  let best: { result: BookSearchResult; score: number } | null = null;
  search: for (const query of buildTextQueries(lines)) {
    for (const search of [searchKnihovnyCzText, searchGoogleBooks, searchOpenLibrary]) {
      for (const candidate of await search(query)) {
        const score = relevanceScore(candidate, extractedText);
        if (score > 0 && (!best || score > best.score)) best = { result: candidate, score };
      }
      if (best && best.score >= 23) break search;
    }
  }

  if (best) {
    return {
      result: {
        ...best.result,
        isbn: best.result.isbn || isbn || '',
        coverUrl: best.result.coverUrl || imageFallback || '',
      },
      confident: true,
      rawText: extractedText,
    };
  }

  // No catalog match found — return whatever OCR captured as a low-confidence
  // starting point for manual editing, clearly flagged via `confident: false`.
  return {
    result: {
      title: lines[0] || UNRECOGNIZED_TITLE,
      author: lines[1] || '',
      genre: '',
      publisher: '',
      publishedYear: '',
      edition: '',
      pageCount: null,
      isbn: isbn || '',
      description: extractedText,
      coverUrl: imageFallback || '',
    },
    confident: false,
    rawText: extractedText,
  };
}

export interface BarcodeResolution {
  result: BookSearchResult;
  confident: boolean;
  alternatives?: BookSearchResult[];
}

// Resolve a decoded barcode. Codes failing the checksum (misreads, library
// stickers, CODE_128 shelf labels) return null so the scanner keeps looking
// instead of opening the form with garbage; a valid code the catalogs don't
// know still opens the form with just the ISBN filled in.
export async function resolveBookFromBarcode(text: string): Promise<BarcodeResolution | null> {
  const validation = validateISBNInput(text);
  if (!validation?.valid) return null;
  const found = await lookupBooksByISBN(validation.code);
  if (found.length > 0) {
    return { result: found[0], confident: true, alternatives: found.length > 1 ? found : undefined };
  }
  return {
    result: {
      title: '',
      author: '',
      genre: '',
      publisher: '',
      publishedYear: '',
      edition: '',
      pageCount: null,
      isbn: validation.code,
      description: '',
      coverUrl: '',
    },
    confident: false,
  };
}

// Perform client-side OCR on image string or process direct text query
export async function processImageOrQuery(input: {
  image?: string;
  query?: string;
}): Promise<{ result: BookSearchResult; confident: boolean; rawText?: string; alternatives?: BookSearchResult[] }> {
  let extractedText = '';

  if (input.query) {
    extractedText = input.query;
  } else if (input.image) {
    try {
      const worker = await getOcrWorker();
      const ret = await worker.recognize(input.image);
      extractedText = ret.data.text;
    } catch (err) {
      console.error('Client OCR error:', err);
    }
  }

  return resolveBookFromText(extractedText, input.image);
}
