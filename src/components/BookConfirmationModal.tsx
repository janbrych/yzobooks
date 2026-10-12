'use client';

import React, { useState } from 'react';
import { BookIdentificationResult, UserBook, ReadingStatus } from '@/types';
import { Check, AlertTriangle, BookOpen, RefreshCw, Layers } from 'lucide-react';
import Image from 'next/image';

interface BookConfirmationModalProps {
  isOpen: boolean;
  result: BookIdentificationResult | null;
  existingBook: UserBook | null;
  onConfirm: (status: ReadingStatus, forceAddCopy?: boolean) => Promise<void>;
  onReject: () => void;
  onClose: () => void;
}

export default function BookConfirmationModal({
  isOpen,
  result,
  existingBook,
  onConfirm,
  onReject,
  onClose,
}: BookConfirmationModalProps) {
  const [status, setStatus] = useState<ReadingStatus>('want_to_read');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !result) return null;

  const book = result.book;
  const confidencePercent = Math.round((result.confidence || 0.9) * 100);

  const handleConfirm = async (forceCopy = false) => {
    setSubmitting(true);
    try {
      await onConfirm(status, forceCopy);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-sm bg-card text-card-foreground border border-border rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar">

        {/* DUPLICATE WARNING CALLOUT */}
        {existingBook && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 flex items-start gap-2.5 text-amber-500">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-semibold">Already in your library!</p>
              <p className="text-amber-500/80">
                You added this book on {new Date(existingBook.date_added).toLocaleDateString()}.
              </p>
            </div>
          </div>
        )}

        {/* BOOK COVER & DETAILS CARD */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative w-36 h-52 rounded-xl overflow-hidden shadow-xl border border-border bg-slate-900">
            {book.cover_url ? (
              <img
                src={book.cover_url}
                alt={book.title || 'Book Cover'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground p-2">
                <BookOpen className="w-10 h-10 opacity-40" />
              </div>
            )}
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-600 text-white shadow">
              {confidencePercent}% match
            </div>
          </div>

          <div className="space-y-1 max-w-xs">
            <h2 className="text-lg font-bold leading-tight line-clamp-2">{book.title}</h2>
            {book.subtitle && (
              <p className="text-xs text-muted-foreground line-clamp-1">{book.subtitle}</p>
            )}
            <p className="text-sm font-medium text-blue-500">
              {book.authors?.join(', ') || 'Unknown Author'}
            </p>
          </div>

          {/* METADATA PILLS */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            {book.genres?.[0] && (
              <span className="px-2 py-0.5 bg-muted rounded-full font-medium">
                {book.genres[0]}
              </span>
            )}
            {book.page_count && (
              <span className="px-2 py-0.5 bg-muted rounded-full font-medium">
                {book.page_count} pages
              </span>
            )}
            {book.isbn13 && (
              <span className="px-2 py-0.5 bg-muted rounded-full font-mono">
                ISBN: {book.isbn13}
              </span>
            )}
          </div>
        </div>

        {/* READING STATUS CHOICE */}
        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <label className="block text-xs font-semibold text-muted-foreground text-center">
            Set Initial Reading Status
          </label>
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted rounded-xl text-xs font-medium">
            <button
              type="button"
              onClick={() => setStatus('want_to_read')}
              className={`py-1.5 rounded-lg transition ${
                status === 'want_to_read' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground'
              }`}
            >
              To Read
            </button>
            <button
              type="button"
              onClick={() => setStatus('reading')}
              className={`py-1.5 rounded-lg transition ${
                status === 'reading' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground'
              }`}
            >
              Reading
            </button>
            <button
              type="button"
              onClick={() => setStatus('read')}
              className={`py-1.5 rounded-lg transition ${
                status === 'read' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground'
              }`}
            >
              Read
            </button>
          </div>
        </div>

        {/* PRIMARY ACTIONS */}
        <div className="space-y-2 pt-1">
          {existingBook ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleConfirm(true)}
                disabled={submitting}
                className="w-full py-3 px-4 bg-primary text-primary-foreground text-sm font-semibold rounded-2xl hover:opacity-90 active:scale-[0.98] transition flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Layers className="w-4 h-4" />
                    <span>Add Another Copy</span>
                  </>
                )}
              </button>
              <button
                onClick={onClose}
                className="w-full py-2.5 text-xs text-muted-foreground font-medium hover:text-foreground transition"
              >
                Keep Existing Book Only
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleConfirm(false)}
              disabled={submitting}
              className="w-full py-3 px-4 bg-primary text-primary-foreground text-sm font-semibold rounded-2xl hover:opacity-90 active:scale-[0.98] transition flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirm & Add to Library</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={onReject}
            className="w-full py-2 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Not this book? Scan again</span>
          </button>
        </div>

      </div>
    </div>
  );
}
