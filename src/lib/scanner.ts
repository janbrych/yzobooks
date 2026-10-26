// Client-side OCR and online book recognition utility for static / GitHub Pages support

import { createWorker } from 'tesseract.js';

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

// Direct search Knihovny.cz API
export async function searchKnihovnyCz(isbn: string): Promise<BookSearchResult[]> {
  try {
    const cleanedIsbn = isbn.replace(/[^0-9X]/gi, '');
    if (!cleanedIsbn) return [];

    const res = await fetch(`https://www.knihovny.cz/api/v1/search?lookfor=${encodeURIComponent(cleanedIsbn)}&type=ISN`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('json')) return [];

    const data = await res.json();
    if (!data || !data.records || !Array.isArray(data.records) || data.records.length === 0) {
      return [];
    }

    return data.records.map((rec: Record<string, unknown>) => {
      const authorsObj = rec.authors as { primary?: Record<string, unknown>; secondary?: Record<string, unknown> } | undefined;
      const primaryAuthor = authorsObj?.primary ? Object.keys(authorsObj.primary)[0] || '' : '';
      const secondaryAuthors = authorsObj?.secondary ? Object.keys(authorsObj.secondary) : [];
      const author = [primaryAuthor, ...secondaryAuthors].filter(Boolean).join(', ');

      const title = (rec.title || rec.cleanTitle || '') as string;
      const publishers = rec.publishers;
      const publisher = Array.isArray(publishers) ? publishers.join(', ') : ((publishers || '') as string);
      const pubDates = rec.publicationDates;
      const publishedYear = Array.isArray(pubDates) ? String(pubDates[0]) : pubDates ? String(pubDates) : '';
      const subjects = rec.subjects;
      const genre = Array.isArray(subjects) ? subjects.flat().slice(0, 3).join(', ') : '';
      const summary = rec.summary;
      const description = Array.isArray(summary) ? summary.join(' ') : ((summary || '') as string);
      const isbns = rec.isbns;
      const recIsbn = Array.isArray(isbns) ? String(isbns[0]) : cleanedIsbn;

      return {
        title,
        author,
        genre,
        publisher,
        publishedYear: publishedYear ? publishedYear.substring(0, 4) : '',
        edition: '',
        pageCount: null,
        isbn: recIsbn || cleanedIsbn,
        description,
        coverUrl: `https://www.knihovny.cz/Cover/Show?isbn=${encodeURIComponent(cleanedIsbn)}&size=medium`,
      };
    });
  } catch (err) {
    console.error('Knihovny.cz API search error:', err);
    return [];
  }
}

// Direct search Google Books API
export async function searchGoogleBooks(query: string): Promise<BookSearchResult[]> {
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`);
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

function cleanLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim().replace(new RegExp(`[^a-zA-Z0-9${CZ_CHARS}\\s]`, 'g'), ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 2 && !isNoiseLine(l));
}

// Resolve a book from already-extracted OCR/typed text, trying ISBN lookups
// first and falling back to progressively looser title/author text search.
// Shared by both the server OCR route and the client-side OCR path so the
// two never drift out of sync with each other again.
export async function resolveBookFromText(
  extractedText: string,
  imageFallback?: string
): Promise<{ result: BookSearchResult; confident: boolean; rawText: string }> {
  const isbn = extractISBN(extractedText);
  let searchResults: BookSearchResult[] = [];

  if (isbn) {
    searchResults = await searchKnihovnyCz(isbn);
    if (searchResults.length === 0) {
      searchResults = await searchGoogleBooks(`isbn:${isbn}`);
    }
    if (searchResults.length === 0) {
      searchResults = await searchOpenLibrary(isbn);
    }
  }

  if (searchResults.length === 0 && extractedText) {
    const lines = cleanLines(extractedText);

    // Prefer the alphabetically-richest lines (likely title/author) over
    // whatever happened to be first/last on the cover.
    const rankedLines = [...lines].sort((a, b) => b.length - a.length);

    const candidateQueries = [lines.slice(0, 3).join(' '), rankedLines.slice(0, 2).join(' '), rankedLines[0]].filter(
      (q, idx, arr) => q && arr.indexOf(q) === idx
    );

    for (const query of candidateQueries) {
      searchResults = await searchGoogleBooks(query);
      if (searchResults.length === 0) {
        searchResults = await searchOpenLibrary(query);
      }
      if (searchResults.length > 0) break;
    }
  }

  const bestMatch = searchResults[0];

  if (bestMatch) {
    return {
      result: {
        ...bestMatch,
        isbn: bestMatch.isbn || isbn || '',
        coverUrl: bestMatch.coverUrl || imageFallback || '',
      },
      confident: true,
      rawText: extractedText,
    };
  }

  // No catalog match found — return whatever OCR captured as a low-confidence
  // starting point for manual editing, clearly flagged via `confident: false`.
  const fallbackLines = extractedText.split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    result: {
      title: fallbackLines[0] || UNRECOGNIZED_TITLE,
      author: fallbackLines[1] || '',
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

// Perform client-side OCR on image string or process direct text query
export async function processImageOrQuery(input: {
  image?: string;
  query?: string;
}): Promise<{ result: BookSearchResult; confident: boolean; rawText?: string }> {
  let extractedText = '';

  if (input.query) {
    extractedText = input.query;
  } else if (input.image) {
    let worker;
    try {
      worker = await createWorker('ces+eng');
      const ret = await worker.recognize(input.image);
      extractedText = ret.data.text;
    } catch (err) {
      console.error('Client OCR error:', err);
    } finally {
      if (worker) {
        await worker.terminate().catch((err) => console.error('Worker terminate error:', err));
      }
    }
  }

  return resolveBookFromText(extractedText, input.image);
}
