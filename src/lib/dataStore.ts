import { Book, UserBook, UserProfile, ReadingStatus } from '@/types';
import { supabase, isSupabaseConfigured } from './supabaseClient';

const LOCAL_STORAGE_KEY_USER = 'yb_user';
const LOCAL_STORAGE_KEY_BOOKS = 'yb_books';
const LOCAL_STORAGE_KEY_USER_BOOKS = 'yb_user_books';

// Initial demo seeds for standalone mock mode
const DEMO_BOOKS: Book[] = [
  {
    id: 'b-1984',
    title: '1984',
    subtitle: 'A Novel',
    authors: ['George Orwell'],
    isbn10: '0451524934',
    isbn13: '9780451524935',
    genres: ['Dystopian', 'Fiction', 'Classics'],
    page_count: 328,
    publisher: 'Signet Classic',
    publication_year: 1949,
    language: 'en',
    description: 'Winston Smith toes the Party line, rewriting history to satisfy the Ministry of Truth. With each lie he writes, Winston comes to hate the Party that seeks power for its own sake.',
    cover_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
    source: 'seed',
    confidence: 1.0,
  },
  {
    id: 'b-dune',
    title: 'Dune',
    subtitle: 'Dune Chronicles, Book 1',
    authors: ['Frank Herbert'],
    isbn10: '0441172717',
    isbn13: '9780441172719',
    genres: ['Science Fiction', 'Adventure', 'Fantasy'],
    page_count: 688,
    publisher: 'Ace Books',
    publication_year: 1965,
    language: 'en',
    description: 'Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides, heir to a noble family tasked with ruling an inhospitable world where the only thing of value is the "spice" melange.',
    cover_url: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=600&q=80',
    series: 'Dune',
    series_number: 1,
    source: 'seed',
    confidence: 1.0,
  },
  {
    id: 'b-sapiens',
    title: 'Sapiens',
    subtitle: 'A Brief History of Humankind',
    authors: ['Yuval Noah Harari'],
    isbn10: '0062316095',
    isbn13: '9780062316097',
    genres: ['Non-Fiction', 'History', 'Anthropology'],
    page_count: 443,
    publisher: 'Harper',
    publication_year: 2014,
    language: 'en',
    description: '100,000 years ago, at least six human species inhabited the earth. Today there is just one. Us. Homo sapiens. How did our species succeed in the battle for dominance?',
    cover_url: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80',
    source: 'seed',
    confidence: 1.0,
  }
];

const DEMO_USER_BOOKS: UserBook[] = [
  {
    id: 'ub-1',
    user_id: 'demo-user-id',
    book_id: 'b-1984',
    book: DEMO_BOOKS[0],
    status: 'read',
    rating: 5,
    notes: 'Absolute masterpiece. Timeless warnings about totalitarianism.',
    favorite: true,
    date_added: new Date(Date.now() - 30 * 86400000).toISOString(),
    date_started: new Date(Date.now() - 25 * 86400000).toISOString(),
    date_finished: new Date(Date.now() - 20 * 86400000).toISOString(),
  },
  {
    id: 'ub-2',
    user_id: 'demo-user-id',
    book_id: 'b-dune',
    book: DEMO_BOOKS[1],
    status: 'reading',
    rating: 5,
    notes: 'Incredible worldbuilding. Spice must flow!',
    favorite: true,
    date_added: new Date(Date.now() - 10 * 86400000).toISOString(),
    date_started: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'ub-3',
    user_id: 'demo-user-id',
    book_id: 'b-sapiens',
    book: DEMO_BOOKS[2],
    status: 'want_to_read',
    favorite: false,
    date_added: new Date(Date.now() - 2 * 86400000).toISOString(),
  }
];

function getLocalData<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const item = localStorage.getItem(key);
  if (!item) {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
  try {
    return JSON.parse(item);
  } catch {
    return fallback;
  }
}

function setLocalData<T>(key: string, data: T): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(data));
  }
}

export const dataStore = {
  // Get Current User Session/Profile
  async getCurrentUser(): Promise<UserProfile | null> {
    if (isSupabaseConfigured && supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      return {
        id: session.user.id,
        email: session.user.email || '',
        display_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
      };
    }
    return getLocalData<UserProfile | null>(LOCAL_STORAGE_KEY_USER, {
      id: 'demo-user-id',
      email: 'alex@example.com',
      display_name: 'Alex Reader',
    });
  },

  // Get User's Library Books
  async getUserBooks(userId: string): Promise<UserBook[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('user_books')
        .select(`
          *,
          book:books(*)
        `)
        .eq('user_id', userId)
        .order('date_added', { ascending: false });

      if (error) {
        console.error('Error fetching user books from Supabase:', error);
        return [];
      }
      return data || [];
    }

    // Local Storage Mock Fallback
    const userBooks = getLocalData<UserBook[]>(LOCAL_STORAGE_KEY_USER_BOOKS, DEMO_USER_BOOKS);
    const books = getLocalData<Book[]>(LOCAL_STORAGE_KEY_BOOKS, DEMO_BOOKS);

    return userBooks
      .filter((ub) => ub.user_id === userId)
      .map((ub) => ({
        ...ub,
        book: books.find((b) => b.id === ub.book_id) || ub.book,
      }));
  },

  // Check for duplicate user book
  async checkDuplicateUserBook(userId: string, isbnOrTitle: { isbn13?: string; isbn10?: string; title?: string }): Promise<UserBook | null> {
    const userBooks = await this.getUserBooks(userId);
    return userBooks.find((ub) => {
      const b = ub.book;
      if (!b) return false;
      if (isbnOrTitle.isbn13 && b.isbn13 === isbnOrTitle.isbn13) return true;
      if (isbnOrTitle.isbn10 && b.isbn10 === isbnOrTitle.isbn10) return true;
      if (isbnOrTitle.title && b.title.toLowerCase() === isbnOrTitle.title.toLowerCase()) return true;
      return false;
    }) || null;
  },

  // Add Book to Global Database & User Library
  async addUserBook(userId: string, bookData: Partial<Book>, initialStatus: ReadingStatus = 'want_to_read'): Promise<UserBook> {
    const cleanIsbn13 = bookData.isbn13?.replace(/[- ]/g, '');
    const cleanIsbn10 = bookData.isbn10?.replace(/[- ]/g, '');

    if (isSupabaseConfigured && supabase) {
      // 1. Check or insert global book record
      let globalBook: Book | null = null;

      if (cleanIsbn13) {
        const { data } = await supabase.from('books').select('*').eq('isbn13', cleanIsbn13).maybeSingle();
        globalBook = data;
      }

      if (!globalBook && cleanIsbn10) {
        const { data } = await supabase.from('books').select('*').eq('isbn10', cleanIsbn10).maybeSingle();
        globalBook = data;
      }

      if (!globalBook) {
        const { data, error } = await supabase
          .from('books')
          .insert([
            {
              title: bookData.title,
              subtitle: bookData.subtitle,
              authors: bookData.authors || [],
              isbn10: cleanIsbn10,
              isbn13: cleanIsbn13,
              genres: bookData.genres || [],
              page_count: bookData.page_count,
              publisher: bookData.publisher,
              publication_year: bookData.publication_year,
              language: bookData.language || 'en',
              description: bookData.description,
              cover_url: bookData.cover_url,
              series: bookData.series,
              series_number: bookData.series_number,
              source: bookData.source || 'ai',
              confidence: bookData.confidence || 0.9,
            },
          ])
          .select()
          .single();

        if (error) throw new Error(`Failed to insert global book: ${error.message}`);
        globalBook = data;
      }

      // 2. Insert user_book relationship
      const { data: newUserBook, error: ubError } = await supabase
        .from('user_books')
        .insert([
          {
            user_id: userId,
            book_id: globalBook!.id,
            status: initialStatus,
            favorite: false,
            date_added: new Date().toISOString(),
          },
        ])
        .select(`*, book:books(*)`)
        .single();

      if (ubError) throw new Error(`Failed to insert user book: ${ubError.message}`);
      return newUserBook;
    }

    // Local Storage Fallback
    const books = getLocalData<Book[]>(LOCAL_STORAGE_KEY_BOOKS, DEMO_BOOKS);
    const userBooks = getLocalData<UserBook[]>(LOCAL_STORAGE_KEY_USER_BOOKS, DEMO_USER_BOOKS);

    let globalBook = books.find((b) => (cleanIsbn13 && b.isbn13 === cleanIsbn13) || (cleanIsbn10 && b.isbn10 === cleanIsbn10));

    if (!globalBook) {
      globalBook = {
        id: `b-${Date.now()}`,
        title: bookData.title || 'Untitled Book',
        subtitle: bookData.subtitle,
        authors: bookData.authors || ['Unknown Author'],
        isbn10: cleanIsbn10,
        isbn13: cleanIsbn13,
        genres: bookData.genres || ['General'],
        page_count: bookData.page_count || 200,
        publisher: bookData.publisher,
        publication_year: bookData.publication_year,
        language: bookData.language || 'en',
        description: bookData.description,
        cover_url: bookData.cover_url || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
        series: bookData.series,
        series_number: bookData.series_number,
        source: bookData.source || 'ai',
        confidence: bookData.confidence || 0.9,
      };
      books.push(globalBook);
      setLocalData(LOCAL_STORAGE_KEY_BOOKS, books);
    }

    const newUserBook: UserBook = {
      id: `ub-${Date.now()}`,
      user_id: userId,
      book_id: globalBook.id,
      book: globalBook,
      status: initialStatus,
      favorite: false,
      date_added: new Date().toISOString(),
    };

    userBooks.unshift(newUserBook);
    setLocalData(LOCAL_STORAGE_KEY_USER_BOOKS, userBooks);

    return newUserBook;
  },

  // Update UserBook details (Status, Rating, Notes, Favorite, Dates)
  async updateUserBook(id: string, updates: Partial<UserBook>): Promise<UserBook> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('user_books')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select(`*, book:books(*)`)
        .single();

      if (error) throw new Error(error.message);
      return data;
    }

    const userBooks = getLocalData<UserBook[]>(LOCAL_STORAGE_KEY_USER_BOOKS, DEMO_USER_BOOKS);
    const index = userBooks.findIndex((ub) => ub.id === id);
    if (index === -1) throw new Error('UserBook not found');

    const updated = {
      ...userBooks[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };

    userBooks[index] = updated;
    setLocalData(LOCAL_STORAGE_KEY_USER_BOOKS, userBooks);
    return updated;
  },

  // Remove UserBook
  async deleteUserBook(id: string): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from('user_books').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return;
    }

    const userBooks = getLocalData<UserBook[]>(LOCAL_STORAGE_KEY_USER_BOOKS, DEMO_USER_BOOKS);
    const filtered = userBooks.filter((ub) => ub.id !== id);
    setLocalData(LOCAL_STORAGE_KEY_USER_BOOKS, filtered);
  },
};
