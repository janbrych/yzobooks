// Client-side LocalStorage manager for offline / static export mode (e.g. GitHub Pages)

export interface LocalBook {
  id: string;
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
  status: 'UNREAD' | 'READING' | 'READ';
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'yzobooks_library_items';

export function getLocalBooks(): LocalBook[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load local books:', err);
    return [];
  }
}

export function saveLocalBooks(books: LocalBook[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
  } catch (err) {
    console.error('Failed to save local books:', err);
  }
}

export function addOrUpdateLocalBook(bookData: Partial<LocalBook> & { id?: string }): LocalBook {
  const books = getLocalBooks();
  const now = new Date().toISOString();

  if (bookData.id) {
    const index = books.findIndex((b) => b.id === bookData.id);
    if (index !== -1) {
      const updated: LocalBook = {
        ...books[index],
        ...bookData,
        updatedAt: now,
      } as LocalBook;
      books[index] = updated;
      saveLocalBooks(books);
      return updated;
    }
  }

  const newBook: LocalBook = {
    id: bookData.id || `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: bookData.title || 'Bez názvu',
    author: bookData.author || '',
    genre: bookData.genre || '',
    publisher: bookData.publisher || '',
    publishedYear: bookData.publishedYear || '',
    edition: bookData.edition || '',
    pageCount: bookData.pageCount ?? null,
    isbn: bookData.isbn || '',
    description: bookData.description || '',
    coverUrl: bookData.coverUrl || '',
    status: bookData.status || 'UNREAD',
    createdAt: now,
    updatedAt: now,
  };

  books.unshift(newBook);
  saveLocalBooks(books);
  return newBook;
}

export function deleteLocalBook(id: string): void {
  const books = getLocalBooks();
  const filtered = books.filter((b) => b.id !== id);
  saveLocalBooks(filtered);
}
