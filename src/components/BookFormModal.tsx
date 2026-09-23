'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, Search, RefreshCw, Star } from 'lucide-react';

interface BookFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (formData: any) => Promise<void>;
  initialData?: any;
}

export function BookFormModal({ isOpen, onClose, onSave, initialData }: BookFormModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    genre: '',
    pageCount: '',
    isbn: '',
    description: '',
    coverUrl: '',
    status: 'UNREAD',
    rating: 0,
  });

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title || '',
        author: initialData.author || '',
        genre: initialData.genre || '',
        pageCount: initialData.pageCount ? String(initialData.pageCount) : '',
        isbn: initialData.isbn || '',
        description: initialData.description || '',
        coverUrl: initialData.coverUrl || '',
        status: initialData.status || 'UNREAD',
        rating: initialData.rating || 0,
      });
    } else {
      setFormData({
        title: '',
        author: '',
        genre: '',
        pageCount: '',
        isbn: '',
        description: '',
        coverUrl: '',
        status: 'UNREAD',
        rating: 0,
      });
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSearchOnline = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);

    try {
      const res = await fetch('/api/books/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      });
      const data = await res.json();
      if (res.ok && data.result) {
        setFormData((prev) => ({
          ...prev,
          title: data.result.title || prev.title,
          author: data.result.author || prev.author,
          genre: data.result.genre || prev.genre,
          pageCount: data.result.pageCount ? String(data.result.pageCount) : prev.pageCount,
          isbn: data.result.isbn || prev.isbn,
          description: data.result.description || prev.description,
          coverUrl: data.result.coverUrl || prev.coverUrl,
        }));
      } else {
        alert('Nenalezeny žádné podrobnosti k vyhledanému dotazu.');
      }
    } catch (err) {
      console.error(err);
      alert('Chyba při hledání v databázi.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert('Prosím vyplňte název knihy.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        pageCount: formData.pageCount ? parseInt(formData.pageCount, 10) : null,
        rating: formData.rating || null,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-lg font-bold text-slate-100">
            {initialData?.id ? 'Upravit knihu' : 'Přidat novou knihu'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800">
            <X size={20} />
          </button>
        </div>

        {/* Quick Online Search Fill */}
        {!initialData?.id && (
          <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80 flex gap-2 items-center">
            <input
              type="text"
              placeholder="Hledat knihu online podle názvu / ISBN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearchOnline())}
              className="flex-1 bg-transparent border-none text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSearchOnline}
              disabled={isSearching}
              className="py-1.5 px-3 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-xl text-xs font-medium flex items-center gap-1 shrink-0 transition-colors"
            >
              {isSearching ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              Dohledat
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Název knihy *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Autor</label>
              <input
                type="text"
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Žánr</label>
              <input
                type="text"
                value={formData.genre}
                onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Počet stran</label>
              <input
                type="number"
                value={formData.pageCount}
                onChange={(e) => setFormData({ ...formData, pageCount: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">ISBN</label>
              <input
                type="text"
                value={formData.isbn}
                onChange={(e) => setFormData({ ...formData, isbn: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Stav čtení</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="UNREAD">Chci si přečíst</option>
              <option value="READING">Právě čtu</option>
              <option value="READ">Přečteno</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Hodnocení</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setFormData({ ...formData, rating: formData.rating === star ? 0 : star })}
                  className="p-1 text-amber-400 focus:outline-none"
                >
                  <Star size={20} fill={formData.rating >= star ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">URL Obálky</label>
            <input
              type="text"
              value={formData.coverUrl}
              onChange={(e) => setFormData({ ...formData, coverUrl: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Popis / Poznámka</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition-colors"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm flex items-center gap-2 transition-colors shadow-lg shadow-indigo-500/20"
            >
              {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
              Uložit knihu
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
