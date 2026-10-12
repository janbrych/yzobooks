import { Book, BookIdentificationResult } from '@/types';

// Clean ISBN string (removes hyphens, spaces, and non-alphanumeric chars except 'X')
export function cleanIsbn(isbn: string): string {
  return isbn.replace(/[^0-9X]/gi, '').toUpperCase();
}

// Validate ISBN-10 checksum
export function isValidIsbn10(isbn: string): boolean {
  const cleaned = cleanIsbn(isbn);
  if (cleaned.length !== 10) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const digit = parseInt(cleaned[i], 10);
    if (isNaN(digit)) return false;
    sum += digit * (10 - i);
  }

  const lastChar = cleaned[9];
  const checksum = lastChar === 'X' ? 10 : parseInt(lastChar, 10);
  if (isNaN(checksum)) return false;

  sum += checksum;
  return sum % 11 === 0;
}

// Validate ISBN-13 checksum
export function isValidIsbn13(isbn: string): boolean {
  const cleaned = cleanIsbn(isbn);
  if (cleaned.length !== 13) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(cleaned[i], 10);
    if (isNaN(digit)) return false;
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const checksum = parseInt(cleaned[12], 10);
  if (isNaN(checksum)) return false;

  const remainder = sum % 10;
  const expected = remainder === 0 ? 0 : 10 - remainder;

  return checksum === expected;
}

// Convert ISBN-10 to ISBN-13
export function convertIsbn10To13(isbn10: string): string | null {
  const cleaned = cleanIsbn(isbn10);
  if (!isValidIsbn10(cleaned)) return null;

  const prefix = '978' + cleaned.substring(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(prefix[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const remainder = sum % 10;
  const checkDigit = remainder === 0 ? 0 : 10 - remainder;

  return prefix + checkDigit;
}

// Fetch book metadata from Open Library API
export async function fetchFromOpenLibrary(isbn: string): Promise<Partial<Book> | null> {
  const cleaned = cleanIsbn(isbn);
  try {
    const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleaned}&format=json&jscmd=data`);
    if (!res.ok) return null;
    const data = await res.json();
    const key = `ISBN:${cleaned}`;
    if (!data[key]) return null;

    const bookData = data[key];
    const authors = bookData.authors?.map((a: { name: string }) => a.name) || ['Unknown Author'];
    const publishers = bookData.publishers?.map((p: { name: string }) => p.name).join(', ');
    const publishYear = bookData.publish_date ? parseInt(bookData.publish_date.match(/\d{4}/)?.[0] || '0', 10) : undefined;

    return {
      title: bookData.title,
      subtitle: bookData.subtitle,
      authors: authors.length > 0 ? authors : ['Unknown Author'],
      isbn13: cleaned.length === 13 ? cleaned : convertIsbn10To13(cleaned) || undefined,
      isbn10: cleaned.length === 10 ? cleaned : undefined,
      genres: bookData.subjects?.slice(0, 3).map((s: { name: string }) => s.name) || ['General'],
      page_count: bookData.number_of_pages,
      publisher: publishers,
      publication_year: publishYear || undefined,
      cover_url: bookData.cover?.large || bookData.cover?.medium || bookData.cover?.small,
      source: 'open_library',
    };
  } catch (err) {
    console.warn('Open Library API lookup failed:', err);
    return null;
  }
}

// Fetch book metadata from Google Books API
export async function fetchFromGoogleBooks(query: string): Promise<Partial<Book> | null> {
  try {
    const isIsbnQuery = /^[0-9X]{10,13}$/i.test(cleanIsbn(query));
    const url = isIsbnQuery
      ? `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn(query)}`
      : `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.items || data.items.length === 0) return null;

    const item = data.items[0].volumeInfo;
    const industryIdentifiers = item.industryIdentifiers || [];
    let isbn10: string | undefined;
    let isbn13: string | undefined;

    for (const id of industryIdentifiers) {
      if (id.type === 'ISBN_10') isbn10 = id.identifier;
      if (id.type === 'ISBN_13') isbn13 = id.identifier;
    }

    const pubYear = item.publishedDate ? parseInt(item.publishedDate.substring(0, 4), 10) : undefined;
    const highResCover = item.imageLinks?.extraLarge || item.imageLinks?.large || item.imageLinks?.medium || item.imageLinks?.thumbnail;

    return {
      title: item.title,
      subtitle: item.subtitle,
      authors: item.authors || ['Unknown Author'],
      isbn10: isbn10 || (isIsbnQuery && query.length === 10 ? query : undefined),
      isbn13: isbn13 || (isIsbnQuery && query.length === 13 ? query : undefined),
      genres: item.categories || ['General'],
      page_count: item.pageCount,
      publisher: item.publisher,
      publication_year: pubYear,
      language: item.language || 'en',
      description: item.description,
      cover_url: highResCover?.replace('http://', 'https://'),
      source: 'google_books',
    };
  } catch (err) {
    console.warn('Google Books API lookup failed:', err);
    return null;
  }
}

// Multi-stage book identification engine
export async function identifyBook(params: {
  isbn?: string;
  query?: string;
  imageData?: string;
}): Promise<BookIdentificationResult> {
  const { isbn, query, imageData } = params;

  // 1. Stage 1: Fast ISBN direct lookup
  if (isbn) {
    const clean = cleanIsbn(isbn);
    if (isValidIsbn13(clean) || isValidIsbn10(clean)) {
      const [googleRes, openLibRes] = await Promise.all([
        fetchFromGoogleBooks(clean),
        fetchFromOpenLibrary(clean),
      ]);

      const mergedBook: Partial<Book> = {
        title: googleRes?.title || openLibRes?.title || 'Unknown Title',
        subtitle: googleRes?.subtitle || openLibRes?.subtitle,
        authors: googleRes?.authors || openLibRes?.authors || ['Unknown Author'],
        isbn13: googleRes?.isbn13 || openLibRes?.isbn13 || (clean.length === 13 ? clean : convertIsbn10To13(clean) || clean),
        isbn10: googleRes?.isbn10 || openLibRes?.isbn10 || (clean.length === 10 ? clean : undefined),
        genres: googleRes?.genres || openLibRes?.genres || ['General'],
        page_count: googleRes?.page_count || openLibRes?.page_count,
        publisher: googleRes?.publisher || openLibRes?.publisher,
        publication_year: googleRes?.publication_year || openLibRes?.publication_year,
        language: googleRes?.language || openLibRes?.language || 'en',
        description: googleRes?.description || openLibRes?.description,
        cover_url: googleRes?.cover_url || openLibRes?.cover_url || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
        confidence: 0.98,
      };

      if (mergedBook.title !== 'Unknown Title') {
        return {
          book: mergedBook,
          confidence: 0.98,
          detected_isbn: clean,
          method: 'isbn_scan',
          matched_from: googleRes ? 'google_books' : 'open_library',
        };
      }
    }
  }

  // 2. Stage 2: AI Vision / OCR Server API call if image data provided
  if (imageData) {
    try {
      const response = await fetch('/api/identify-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData }),
      });

      if (response.ok) {
        const aiResult: BookIdentificationResult = await response.json();
        if (aiResult && aiResult.book && aiResult.book.title) {
          // Verify & augment AI result using Google Books / Open Library if ISBN was found by AI
          if (aiResult.detected_isbn) {
            const augmented = await fetchFromGoogleBooks(aiResult.detected_isbn);
            if (augmented) {
              return {
                book: {
                  ...aiResult.book,
                  ...augmented,
                  cover_url: aiResult.book.cover_url || augmented.cover_url,
                  confidence: 0.95,
                },
                confidence: 0.95,
                detected_isbn: aiResult.detected_isbn,
                method: 'ai_vision',
                matched_from: 'google_books',
              };
            }
          }
          return aiResult;
        }
      }
    } catch (err) {
      console.warn('AI Vision API call failed, falling back to text query', err);
    }
  }

  // 3. Stage 3: Text Search Fallback
  if (query) {
    const searchRes = await fetchFromGoogleBooks(query);
    if (searchRes) {
      return {
        book: {
          ...searchRes,
          confidence: 0.85,
        },
        confidence: 0.85,
        method: 'manual_search',
        matched_from: 'google_books',
      };
    }
  }

  // Fallback return if nothing found
  return {
    book: {
      title: query || 'Unidentified Book',
      authors: ['Unknown Author'],
      genres: ['General'],
      cover_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
    },
    confidence: 0.4,
    method: 'manual_search',
    matched_from: 'ai_generated',
  };
}
