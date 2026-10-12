'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { dataStore } from '@/lib/dataStore';
import { UserBook, ReadingStatus, BookIdentificationResult } from '@/types';
import BookCard from '@/components/BookCard';
import BottomNav, { NavigationTab } from '@/components/BottomNav';
import CameraScanner from '@/components/CameraScanner';
import BookConfirmationModal from '@/components/BookConfirmationModal';
import BookDetailModal from '@/components/BookDetailModal';
import StatsView from '@/components/StatsView';
import ProfileView from '@/components/ProfileView';
import AuthModal from '@/components/AuthModal';
import { BookOpen, Search, Sparkles, Plus, Heart, SlidersHorizontal, AlertCircle } from 'lucide-react';

export default function AppMain() {
  const { user } = useAuth();
  const [userBooks, setUserBooks] = useState<UserBook[]>([]);
  const [loadingBooks, setLoadingBooks] = useState<boolean>(true);

  // Navigation State
  const [activeTab, setActiveTab] = useState<NavigationTab>('library');

  // Scanner & Confirmation State
  const [scannerOpen, setScannerOpen] = useState<boolean>(false);
  const [identificationResult, setIdentificationResult] = useState<BookIdentificationResult | null>(null);
  const [existingBook, setExistingBook] = useState<UserBook | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState<boolean>(false);

  // Book Detail Modal State
  const [selectedUserBook, setSelectedUserBook] = useState<UserBook | null>(null);
  const [detailOpen, setDetailOpen] = useState<boolean>(false);

  // Auth Modal State
  const [authOpen, setAuthOpen] = useState<boolean>(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReadingStatus | 'favorites'>('all');

  const fetchBooks = useCallback(async () => {
    if (!user) return;
    setLoadingBooks(true);
    try {
      const books = await dataStore.getUserBooks(user.id);
      setUserBooks(books);
    } catch (err) {
      console.error('Failed to fetch user books:', err);
    } finally {
      setLoadingBooks(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  // Handle Book Identification Completion
  const handleIdentified = async (result: BookIdentificationResult) => {
    setScannerOpen(false);
    setIdentificationResult(result);

    if (user) {
      const dup = await dataStore.checkDuplicateUserBook(user.id, {
        isbn13: result.book.isbn13,
        isbn10: result.book.isbn10,
        title: result.book.title,
      });
      setExistingBook(dup);
    }

    setConfirmationOpen(true);
  };

  // Confirm and Add to Library
  const handleConfirmAddBook = async (initialStatus: ReadingStatus, forceAddCopy = false) => {
    if (!user || !identificationResult) return;
    try {
      const newBook = await dataStore.addUserBook(user.id, identificationResult.book, initialStatus);
      setConfirmationOpen(false);
      setIdentificationResult(null);
      await fetchBooks();
      // Directly show the detail view of the newly added book
      setSelectedUserBook(newBook);
      setDetailOpen(true);
    } catch (err) {
      console.error('Failed to add book:', err);
    }
  };

  // Update Book Details
  const handleUpdateBook = async (id: string, updates: Partial<UserBook>) => {
    try {
      const updated = await dataStore.updateUserBook(id, updates);
      setUserBooks((prev) => prev.map((ub) => (ub.id === id ? updated : ub)));
      if (selectedUserBook?.id === id) {
        setSelectedUserBook(updated);
      }
    } catch (err) {
      console.error('Failed to update user book:', err);
    }
  };

  // Delete Book
  const handleDeleteBook = async (id: string) => {
    try {
      await dataStore.deleteUserBook(id);
      setUserBooks((prev) => prev.filter((ub) => ub.id !== id));
      if (selectedUserBook?.id === id) {
        setSelectedUserBook(null);
      }
    } catch (err) {
      console.error('Failed to delete book:', err);
    }
  };

  // Filtered Books Calculation
  const filteredBooks = userBooks.filter((ub) => {
    const book = ub.book;
    if (!book) return false;

    // Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = book.title.toLowerCase().includes(q);
      const matchAuthor = book.authors?.some((a) => a.toLowerCase().includes(q));
      const matchIsbn = book.isbn13?.includes(q) || book.isbn10?.includes(q);
      const matchGenre = book.genres?.some((g) => g.toLowerCase().includes(q));
      if (!matchTitle && !matchAuthor && !matchIsbn && !matchGenre) return false;
    }

    // Quick Status Filter
    if (statusFilter === 'favorites') return ub.favorite;
    if (statusFilter !== 'all') return ub.status === statusFilter;

    return true;
  });

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col max-w-md mx-auto relative border-x border-border/40 shadow-2xl safe-padding-top safe-padding-bottom">

      {/* HEADER BAR */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md px-5 py-3.5 flex items-center justify-between border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-md shadow-blue-500/20">
            <BookOpen className="w-4.5 h-4.5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">My Library</h1>
            <p className="text-[10px] text-muted-foreground font-medium">
              {userBooks.length} {userBooks.length === 1 ? 'book' : 'books'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setScannerOpen(true)}
          className="p-2 rounded-full bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition flex items-center gap-1 text-xs font-semibold"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add</span>
        </button>
      </header>

      {/* MAIN VIEW CONTENTS */}
      <main className="flex-1 p-5 overflow-y-auto">

        {/* 1. LIBRARY TAB */}
        {activeTab === 'library' && (
          <div className="space-y-4 animate-fade-in pb-20">

            {/* Search Input Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, author, or ISBN..."
                className="w-full pl-9 pr-4 py-2.5 rounded-2xl bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm"
              />
            </div>

            {/* Quick Filter Pill Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs font-medium">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-full shrink-0 transition ${
                  statusFilter === 'all'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('want_to_read')}
                className={`px-3 py-1.5 rounded-full shrink-0 transition ${
                  statusFilter === 'want_to_read'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                To Read
              </button>
              <button
                onClick={() => setStatusFilter('reading')}
                className={`px-3 py-1.5 rounded-full shrink-0 transition ${
                  statusFilter === 'reading'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Reading
              </button>
              <button
                onClick={() => setStatusFilter('read')}
                className={`px-3 py-1.5 rounded-full shrink-0 transition ${
                  statusFilter === 'read'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Read
              </button>
              <button
                onClick={() => setStatusFilter('favorites')}
                className={`px-3 py-1.5 rounded-full shrink-0 flex items-center gap-1 transition ${
                  statusFilter === 'favorites'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Heart className="w-3 h-3 fill-current" />
                Favorites
              </button>
            </div>

            {/* BOOK GRID OR EMPTY STATE */}
            {loadingBooks ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="aspect-[2/3] bg-card/60 animate-pulse rounded-2xl" />
                ))}
              </div>
            ) : filteredBooks.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
                {filteredBooks.map((ub) => (
                  <BookCard
                    key={ub.id}
                    userBook={ub}
                    onClick={() => {
                      setSelectedUserBook(ub);
                      setDetailOpen(true);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                <div className="w-16 h-16 rounded-3xl bg-blue-500/10 text-primary flex items-center justify-center">
                  <Sparkles className="w-8 h-8" />
                </div>
                <div className="space-y-1 max-w-xs">
                  <h3 className="text-base font-bold">
                    {searchQuery || statusFilter !== 'all' ? 'No matching books found' : 'Your library is empty'}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {searchQuery || statusFilter !== 'all'
                      ? 'Try adjusting your search query or status filter.'
                      : 'Take a photo of a book cover or scan its barcode to add your first book.'}
                  </p>
                </div>
                {!searchQuery && statusFilter === 'all' && (
                  <button
                    onClick={() => setScannerOpen(true)}
                    className="px-5 py-2.5 bg-primary text-primary-foreground text-xs font-semibold rounded-2xl shadow-lg shadow-blue-500/20 hover:opacity-90 active:scale-95 transition flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Your First Book</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. SEARCH TAB */}
        {activeTab === 'search' && (
          <div className="space-y-4 animate-fade-in pb-20">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">Search Library</h1>
              <p className="text-xs text-muted-foreground">Find books by title, author name, or ISBN.</p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type title, author, or ISBN..."
                className="w-full pl-9 pr-4 py-2.5 rounded-2xl bg-card border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-sm"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
              {filteredBooks.map((ub) => (
                <BookCard
                  key={ub.id}
                  userBook={ub}
                  onClick={() => {
                    setSelectedUserBook(ub);
                    setDetailOpen(true);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* 3. STATS TAB */}
        {activeTab === 'stats' && <StatsView userBooks={userBooks} />}

        {/* 4. PROFILE TAB */}
        {activeTab === 'profile' && (
          <ProfileView userBooks={userBooks} onOpenAuth={() => setAuthOpen(true)} />
        )}

      </main>

      {/* BOTTOM NAVIGATION */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab !== 'search') setSearchQuery('');
        }}
        onAddClick={() => setScannerOpen(true)}
      />

      {/* CAMERA SCANNER MODAL */}
      <CameraScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onIdentified={handleIdentified}
      />

      {/* CONFIRMATION MODAL */}
      <BookConfirmationModal
        isOpen={confirmationOpen}
        result={identificationResult}
        existingBook={existingBook}
        onConfirm={handleConfirmAddBook}
        onReject={() => {
          setConfirmationOpen(false);
          setScannerOpen(true);
        }}
        onClose={() => setConfirmationOpen(false)}
      />

      {/* BOOK DETAIL MODAL */}
      <BookDetailModal
        isOpen={detailOpen}
        userBook={selectedUserBook}
        onClose={() => setDetailOpen(false)}
        onUpdate={handleUpdateBook}
        onDelete={handleDeleteBook}
      />

      {/* AUTHENTICATION MODAL */}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />

    </div>
  );
}
