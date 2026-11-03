'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from 'react';
import { Camera, Plus, Search, LogOut, Maximize, Minimize, BookOpen, Sparkles, X } from 'lucide-react';
import { BookCard, type Book, type BookStatus } from '@/components/BookCard';
import { CameraModal, BookData } from '@/components/CameraModal';
import { BookFormModal, BookFormData, BookFormInitialData } from '@/components/BookFormModal';
import { AuthModal } from '@/components/AuthModal';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { getLocalBooks, addOrUpdateLocalBook, deleteLocalBook, LocalBook } from '@/lib/localStorage';

type Filter = 'ALL' | 'READING' | 'UNREAD' | 'READ' | 'NOT_READ';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'ALL', label: 'Vše' },
  { id: 'READING', label: 'Čtu' },
  { id: 'UNREAD', label: 'Chci číst' },
  { id: 'READ', label: 'Přečteno' },
  { id: 'NOT_READ', label: 'Nepřečteno' },
];

const UNDO_DELETE_MS = 6000;

function matchesFilter(book: LocalBook, filter: Filter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'NOT_READ') return book.status !== 'READ';
  return book.status === filter;
}

function matchesSearch(book: LocalBook, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return [book.title, book.author, book.genre, book.publisher, book.isbn].some((v) => (v || '').toLowerCase().includes(q));
}

// Standing books on the shelf (x, width, height, color); the shelf top is y = 80.
const SHELF_BOOKS = [
  { x: 20, w: 14, h: 58, color: '#6366f1' },
  { x: 36, w: 18, h: 68, color: '#c026d3' },
  { x: 56, w: 12, h: 50, color: '#10b981' },
  { x: 70, w: 16, h: 62, color: '#0ea5e9' },
];
// The leaning book pivots on its bottom-left corner. At 15° its top-left
// corner shifts left by 56·sin(15°) ≈ 14.5, so starting 15 units right of
// the last standing book (x = 86) it rests against it without overlapping.
const LEAN = { x: 101, w: 13, h: 56, angle: -15, color: '#f59e0b' };

function EmptyShelfIllustration() {
  const rise = (i: number) => ({ animationDelay: `${i * 90}ms`, transformBox: 'fill-box' as const, transformOrigin: 'bottom' });
  return (
    <svg aria-hidden viewBox="0 0 170 90" className="w-44 h-auto overflow-visible">
      {SHELF_BOOKS.map((b, i) => (
        <g key={b.x} className="animate-card-in" style={rise(i)}>
          <rect x={b.x} y={80 - b.h} width={b.w} height={b.h} rx={2} fill={b.color} fillOpacity={0.85} />
          <rect x={b.x} y={80 - b.h + 8} width={b.w} height={3} fill="white" fillOpacity={0.35} />
          <rect x={b.x} y={74} width={b.w} height={2} fill="white" fillOpacity={0.25} />
        </g>
      ))}
      <g className="animate-card-in" style={rise(SHELF_BOOKS.length)}>
        <g transform={`rotate(${LEAN.angle} ${LEAN.x} 80)`}>
          <rect x={LEAN.x} y={80 - LEAN.h} width={LEAN.w} height={LEAN.h} rx={2} fill={LEAN.color} fillOpacity={0.85} />
          <rect x={LEAN.x} y={80 - LEAN.h + 8} width={LEAN.w} height={3} fill="white" fillOpacity={0.35} />
        </g>
      </g>
      {/* two books lying flat */}
      <g className="animate-card-in" style={rise(SHELF_BOOKS.length + 1)}>
        <rect x={120} y={71} width={36} height={9} rx={2} fill="#f43f5e" fillOpacity={0.8} />
        <rect x={124} y={62} width={28} height={9} rx={2} fill="#14b8a6" fillOpacity={0.8} />
        <rect x={150} y={71} width={2} height={9} fill="white" fillOpacity={0.3} />
      </g>
      {/* the shelf board */}
      <rect x={8} y={80} width={154} height={5} rx={2.5} fill="#475569" />
      <rect x={14} y={85} width={142} height={3} rx={1.5} fill="#1e293b" />
    </svg>
  );
}

export default function Home() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  // The whole library; filters and search run client-side so switching them
  // is instant and the counters/progress always describe the full shelf.
  const [books, setBooks] = useState<LocalBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [booksLoaded, setBooksLoaded] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Filter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery.trim());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // Books removed from view but not yet deleted, so "Vrátit" can bring them back.
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const deleteTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Modals
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<BookFormInitialData | null>(null);

  const checkUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me').catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          return;
        }
      }
      setUser({ id: 'local-user', email: 'Můj účet (Lokální)' });
    } catch (err) {
      console.error(err);
      setUser({ id: 'local-user', email: 'Můj účet (Lokální)' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBooks = useCallback(async () => {
    try {
      const res = await fetch('/api/books').catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        setBooks(data.books || []);
        return;
      }
      // Fallback to localStorage (for GitHub Pages / static export / offline mode)
      setBooks(getLocalBooks());
    } catch (err) {
      console.error('Fetch books error:', err);
    } finally {
      setBooksLoaded(true);
    }
  }, []);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  useEffect(() => {
    if (user) {
      fetchBooks();
    }
  }, [user, fetchBooks]);

  const shelf = useMemo(() => books.filter((b) => !pendingDeletes.has(b.id)), [books, pendingDeletes]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: shelf.length, READING: 0, UNREAD: 0, READ: 0, NOT_READ: 0 };
    shelf.forEach((b) => {
      c[b.status] = (c[b.status] || 0) + 1;
      if (b.status !== 'READ') c.NOT_READ++;
    });
    return c;
  }, [shelf]);
  const visibleBooks = useMemo(
    () => shelf.filter((b) => matchesFilter(b, filterStatus) && matchesSearch(b, deferredSearch)),
    [shelf, filterStatus, deferredSearch]
  );
  const readPercent = counts.ALL ? Math.round((counts.READ / counts.ALL) * 100) : 0;

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    setUser(null);
    setBooks([]);
    setIsAuthOpen(true);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
      }
    }
  };

  const handleRecognizedBook = (recognizedData: BookData) => {
    setEditingBook(recognizedData as BookFormInitialData);
    setIsFormOpen(true);
  };

  const flashBook = (id: string | undefined) => {
    if (!id) return;
    setHighlightId(id);
    setTimeout(() => setHighlightId((current) => (current === id ? null : current)), 2400);
  };

  const handleSaveBook = async (formData: Record<string, unknown>) => {
    const isEdit = Boolean(editingBook?.id);
    const url = isEdit ? `/api/books/${editingBook?.id}` : '/api/books';
    const method = isEdit ? 'PUT' : 'POST';
    let savedId: string | undefined = editingBook?.id;

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    }).catch(() => null);

    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      savedId = data.book?.id || savedId;
    } else {
      // LocalStorage fallback
      savedId = addOrUpdateLocalBook({ id: editingBook?.id, ...formData } as Partial<LocalBook>).id;
    }

    await fetchBooks();
    setEditingBook(null);
    // Show the result: jump back to a view that contains the book and make it glow.
    if (!isEdit) {
      setFilterStatus('ALL');
      setSearchQuery('');
    }
    flashBook(savedId);
    toast(isEdit ? 'Změny uloženy' : `„${formData.title}“ je v knihovně`, { tone: 'success' });
  };

  // LocalStorage fallback. Only touches books that live there — upserting an
  // unknown (server-side) id would create an empty duplicate entry.
  const updateLocalStatus = (id: string, status: LocalBook['status']) => {
    if (getLocalBooks().some((b) => b.id === id)) {
      addOrUpdateLocalBook({ id, status });
    }
  };

  const handleSetStatus = async (book: Book, status: BookStatus) => {
    if (book.status === status) return;
    // Optimistic update so the switch reacts immediately; fetchBooks() then
    // reconciles with the source of truth.
    setBooks((prev) => prev.map((b) => (b.id === book.id ? { ...b, status } : b)));

    if (status === 'READ') {
      const readNow = counts.READ + 1;
      toast(`Přečteno! Už máte ${readNow} z ${counts.ALL} ${readNow === counts.ALL ? '– celá knihovna 🎉' : ''}`.trim(), {
        tone: 'success',
      });
    }

    const res = await fetch(`/api/books/${book.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (!res || !res.ok) {
      updateLocalStatus(book.id, status);
    }
    fetchBooks();
  };

  const commitDelete = async (id: string) => {
    deleteTimers.current.delete(id);
    const res = await fetch(`/api/books/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res || !res.ok) {
      // LocalStorage fallback
      deleteLocalBook(id);
    }
    await fetchBooks();
    setPendingDeletes((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // No confirm() dialog: the book disappears at once and the toast offers to
  // undo; it is only really deleted when the toast runs out.
  const handleDeleteBook = (id: string) => {
    const book = books.find((b) => b.id === id);
    setPendingDeletes((prev) => new Set(prev).add(id));
    deleteTimers.current.set(id, setTimeout(() => commitDelete(id), UNDO_DELETE_MS));
    toast(`Smazáno: ${book?.title || 'kniha'}`, {
      tone: 'info',
      duration: UNDO_DELETE_MS,
      action: {
        label: 'Vrátit',
        onClick: () => {
          const timer = deleteTimers.current.get(id);
          if (timer) clearTimeout(timer);
          deleteTimers.current.delete(id);
          setPendingDeletes((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          flashBook(id);
        },
      },
    });
  };

  // Don't lose a pending delete when the tab is closed mid-undo window.
  useEffect(() => {
    const timers = deleteTimers.current;
    const flush = () => {
      timers.forEach((timer, id) => {
        clearTimeout(timer);
        if (id.startsWith('local_')) deleteLocalBook(id);
      });
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const showSkeleton = loading || (user && !booksLoaded);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-28 selection:bg-indigo-500 selection:text-white">
      {/* Soft ambient glow behind the header */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(99_102_241/0.18),transparent)]" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/75 backdrop-blur-xl border-b border-slate-800/80 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/20 border border-indigo-500/30 rounded-xl text-indigo-300">
            <BookOpen size={20} />
          </div>
          <div>
            <h1 className="font-bold text-base text-white leading-none tracking-tight">Knihovna</h1>
            <p className="text-[10px] font-medium text-slate-400 mt-0.5">{user ? user.email : 'Osobní sbírka'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            title="Přepnout na celou obrazovku"
            className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-colors"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>

          {user ? (
            <button
              onClick={handleLogout}
              title="Odhlásit se"
              className="p-2 text-slate-400 hover:text-red-400 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-colors"
            >
              <LogOut size={18} />
            </button>
          ) : (
            <button
              onClick={() => setIsAuthOpen(true)}
              className="px-3 py-1.5 bg-indigo-600 text-white font-medium text-xs rounded-xl shadow-md shadow-indigo-600/20"
            >
              Přihlásit
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {user && counts.ALL > 0 && (
          <section aria-label="Přehled čtení" className="flex items-center gap-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 px-4 py-3 animate-rise">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200">
                <span className="font-bold text-white">{counts.READ}</span> z {counts.ALL} přečteno
                {counts.READING > 0 && <span className="text-slate-400"> · {counts.READING} právě čtete</span>}
              </p>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={readPercent}
                aria-label="Přečteno z knihovny"
                className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400 transition-[width] duration-700 ease-out"
                  style={{ width: `${readPercent}%` }}
                />
              </div>
            </div>
            <span className="text-2xl font-bold tabular-nums text-white">{readPercent}%</span>
          </section>
        )}

        {/* Search and Filters */}
        {/* Side by side only when the five counted filter chips leave the search box room */}
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="relative flex-1 lg:min-w-64">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              placeholder="Hledat knihu, autora, žánr, ISBN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl pl-10 pr-9 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 focus:ring-4 focus:ring-indigo-500/10 transition-all [&::-webkit-search-cancel-button]:hidden"
            />
            {searchQuery && (
              <button
                aria-label="Vymazat hledání"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-200 rounded-full animate-pop"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div role="tablist" aria-label="Filtr podle stavu" className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            {FILTERS.map((st) => {
              const active = filterStatus === st.id;
              return (
                <button
                  key={st.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilterStatus(st.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-200 border flex items-center gap-1.5 active:scale-95 ${
                    active
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/25'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {st.label}
                  {user && (
                    <span className={`tabular-nums text-[10px] px-1.5 rounded-full ${active ? 'bg-white/20' : 'bg-slate-800 text-slate-500'}`}>
                      {counts[st.id]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Books Grid */}
        {showSkeleton ? (
          <div aria-label="Načítám knihovnu" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-slate-900 border border-slate-800/80 p-2.5 flex flex-col gap-2.5">
                <div className="aspect-[2/3] rounded-xl skeleton animate-shimmer" />
                <div className="h-3 w-4/5 rounded skeleton animate-shimmer" />
                <div className="h-3 w-1/2 rounded skeleton animate-shimmer" />
              </div>
            ))}
          </div>
        ) : !user ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4 bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8 animate-rise">
            <div className="p-4 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl text-indigo-400">
              <BookOpen size={36} />
            </div>
            <h2 className="text-lg font-bold text-white">Vítejte v AI Knihovně</h2>
            <p className="text-xs text-slate-400 max-w-sm">
              Pro zobrazení a správu vaší osobní knihovny se prosím přihlaste nebo si vytvořte účet.
            </p>
            <button
              onClick={() => setIsAuthOpen(true)}
              className="py-2.5 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-indigo-500/20 transition-all"
            >
              Přihlásit / Registrovat
            </button>
          </div>
        ) : shelf.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center gap-4 bg-slate-900/30 border border-dashed border-slate-700/70 rounded-3xl p-8 animate-rise">
            <EmptyShelfIllustration />
            <h3 className="font-semibold text-slate-200">Vaše police je zatím prázdná</h3>
            <p className="text-xs text-slate-400 max-w-xs">
              Vyfoťte obálku nebo čárový kód a kniha se doplní sama — včetně obálky a fotky autora.
            </p>
            <button
              onClick={() => setIsCameraOpen(true)}
              className="mt-1 flex items-center gap-2 py-2.5 px-5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-indigo-500/25 transition-all active:scale-95"
            >
              <Camera size={16} /> Přidat první knihu
            </button>
          </div>
        ) : visibleBooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center gap-3 animate-rise">
            <Sparkles size={32} className="text-slate-600" />
            <h3 className="font-semibold text-slate-300 text-sm">
              {deferredSearch ? `Nic jsme nenašli pro „${deferredSearch}“` : 'V tomhle filtru zatím nic není'}
            </h3>
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterStatus('ALL');
              }}
              className="text-xs font-medium text-indigo-300 hover:text-indigo-200"
            >
              Zobrazit celou knihovnu
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {visibleBooks.map((book, index) => (
              <BookCard
                key={book.id}
                book={book}
                index={index}
                highlighted={highlightId === book.id}
                onEdit={(b) => {
                  setEditingBook(b as unknown as Partial<BookFormData>);
                  setIsFormOpen(true);
                }}
                onDelete={handleDeleteBook}
                onSetStatus={handleSetStatus}
              />
            ))}
          </div>
        )}
      </main>

      {/* Floating Bottom Action bar */}
      {user && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-slate-900/85 border border-slate-700/80 p-2 rounded-full shadow-2xl shadow-black/50 backdrop-blur-xl animate-rise">
          <button
            onClick={() => {
              setEditingBook(null);
              setIsFormOpen(true);
            }}
            title="Přidat ručně"
            className="p-3.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-full transition-all active:scale-90"
          >
            <Plus size={22} />
          </button>

          <button
            onClick={() => setIsCameraOpen(true)}
            title="Vyfotit knihu"
            className="group relative flex items-center gap-2 px-5 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm rounded-full shadow-lg shadow-indigo-500/30 transition-all active:scale-95 overflow-hidden"
          >
            {/* light sweep on hover */}
            <span aria-hidden className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <Camera size={22} className="relative" />
            <span className="relative">Vyfotit</span>
          </button>
        </div>
      )}

      {/* Modals */}
      <CameraModal isOpen={isCameraOpen} onClose={() => setIsCameraOpen(false)} onRecognized={handleRecognizedBook} />

      <BookFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingBook(null);
        }}
        onSave={handleSaveBook}
        initialData={editingBook}
      />

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onSuccess={checkUser} />

      <Toaster />
    </div>
  );
}
