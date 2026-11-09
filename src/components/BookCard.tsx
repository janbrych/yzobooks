'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Bookmark, CheckCircle2, Trash2, Edit2, X, Star, MapPin } from 'lucide-react';
import { BookCover, AuthorAvatar } from '@/components/BookImages';
import { ReadToggle } from '@/components/ReadToggle';
import { Modal } from '@/components/Modal';
import { ShelfSelect } from '@/components/ShelfSelect';
import { formatLocation, type Bookcase } from '@/lib/locations';

export interface Book {
  id: string;
  title: string;
  author?: string | null;
  genre?: string | null;
  publisher?: string | null;
  publishedYear?: string | null;
  edition?: string | null;
  pageCount?: number | null;
  isbn?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  authorPhotoUrl?: string | null;
  shelfId?: string | null;
  status: string;
  rating?: number | null;
}

export type BookStatus = 'UNREAD' | 'READING' | 'READ';

interface BookCardProps {
  book: Book;
  index?: number;
  highlighted?: boolean;
  onEdit: (book: Book) => void;
  onDelete: (id: string) => void;
  onSetStatus: (book: Book, status: BookStatus) => void;
  onCoverUnavailable?: (book: Book) => void;
  locations?: Bookcase[];
  onSetShelf?: (book: Book, shelfId: string | null) => void;
}

const STATUS_OPTIONS: { id: BookStatus; label: string; icon: typeof Bookmark; active: string }[] = [
  { id: 'UNREAD', label: 'Chci číst', icon: Bookmark, active: 'bg-slate-700 text-slate-50' },
  { id: 'READING', label: 'Právě čtu', icon: BookOpen, active: 'bg-indigo-600 text-white' },
  { id: 'READ', label: 'Přečteno', icon: CheckCircle2, active: 'bg-emerald-600 text-white' },
];

const DELETE_WIDTH = 84;

export function BookCard({ book, index = 0, highlighted = false, onEdit, onDelete, onSetStatus, onCoverUnavailable, locations = [], onSetShelf }: BookCardProps) {
  const [showDetail, setShowDetail] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [translateX, setTranslateX] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Swipe gesture state: where the finger started and where the card was.
  const gesture = useRef<{ startX: number; startY: number; startTranslate: number; horizontal: boolean | null } | null>(
    null
  );
  const didSwipe = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    gesture.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      startTranslate: translateX,
      horizontal: null,
    };
    didSwipe.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.touches[0].clientX - g.startX;
    const dy = e.touches[0].clientY - g.startY;
    // Decide once per gesture whether this is a horizontal swipe or the user
    // scrolling the grid, so vertical scrolling never drags cards sideways.
    if (g.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) g.horizontal = Math.abs(dx) > Math.abs(dy);
    if (!g.horizontal) return;
    didSwipe.current = true;
    setDragging(true);
    setTranslateX(Math.max(-DELETE_WIDTH - 16, Math.min(0, g.startTranslate + dx)));
  };

  const handleTouchEnd = () => {
    setDragging(false);
    setTranslateX((x) => (x < -DELETE_WIDTH / 2 ? -DELETE_WIDTH : 0));
    gesture.current = null;
  };

  const isRead = book.status === 'READ';
  const meta = [book.publishedYear, book.pageCount ? `${book.pageCount} str.` : null].filter(Boolean).join(' · ');
  const longDescription = (book.description || '').length > 260;
  const location = formatLocation(locations, book.shelfId);
  const hasShelves = locations.some((c) => c.shelves.length > 0);

  return (
    <>
      <div
        className={`relative rounded-2xl animate-card-in ${highlighted ? 'animate-highlight' : ''}`}
        style={{ animationDelay: highlighted ? undefined : `${Math.min(index, 12) * 45}ms` }}
      >
        {/* Revealed behind the card while swiping left */}
        {translateX < 0 && (
          <div className="absolute inset-y-0 right-0 flex items-center justify-end rounded-2xl bg-red-600/90 w-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(book.id);
                setTranslateX(0);
              }}
              style={{ width: DELETE_WIDTH }}
              className="h-full flex flex-col items-center justify-center gap-1 text-xs font-semibold text-white"
            >
              <Trash2 size={20} />
              <span>Smazat</span>
            </button>
          </div>
        )}

        <div
          role="button"
          tabIndex={0}
          aria-label={`${book.title}${book.author ? `, ${book.author}` : ''}`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowDetail(true);
            }
          }}
          onClick={() => {
            if (didSwipe.current) return;
            if (translateX !== 0) setTranslateX(0);
            else setShowDetail(true);
          }}
          style={{ transform: translateX ? `translateX(${translateX}px)` : undefined }}
          // Read books get a quiet green tint — enough to scan the shelf by,
          // not loud enough to compete with the covers.
          className={`group relative z-10 h-full border rounded-2xl p-2.5 flex flex-col gap-2.5 cursor-pointer shadow-lg shadow-black/20 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
            isRead
              ? 'bg-emerald-900/30 border-emerald-700/45 hover:border-emerald-600/60 hover:shadow-emerald-500/10'
              : 'bg-slate-900 border-slate-800/80 hover:border-slate-600 hover:shadow-indigo-500/10'
          } ${dragging ? '' : 'transition-all duration-300 ease-out'}`}
        >
          <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden ring-1 ring-white/5">
            <BookCover
              src={book.coverUrl}
              title={book.title}
              author={book.author}
              className="w-full h-full"
              imgClassName="group-hover:scale-105 transition-transform duration-500"
              onUnavailable={onCoverUnavailable ? () => onCoverUnavailable(book) : undefined}
            />
            {/* Top fade keeps the overlay controls readable on light covers */}
            <div aria-hidden className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black/45 to-transparent pointer-events-none" />

            {book.status === 'READING' && (
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-600/90 text-white shadow-md backdrop-blur-md">
                <BookOpen size={11} /> Právě čtu
              </span>
            )}
            <div className="absolute top-2 right-2">
              <ReadToggle compact checked={isRead} onChange={(read) => onSetStatus(book, read ? 'READ' : 'UNREAD')} />
            </div>
          </div>

          <div className="flex flex-col flex-1 gap-1 px-0.5">
            <h3 className="font-semibold text-[13px] leading-snug text-slate-100 line-clamp-2 min-h-[2.5em] group-hover:text-indigo-300 transition-colors">
              {book.title}
            </h3>
            <div className="flex items-center gap-1.5 min-w-0">
              <AuthorAvatar src={book.authorPhotoUrl} name={book.author} size={20} />
              <p className="text-xs text-slate-400 truncate">{book.author || 'Neznámý autor'}</p>
            </div>
            {(meta || book.rating) && (
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-auto pt-1">
                {book.rating ? (
                  <span className="inline-flex items-center gap-0.5 text-amber-300/90 font-medium">
                    <Star size={10} fill="currentColor" /> {book.rating}
                  </span>
                ) : null}
                {book.rating && meta ? <span aria-hidden>·</span> : null}
                {meta}
              </p>
            )}
          </div>
        </div>
      </div>

      <Modal open={showDetail} onClose={() => setShowDetail(false)} label={book.title}>
        {/* Blurred cover as the backdrop of the hero area */}
        <div className="relative overflow-hidden">
          {book.coverUrl && !book.coverUrl.startsWith('data:') && (
            <div
              aria-hidden
              className="absolute inset-0 bg-cover bg-center scale-125 blur-2xl opacity-40"
              style={{ backgroundImage: `url("${book.coverUrl}")` }}
            />
          )}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/60 to-slate-900" />

          <button
            aria-label="Zavřít"
            onClick={() => setShowDetail(false)}
            className="absolute top-3 right-3 z-10 p-2 text-white/85 hover:text-white rounded-full bg-black/30 hover:bg-black/50 backdrop-blur transition-colors"
          >
            <X size={18} />
          </button>

          <div className="relative flex flex-col sm:flex-row gap-5 items-center sm:items-end p-6 pt-8">
            <BookCover
              src={book.coverUrl}
              title={book.title}
              author={book.author}
              className="w-32 sm:w-36 aspect-[2/3] rounded-xl shrink-0 shadow-2xl shadow-black/60 ring-1 ring-white/10 animate-rise"
            />
            <div className="flex flex-col gap-2 flex-1 min-w-0 text-center sm:text-left animate-rise [animation-delay:60ms]">
              <h2 className="text-xl font-bold text-slate-50 leading-tight">{book.title}</h2>
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <AuthorAvatar src={book.authorPhotoUrl} name={book.author} size={34} />
                <p className="text-sm font-medium text-indigo-300">{book.author || 'Neznámý autor'}</p>
              </div>
              {book.rating ? (
                <div className="flex items-center justify-center sm:justify-start gap-0.5 text-amber-400">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={14} fill={i < (book.rating || 0) ? 'currentColor' : 'none'} className={i < (book.rating || 0) ? '' : 'text-slate-600'} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5 px-6 pb-6 animate-rise [animation-delay:120ms]">
          {/* Reading status: one tap, no form needed */}
          <div role="radiogroup" aria-label="Stav čtení" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-950/70 border border-slate-800">
            {STATUS_OPTIONS.map(({ id, label, icon: Icon, active }) => {
              const selected = book.status === id;
              return (
                <button
                  key={id}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onSetStatus(book, id)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                    selected ? `${active} shadow-md` : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon size={14} className={selected ? 'animate-pop' : ''} /> {label}
                </button>
              );
            })}
          </div>

          {/* Where the book physically stands in the library */}
          <div className="rounded-xl bg-slate-950/50 border border-slate-800/80 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`shelf-${book.id}`} className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-1">
                <MapPin size={11} /> Umístění
              </label>
              <span className={`text-xs font-medium truncate ${location ? 'text-amber-200' : 'text-slate-500'}`} data-testid="book-location">
                {location || 'Neurčeno'}
              </span>
            </div>
            {hasShelves && onSetShelf ? (
              <ShelfSelect id={`shelf-${book.id}`} locations={locations} value={book.shelfId} onChange={(shelfId) => onSetShelf(book, shelfId)} />
            ) : (
              <Link href="/regaly" className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
                Založit regály a police →
              </Link>
            )}
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {[
              ['Žánr', book.genre],
              ['Nakladatel', book.publisher],
              ['Rok', book.publishedYear],
              ['Vydání', book.edition],
              ['Stran', book.pageCount ? String(book.pageCount) : null],
              ['ISBN', book.isbn],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-950/50 border border-slate-800/80 px-3 py-2 min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
                  <dd className={`text-slate-200 truncate ${label === 'ISBN' ? 'font-mono text-[11px]' : ''}`} title={value || ''}>
                    {value}
                  </dd>
                </div>
              ))}
          </dl>

          {book.description && (
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80">
              <p className={`text-xs leading-relaxed text-slate-300 ${showFullDescription ? '' : 'line-clamp-5'}`}>{book.description}</p>
              {longDescription && (
                <button
                  onClick={() => setShowFullDescription((v) => !v)}
                  className="mt-2 text-[11px] font-medium text-indigo-300 hover:text-indigo-200"
                >
                  {showFullDescription ? 'Méně' : 'Číst dál'}
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
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
      </Modal>
    </>
  );
}
