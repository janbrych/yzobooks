'use client';

import React, { useState } from 'react';
import { BookPlus, CheckCircle2, BookOpen, Bookmark, Trash2, Edit2, X, Star } from 'lucide-react';

interface Book {
  id: string;
  title: string;
  author?: string | null;
  genre?: string | null;
  pageCount?: number | null;
  isbn?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  status: string;
  rating?: number | null;
}

interface BookCardProps {
  book: Book;
  onEdit: (book: Book) => void;
  onDelete: (id: string) => void;
}

export function BookCard({ book, onEdit, onDelete }: BookCardProps) {
  const [showDetail, setShowDetail] = useState(false);

  const statusBadges: Record<string, { label: string; color: string; icon: any }> = {
    UNREAD: { label: 'Chci číst', color: 'bg-slate-800 text-slate-300 border-slate-700', icon: Bookmark },
    READING: { label: 'Právě čtu', color: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/50', icon: BookOpen },
    READ: { label: 'Přečteno', color: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/50', icon: CheckCircle2 },
  };

  const badge = statusBadges[book.status] || statusBadges.UNREAD;
  const BadgeIcon = badge.icon;

  return (
    <>
      <div
        onClick={() => setShowDetail(true)}
        className="group relative bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 flex flex-col gap-3 hover:border-slate-700 transition-all cursor-pointer shadow-lg hover:shadow-indigo-500/5 active:scale-[0.98]"
      >
        <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-slate-800/50 flex items-center justify-center border border-slate-800">
          {book.coverUrl ? (
            <img
              src={book.coverUrl}
              alt={book.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-600 p-2 text-center">
              <BookPlus size={36} className="mb-2 opacity-50" />
              <span className="text-xs font-medium line-clamp-2">{book.title}</span>
            </div>
          )}

          <div className="absolute top-2 right-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border backdrop-blur-md ${badge.color}`}>
              <BadgeIcon size={11} />
              {badge.label}
            </span>
          </div>
        </div>

        <div className="flex flex-col flex-1 justify-between gap-1">
          <div>
            <h3 className="font-semibold text-sm text-slate-100 line-clamp-1 group-hover:text-indigo-400 transition-colors">
              {book.title}
            </h3>
            <p className="text-xs text-slate-400 line-clamp-1">{book.author || 'Neznámý autor'}</p>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
            <span>{book.genre || 'Bez žánru'}</span>
            {book.pageCount ? <span>{book.pageCount} str.</span> : null}
          </div>
        </div>
      </div>

      {/* Modal Detail */}
      {showDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowDetail(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex flex-col sm:flex-row gap-5 items-start">
              <div className="w-28 sm:w-36 aspect-[2/3] rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-slate-700 shadow-md mx-auto sm:mx-0">
                {book.coverUrl ? (
                  <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    <BookPlus size={32} />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 flex-1 w-full text-center sm:text-left">
                <span className={`self-center sm:self-start inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${badge.color}`}>
                  <BadgeIcon size={12} />
                  {badge.label}
                </span>

                <h2 className="text-xl font-bold text-white leading-tight">{book.title}</h2>
                <p className="text-sm font-medium text-indigo-400">{book.author || 'Neznámý autor'}</p>

                <div className="flex flex-wrap justify-center sm:justify-start gap-x-4 gap-y-1 text-xs text-slate-400 pt-2 border-t border-slate-800">
                  {book.genre && <div>Žánr: <span className="text-slate-200">{book.genre}</span></div>}
                  {book.pageCount && <div>Stran: <span className="text-slate-200">{book.pageCount}</span></div>}
                  {book.isbn && <div>ISBN: <span className="text-slate-200">{book.isbn}</span></div>}
                </div>

                {book.rating && (
                  <div className="flex items-center justify-center sm:justify-start gap-1 text-amber-400 pt-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={14} fill={i < (book.rating || 0) ? 'currentColor' : 'none'} className={i < (book.rating || 0) ? 'text-amber-400' : 'text-slate-700'} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {book.description && (
              <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
                <p className="text-xs leading-relaxed text-slate-300">{book.description}</p>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  setShowDetail(false);
                  onEdit(book);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Edit2 size={16} /> Upravit
              </button>
              <button
                onClick={() => {
                  setShowDetail(false);
                  onDelete(book.id);
                }}
                className="py-2.5 px-4 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-400 font-medium text-sm flex items-center justify-center gap-2 border border-red-900/50 transition-colors"
              >
                <Trash2 size={16} /> Smazat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
