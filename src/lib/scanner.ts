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

// Helper to extract ISBN digits from text
export function extractISBN(text: string): string | null {
  const isbn13Regex = /(?:ISBN(?:-13)?:?\s*)?(97[89][-\s]?[0-9]{1,5}[-\s]?[0-9]{1,7}[-\s]?[0-9]{1,7}[-\s]?[0-9])/gi;
  const isbn10Regex = /(?:ISBN(?:-10)?:?\s*)?([0-9]{1,5}[-\s]?[0-9]{1,7}[-\s]?[0-9]{1,7}[-\s]?[0-9X])/gi;

  const match13 = isbn13Regex.exec(text);
  if (match13) {
    const cleaned = match13[1].replace(/[-\s]/g, '');
    if (cleaned.length === 13) return cleaned;
  }

  const match10 = isbn10Regex.exec(text);
  if (match10) {
    const cleaned = match10[1].replace(/[-\s]/g, '');
    if (cleaned.length === 10) return cleaned;
  }

  return null;
}

// Direct search Google Books API
export async function searchGoogleBooks(query: string): Promise<BookSearchResult[]> {
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items) return [];

    return data.items.map((item: any) => {
      const info = item.volumeInfo || {};
      const industryIdentifiers = info.industryIdentifiers || [];
      const isbnObj = industryIdentifiers.find((i: any) => i.type === 'ISBN_13') || industryIdentifiers.find((i: any) => i.type === 'ISBN_10');

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

    return data.docs.map((doc: any) => ({
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

// Perform client-side OCR on image string or process direct text query
export async function processImageOrQuery(input: { image?: string; query?: string }): Promise<{ result: BookSearchResult; rawText?: string }> {
  let extractedText = '';

  if (input.query) {
    extractedText = input.query;
  } else if (input.image) {
    try {
      const worker = await createWorker('ces+eng');
      const ret = await worker.recognize(input.image);
      extractedText = ret.data.text;
      await worker.terminate();
    } catch (err) {
      console.error('Client OCR error:', err);
    }
  }

  const isbn = extractISBN(extractedText);
  let searchResults: BookSearchResult[] = [];

  if (isbn) {
    searchResults = await searchGoogleBooks(`isbn:${isbn}`);
    if (searchResults.length === 0) {
      searchResults = await searchOpenLibrary(isbn);
    }
  }

  if (searchResults.length === 0 && extractedText) {
    // Clean text lines and pick best search queries
    const lines = extractedText
      .split('\n')
      .map((l) => l.trim().replace(/[^a-zA-Z0-9áěíéóúůýžščřďťňÁĚÍÉÓÚŮÝŽŠČŘĎŤŇ\s]/g, ' '))
      .filter((l) => l.length > 2);

    // Try full line search first
    const primaryQuery = lines.slice(0, 3).join(' ');
    if (primaryQuery) {
      searchResults = await searchGoogleBooks(primaryQuery);
      if (searchResults.length === 0) {
        searchResults = await searchOpenLibrary(primaryQuery);
      }
    }

    // Try single longest line fallback if still no result
    if (searchResults.length === 0 && lines.length > 0) {
      const longestLine = [...lines].sort((a, b) => b.length - a.length)[0];
      if (longestLine) {
        searchResults = await searchGoogleBooks(longestLine);
        if (searchResults.length === 0) {
          searchResults = await searchOpenLibrary(longestLine);
        }
      }
    }
  }

  const bestMatch = searchResults[0];

  if (bestMatch) {
    return {
      result: {
        ...bestMatch,
        coverUrl: bestMatch.coverUrl || input.image || '',
      },
      rawText: extractedText,
    };
  }

  // Fallback if no online metadata match found
  const fallbackLines = extractedText.split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    result: {
      title: fallbackLines[0] || 'Rozpoznaná kniha',
      author: fallbackLines[1] || '',
      genre: '',
      publisher: '',
      publishedYear: '',
      edition: '',
      pageCount: null,
      isbn: isbn || '',
      description: extractedText,
      coverUrl: input.image || '',
    },
    rawText: extractedText,
  };
}
