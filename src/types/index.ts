export type ReadingStatus = 'want_to_read' | 'reading' | 'read';

export interface Book {
  id: string;
  title: string;
  subtitle?: string;
  authors: string[];
  isbn10?: string;
  isbn13?: string;
  genres: string[];
  page_count?: number;
  publisher?: string;
  publication_year?: number;
  language?: string;
  description?: string;
  cover_url?: string;
  series?: string;
  series_number?: number;
  source?: string;
  confidence?: number;
  created_at?: string;
  updated_at?: string;
}

export interface UserBook {
  id: string;
  user_id: string;
  book_id: string;
  book?: Book;
  status: ReadingStatus;
  rating?: number; // 1-5 stars
  notes?: string;
  favorite: boolean;
  date_added: string;
  date_started?: string;
  date_finished?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  created_at?: string;
}

export interface BookIdentificationResult {
  book: Partial<Book>;
  confidence: number;
  detected_isbn?: string;
  ocr_text?: string;
  method: 'isbn_scan' | 'ai_vision' | 'manual_search';
  matched_from?: 'database' | 'google_books' | 'open_library' | 'ai_generated';
}
