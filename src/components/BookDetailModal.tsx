'use client';

import React, { useState } from 'react';
import { UserBook, ReadingStatus, Book } from '@/types';
import { ArrowLeft, Heart, Star, Calendar, Trash2, BookOpen, FileText, Check } from 'lucide-react';

interface BookDetailModalProps {
  userBook: UserBook | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<UserBook>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function BookDetailModal({
  userBook,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
}: BookDetailModalProps) {
  const [notes, setNotes] = useState(userBook?.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!isOpen || !userBook) return null;

  const book: Partial<Book> = userBook.book || {};

  const handleStatusChange = async (newStatus: ReadingStatus) => {
    const updates: Partial<UserBook> = { status: newStatus };
    if (newStatus === 'reading' && !userBook.date_started) {
      updates.date_started = new Date().toISOString();
    }
    if (newStatus === 'read' && !userBook.date_finished) {
      updates.date_finished = new Date().toISOString();
    }
    await onUpdate(userBook.id, updates);
  };

  const handleRatingChange = async (rating: number) => {
    await onUpdate(userBook.id, { rating: rating === userBook.rating ? undefined : rating });
  };

  const handleFavoriteToggle = async () => {
    await onUpdate(userBook.id, { favorite: !userBook.favorite });
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await onUpdate(userBook.id, { notes });
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDeleteBook = async () => {
    if (!window.confirm('Remove this book from your personal library?')) return;
    setDeleting(true);
    try {
      await onDelete(userBook.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col safe-padding-top safe-padding-bottom overflow-y-auto animate-fade-in">
      {/* Top Header Bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur border-b border-border">
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-muted active:scale-95 transition flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Library</span>
        </button>

        <button
          onClick={handleFavoriteToggle}
          className={`p-2 rounded-full transition active:scale-95 ${
            userBook.favorite
              ? 'bg-rose-500/10 text-rose-500'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Heart className={`w-5 h-5 ${userBook.favorite ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-md mx-auto w-full p-5 space-y-6">

        {/* Book Cover & Core Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative w-40 h-60 rounded-2xl overflow-hidden shadow-2xl border border-border bg-slate-900">
            {book.cover_url ? (
              <img
                src={book.cover_url}
                alt={book.title || 'Book Cover'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground p-3">
                <BookOpen className="w-12 h-12 opacity-30" />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-foreground">{book.title}</h1>
            {book.subtitle && (
              <p className="text-xs text-muted-foreground">{book.subtitle}</p>
            )}
            <p className="text-sm font-semibold text-primary">
              {book.authors?.join(', ') || 'Unknown Author'}
            </p>
          </div>

          {/* Quick Info Badges */}
          <div className="flex flex-wrap justify-center gap-1.5 text-[11px] text-muted-foreground">
            {book.genres?.map((genre, idx) => (
              <span key={idx} className="px-2.5 py-1 bg-muted rounded-full font-medium">
                {genre}
              </span>
            ))}
            {book.page_count && (
              <span className="px-2.5 py-1 bg-muted rounded-full font-medium">
                {book.page_count} pages
              </span>
            )}
            {book.publication_year && (
              <span className="px-2.5 py-1 bg-muted rounded-full font-medium">
                {book.publication_year}
              </span>
            )}
          </div>
        </div>

        {/* Reading Status Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Reading Status
          </label>
          <div className="grid grid-cols-3 gap-2 p-1.5 bg-muted/60 rounded-2xl text-xs font-medium">
            <button
              onClick={() => handleStatusChange('want_to_read')}
              className={`py-2 rounded-xl transition ${
                userBook.status === 'want_to_read'
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Want to Read
            </button>
            <button
              onClick={() => handleStatusChange('reading')}
              className={`py-2 rounded-xl transition ${
                userBook.status === 'reading'
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Reading
            </button>
            <button
              onClick={() => handleStatusChange('read')}
              className={`py-2 rounded-xl transition ${
                userBook.status === 'read'
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Read
            </button>
          </div>
        </div>

        {/* Personal 5-Star Rating */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Personal Rating
          </label>
          <div className="flex items-center justify-center gap-2 p-3 bg-card border border-border rounded-2xl">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleRatingChange(star)}
                className="p-1 hover:scale-110 active:scale-95 transition"
              >
                <Star
                  className={`w-7 h-7 ${
                    userBook.rating && star <= userBook.rating
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-muted-foreground/30'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Private Personal Notes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Personal Notes
            </label>
            {notes !== (userBook.notes || '') && (
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                {savingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            )}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Write your personal thoughts, favorite quotes, or takeaways..."
            rows={4}
            className="w-full p-3 rounded-2xl bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </div>

        {/* Book Description / Overview */}
        {book.description && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Overview
            </label>
            <p className="text-xs text-muted-foreground leading-relaxed bg-card p-3.5 rounded-2xl border border-border">
              {book.description}
            </p>
          </div>
        )}

        {/* Technical Metadata Details */}
        <div className="space-y-2 pt-2 border-t border-border">
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Metadata & Dates
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="p-3 bg-card border border-border rounded-xl space-y-0.5">
              <span className="text-[10px] text-muted-foreground/70 block">Date Added</span>
              <span className="font-medium text-foreground">
                {new Date(userBook.date_added).toLocaleDateString()}
              </span>
            </div>
            {book.isbn13 && (
              <div className="p-3 bg-card border border-border rounded-xl space-y-0.5">
                <span className="text-[10px] text-muted-foreground/70 block">ISBN-13</span>
                <span className="font-mono text-foreground">{book.isbn13}</span>
              </div>
            )}
          </div>
        </div>

        {/* Delete Book Action */}
        <div className="pt-4 pb-8 flex justify-center">
          <button
            onClick={handleDeleteBook}
            disabled={deleting}
            className="text-xs text-rose-500 hover:text-rose-400 font-medium flex items-center gap-1.5 px-4 py-2 rounded-xl hover:bg-rose-500/10 transition"
          >
            <Trash2 className="w-4 h-4" />
            <span>Remove Book from Library</span>
          </button>
        </div>

      </div>
    </div>
  );
}
