'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Camera, Plus, Search, LogOut, Maximize, Minimize, BookOpen, Sparkles } from 'lucide-react';
import { BookCard } from '@/components/BookCard';
import { CameraModal } from '@/components/CameraModal';
import { BookFormModal } from '@/components/BookFormModal';
import { AuthModal } from '@/components/AuthModal';
import { getLocalBooks, addOrUpdateLocalBook, deleteLocalBook } from '@/lib/localStorage';

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Modals
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<any>(null);

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
      // If auth API is unavailable (e.g. static export on GitHub Pages), auto-assign local session
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
      const params = new URLSearchParams();
      if (filterStatus !== 'ALL') params.append('status', filterStatus);
      if (searchQuery) params.append('search', searchQuery);

      const res = await fetch(`/api/books?${params.toString()}`).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        setBooks(data.books || []);
        return;
      }

      // Fallback to local storage (for GitHub Pages / static export / offline mode)
      let localItems = getLocalBooks();
      if (filterStatus !== 'ALL') {
        localItems = localItems.filter((b) => b.status === filterStatus);
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        localItems = localItems.filter(
          (b) =>
            b.title.toLowerCase().includes(q) ||
            b.author.toLowerCase().includes(q) ||
            b.genre.toLowerCase().includes(q) ||
            b.publisher.toLowerCase().includes(q)
        );
      }
      setBooks(localItems);
    } catch (err) {
      console.error('Fetch books error:', err);
    }
  }, [filterStatus, searchQuery]);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  useEffect(() => {
    if (user) {
      fetchBooks();
    }
  }, [user, fetchBooks]);

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

  const handleRecognizedBook = (recognizedData: any) => {
    setEditingBook(recognizedData);
    setIsFormOpen(true);
  };

  const handleSaveBook = async (formData: any) => {
    const isEdit = Boolean(editingBook?.id);
    const url = isEdit ? `/api/books/${editingBook.id}` : '/api/books';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      }).catch(() => null);

      if (res && res.ok) {
        fetchBooks();
        setEditingBook(null);
        return;
      }

      // LocalStorage fallback
      addOrUpdateLocalBook({
        id: editingBook?.id,
        ...formData,
      });
      fetchBooks();
      setEditingBook(null);
    } catch (err) {
      console.error('Save book error:', err);
      // Fallback save locally
      addOrUpdateLocalBook({
        id: editingBook?.id,
        ...formData,
      });
      fetchBooks();
      setEditingBook(null);
    }
  };

  const handleDeleteBook = async (id: string) => {
    if (!confirm('Opravdu chcete tuto knihu smazat z knihovny?')) return;

    try {
      const res = await fetch(`/api/books/${id}`, { method: 'DELETE' }).catch(() => null);
      if (res && res.ok) {
        fetchBooks();
        return;
      }

      // LocalStorage fallback
      deleteLocalBook(id);
      fetchBooks();
    } catch (err) {
      console.error('Delete book error:', err);
      deleteLocalBook(id);
      fetchBooks();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-24 selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-600/20 border border-indigo-500/30 rounded-xl text-indigo-400">
            <BookOpen size={20} />
          </div>
          <div>
            <h1 className="font-bold text-base text-white leading-none tracking-tight">Knihovna</h1>
            <p className="text-[10px] font-medium text-slate-400 mt-0.5">
              {user ? user.email : 'Osobní sbírka'}
            </p>
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
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Hledat knihu, autora, žánr..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {[
              { id: 'ALL', label: 'Vše' },
              { id: 'READING', label: 'Čtu' },
              { id: 'UNREAD', label: 'Chci číst' },
              { id: 'READ', label: 'Přečteno' },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setFilterStatus(st.id)}
                className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all border ${
                  filterStatus === st.id
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Books Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Načítám vaši knihovnu...</span>
          </div>
        ) : !user ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4 bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8">
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
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3 bg-slate-900/30 border border-slate-800/60 rounded-3xl p-8">
            <Sparkles size={36} className="text-slate-600" />
            <h3 className="font-semibold text-slate-300 text-sm">Žádné knihy nebyly nalezeny</h3>
            <p className="text-xs text-slate-500 max-w-xs">
              Vyfoťte knihu pomocí hlavního tlačítka dole nebo ji přidejte ručně.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onEdit={(b) => {
                  setEditingBook(b);
                  setIsFormOpen(true);
                }}
                onDelete={handleDeleteBook}
              />
            ))}
          </div>
        )}
      </main>

      {/* Floating Bottom Action bar (Minimal Buttons) */}
      {user && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-slate-900/90 border border-slate-700/80 p-2 rounded-full shadow-2xl backdrop-blur-lg">
          <button
            onClick={() => {
              setEditingBook(null);
              setIsFormOpen(true);
            }}
            title="Přidat ručně"
            className="p-3.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-full transition-all active:scale-95"
          >
            <Plus size={22} />
          </button>

          <button
            onClick={() => setIsCameraOpen(true)}
            title="Vyfotit knihu"
            className="flex items-center gap-2 px-5 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-full shadow-lg shadow-indigo-500/30 transition-all active:scale-95"
          >
            <Camera size={22} />
            <span>Vyfotit</span>
          </button>
        </div>
      )}

      {/* Modals */}
      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onRecognized={handleRecognizedBook}
      />

      <BookFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingBook(null);
        }}
        onSave={handleSaveBook}
        initialData={editingBook}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={checkUser}
      />
    </div>
  );
}
