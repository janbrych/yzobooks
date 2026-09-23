import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

// Helper to query Google Books API
async function searchGoogleBooks(query: string) {
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`, {
      headers: { 'User-Agent': 'KnihovnaApp/1.0' },
    });
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

// Helper to query Open Library API
async function searchOpenLibrary(query: string) {
  try {
    const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.docs) return [];

    return data.docs.map((doc: any) => ({
      title: doc.title || '',
      author: doc.author_name ? doc.author_name.join(', ') : '',
      genre: doc.subject ? doc.subject.slice(0, 3).join(', ') : '',
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

// Extract ISBN digits from text
function extractISBN(text: string): string | null {
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

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Neautorizovaný přístup.' }, { status: 401 });
  }

  try {
    const { image, query: textQuery } = await req.json();

    let extractedText = '';

    if (textQuery) {
      extractedText = textQuery;
    } else if (image) {
      // Perform OCR on base64 image or text extraction
      // Using Tesseract in Node server environment or server-side fallback
      try {
        const createWorker = (await import('tesseract.js')).createWorker;
        const worker = await createWorker('ces+eng');
        const ret = await worker.recognize(image);
        extractedText = ret.data.text;
        await worker.terminate();
      } catch (ocrErr) {
        console.error('Tesseract OCR error:', ocrErr);
      }
    }

    if (!extractedText && !image) {
      return NextResponse.json({ error: 'Nebyla poskytnuta žádná data k vyhodnocení.' }, { status: 400 });
    }

    // Try extracting ISBN first
    const isbn = extractISBN(extractedText);
    let searchResults: any[] = [];

    if (isbn) {
      searchResults = await searchGoogleBooks(`isbn:${isbn}`);
      if (searchResults.length === 0) {
        searchResults = await searchOpenLibrary(isbn);
      }
    }

    // If no results via ISBN, search by extracted text lines (e.g., Title/Author candidates)
    if (searchResults.length === 0 && extractedText) {
      const lines = extractedText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 2);

      // Clean lines to create search query
      const searchQuery = lines.slice(0, 4).join(' ');
      if (searchQuery) {
        searchResults = await searchGoogleBooks(searchQuery);
        if (searchResults.length === 0) {
          searchResults = await searchOpenLibrary(searchQuery);
        }
      }
    }

    // Best guess fallback if search found results
    const bestMatch = searchResults.length > 0 ? searchResults[0] : null;

    // If still no result, attempt AI extraction or format response with whatever OCR captured
    if (!bestMatch) {
      const lines = extractedText.split('\n').map((l) => l.trim()).filter(Boolean);
      return NextResponse.json({
        result: {
          title: lines[0] || 'Neznámá kniha',
          author: lines[1] || '',
          genre: '',
          pageCount: null,
          isbn: isbn || '',
          description: extractedText,
          coverUrl: image || '',
        },
        rawText: extractedText,
      });
    }

    return NextResponse.json({
      result: {
        ...bestMatch,
        coverUrl: bestMatch.coverUrl || image || '',
      },
      candidates: searchResults,
      rawText: extractedText,
    });
  } catch (error) {
    console.error('Book recognize error:', error);
    return NextResponse.json({ error: 'Chyba při vyhodnocování knihy.' }, { status: 500 });
  }
}
