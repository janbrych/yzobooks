-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. GLOBAL BOOKS TABLE
CREATE TABLE IF NOT EXISTS public.books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    subtitle TEXT,
    authors TEXT[] NOT NULL DEFAULT '{}',
    isbn10 TEXT,
    isbn13 TEXT,
    genres TEXT[] DEFAULT '{}',
    page_count INT,
    publisher TEXT,
    publication_year INT,
    language TEXT DEFAULT 'en',
    description TEXT,
    cover_url TEXT,
    series TEXT,
    series_number NUMERIC,
    source TEXT DEFAULT 'manual',
    confidence NUMERIC DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast searching & uniqueness matching
CREATE INDEX IF NOT EXISTS idx_books_isbn10 ON public.books(isbn10) WHERE isbn10 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_books_isbn13 ON public.books(isbn13) WHERE isbn13 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_books_title ON public.books USING gin(to_tsvector('english', title));

-- 3. USER_BOOKS TABLE (Relationship)
CREATE TABLE IF NOT EXISTS public.user_books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('want_to_read', 'reading', 'read')) DEFAULT 'want_to_read',
    rating INT CHECK (rating >= 1 AND rating <= 5),
    notes TEXT,
    favorite BOOLEAN NOT NULL DEFAULT FALSE,
    date_added TIMESTAMPTZ DEFAULT NOW(),
    date_started TIMESTAMPTZ,
    date_finished TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compound index to ensure fast query by user_id and check for duplicates
CREATE INDEX IF NOT EXISTS idx_user_books_user_status ON public.user_books(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_books_user_favorite ON public.user_books(user_id, favorite);
CREATE INDEX IF NOT EXISTS idx_user_books_user_book ON public.user_books(user_id, book_id);

-- 4. ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_books ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Books policies (Global metadata readable by all authenticated users, insertable by authenticated users)
CREATE POLICY "Books are viewable by authenticated users"
    ON public.books FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert books"
    ON public.books FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- User_Books policies (Strict user privacy isolation)
CREATE POLICY "Users can view their own user_books"
    ON public.user_books FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own user_books"
    ON public.user_books FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own user_books"
    ON public.user_books FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own user_books"
    ON public.user_books FOR DELETE
    USING (auth.uid() = user_id);

-- Profile creation trigger on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, avatar_url)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.raw_user_meta_data->>'avatar_url'
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
