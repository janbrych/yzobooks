'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, LibraryBig, MapPin, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { BookCover } from '@/components/BookImages';
import { Modal } from '@/components/Modal';
import { ShelfSelect } from '@/components/ShelfSelect';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/toast';
import { getLocalBooks, type LocalBook } from '@/lib/localStorage';
import {
  addBookcase,
  addShelf,
  assignBookShelf,
  findShelf,
  formatLocation,
  nextShelfName,
  plural,
  removeBookcase,
  removeShelf,
  renameBookcase,
  renameShelf,
  shelfIdsOf,
  type Bookcase,
  type Shelf,
} from '@/lib/locations';
import { useLocations } from '@/lib/useLocations';

type ShelfBook = Pick<LocalBook, 'id' | 'title' | 'author' | 'coverUrl' | 'isbn'> & { shelfId?: string | null };

async function loadBooks(): Promise<ShelfBook[]> {
  const res = await fetch('/api/books').catch(() => null);
  if (res && res.ok) {
    const data = await res.json().catch(() => ({}));
    if (Array.isArray(data.books)) return data.books;
  }
  return getLocalBooks();
}

function norm(v: string | null | undefined) {
  return (v || '').toLocaleLowerCase('cs').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function matches(book: ShelfBook, q: string) {
  if (!q) return true;
  return [book.title, book.author, book.isbn].some((v) => norm(v).includes(q));
}

// ---------------------------------------------------------------------------

/** Text that turns into an input on "rename"; Enter saves, Escape cancels. */
function EditableName({
  name,
  onRename,
  className,
  label,
}: {
  name: string;
  onRename: (name: string) => void;
  className: string;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (!editing) {
    return (
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={`truncate ${className}`}>{name}</span>
        <button
          aria-label={`Přejmenovat ${label}`}
          title="Přejmenovat"
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
          className="p-1 shrink-0 text-slate-500 hover:text-slate-200 rounded-md"
        >
          <Pencil size={13} />
        </button>
      </span>
    );
  }

  const save = () => {
    onRename(draft);
    setEditing(false);
  };
  return (
    <form
      className="flex items-center gap-1 min-w-0"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        aria-label={`Nový název – ${label}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        className="min-w-0 w-40 bg-slate-950 border border-indigo-500/70 rounded-lg px-2 py-1 text-sm text-slate-50 focus:outline-none"
      />
      <button type="submit" aria-label="Uložit název" className="p-1 text-emerald-400 hover:text-emerald-300">
        <Check size={15} />
      </button>
      <button type="button" aria-label="Zrušit" onClick={() => setEditing(false)} className="p-1 text-slate-500 hover:text-slate-200">
        <X size={15} />
      </button>
    </form>
  );
}

/** Delete with a second tap instead of a blocking confirm() dialog. */
function ConfirmDelete({ onConfirm, label, detail }: { onConfirm: () => void; label: string; detail?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button
      onClick={onConfirm}
      className="shrink-0 px-2 py-1 rounded-lg text-[11px] font-semibold bg-red-600 text-white animate-pop"
      title={detail}
    >
      Opravdu smazat?
    </button>
  ) : (
    <button
      aria-label={`Smazat ${label}`}
      title="Smazat"
      onClick={() => setArmed(true)}
      className="p-1.5 shrink-0 text-slate-500 hover:text-red-400 rounded-md"
    >
      <Trash2 size={14} />
    </button>
  );
}

function AddNameForm({ placeholder, buttonLabel, onAdd, compact }: { placeholder: string; buttonLabel: string; onAdd: (name: string) => void; compact?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(value);
        setValue('');
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`flex-1 min-w-0 bg-slate-950/70 border border-slate-800 rounded-xl px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 ${compact ? 'py-1.5' : 'py-2.5'}`}
      />
      <button
        type="submit"
        className={`shrink-0 flex items-center gap-1.5 px-3 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all ${compact ? 'py-1.5 text-xs' : 'py-2.5 text-sm'}`}
      >
        <Plus size={compact ? 14 : 16} /> {buttonLabel}
      </button>
    </form>
  );
}

/** A book standing on a shelf board: its cover, tap for options. */
function BookSpine({ book, onOpen }: { book: ShelfBook; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      title={`${book.title}${book.author ? ` – ${book.author}` : ''}`}
      className="group shrink-0 w-14 flex flex-col gap-1 text-left focus-visible:outline-none"
    >
      <BookCover
        src={book.coverUrl}
        title={book.title}
        author={book.author}
        compact
        className="w-14 aspect-[2/3] rounded-md shadow-md shadow-black/50 ring-1 ring-white/10 group-hover:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-indigo-400 transition-transform"
      />
      <span className="text-[10px] leading-tight text-slate-400 line-clamp-2 group-hover:text-slate-200">{book.title}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------

export function LocationsScreen() {
  const [locations, setLocations, locationsLoaded] = useLocations();
  const [books, setBooks] = useState<ShelfBook[]>([]);
  const [booksLoaded, setBooksLoaded] = useState(false);
  const [finder, setFinder] = useState('');
  // Book picker for one shelf, and the options sheet for one book.
  const [pickerShelf, setPickerShelf] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [openBookId, setOpenBookId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBooks(await loadBooks());
    setBooksLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const booksByShelf = useMemo(() => {
    const map = new Map<string, ShelfBook[]>();
    for (const b of books) {
      if (!b.shelfId || !findShelf(locations, b.shelfId)) continue;
      const list = map.get(b.shelfId) || [];
      list.push(b);
      map.set(b.shelfId, list);
    }
    map.forEach((list) => list.sort((a, b) => a.title.localeCompare(b.title, 'cs')));
    return map;
  }, [books, locations]);

  const unplaced = useMemo(() => books.filter((b) => !findShelf(locations, b.shelfId)), [books, locations]);
  const shelfCount = locations.reduce((n, c) => n + c.shelves.length, 0);
  const finderQuery = norm(finder.trim());
  const finderResults = useMemo(
    () => (finderQuery ? books.filter((b) => matches(b, finderQuery)).slice(0, 8) : []),
    [books, finderQuery]
  );

  const setShelf = async (book: ShelfBook, shelfId: string | null, quiet = false) => {
    setBooks((prev) => prev.map((b) => (b.id === book.id ? { ...b, shelfId } : b)));
    await assignBookShelf(book.id, shelfId);
    if (!quiet) {
      const where = formatLocation(locations, shelfId);
      toast(where ? `„${book.title}“ → ${where}` : `„${book.title}“ sundána z police`, { tone: 'success' });
    }
  };

  // Books on deleted shelves go back to "bez umístění".
  const clearShelves = async (shelfIds: string[]) => {
    const affected = books.filter((b) => b.shelfId && shelfIds.includes(b.shelfId));
    await Promise.all(affected.map((b) => setShelf(b, null, true)));
    return affected.length;
  };

  const handleDeleteBookcase = async (c: Bookcase) => {
    const ids = shelfIdsOf(locations, c.id);
    setLocations(removeBookcase(locations, c.id));
    const n = await clearShelves(ids);
    toast(`Regál „${c.name}“ smazán${n ? ` · ${plural(n, ['kniha', 'knihy', 'knih'])} bez umístění` : ''}`, { tone: 'info' });
  };

  const handleDeleteShelf = async (c: Bookcase, s: Shelf) => {
    setLocations(removeShelf(locations, s.id));
    const n = await clearShelves([s.id]);
    toast(`${c.name} → ${s.name} smazána${n ? ` · ${plural(n, ['kniha', 'knihy', 'knih'])} bez umístění` : ''}`, { tone: 'info' });
  };

  const openBook = books.find((b) => b.id === openBookId) || null;
  const picker = findShelf(locations, pickerShelf);
  const pickerQ = norm(pickerQuery.trim());
  const pickerBooks = useMemo(() => {
    if (!pickerShelf) return [];
    return books
      .filter((b) => b.shelfId !== pickerShelf && matches(b, pickerQ))
      // Books without a place first — that's who usually needs one.
      .sort((a, b) => Number(Boolean(findShelf(locations, a.shelfId))) - Number(Boolean(findShelf(locations, b.shelfId))));
  }, [books, pickerShelf, pickerQ, locations]);

  const ready = locationsLoaded && booksLoaded;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(245_158_11/0.12),transparent)]" />

      <header className="sticky top-0 z-40 bg-slate-950/75 backdrop-blur-xl border-b border-slate-800/80 px-4 py-3.5 flex items-center gap-3">
        <Link
          href="/"
          aria-label="Zpět do knihovny"
          className="p-2 text-slate-400 hover:text-slate-50 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="p-2 bg-gradient-to-br from-amber-500/30 to-orange-500/15 border border-amber-500/30 rounded-xl text-amber-300">
          <LibraryBig size={20} />
        </div>
        <div className="min-w-0">
          <h1 className="font-bold text-base text-slate-50 leading-none tracking-tight">Regály a police</h1>
          <p className="text-[10px] font-medium text-slate-400 mt-0.5">
            {plural(locations.length, ['regál', 'regály', 'regálů'])} · {plural(shelfCount, ['police', 'police', 'polic'])} · umístěno {books.length - unplaced.length} z {books.length}
          </p>
        </div>
      </header>

      <main className="relative flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        {/* Where is it? — quick lookup for a librarian at the desk */}
        <section className="flex flex-col gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={finder}
              onChange={(e) => setFinder(e.target.value)}
              placeholder="Kde stojí kniha? Název, autor, ISBN…"
              aria-label="Najít umístění knihy"
              className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/70 focus:ring-4 focus:ring-amber-500/10"
            />
          </div>
          {finderQuery && (
            <ul className="rounded-2xl border border-slate-800 bg-slate-900/80 divide-y divide-slate-800/80 overflow-hidden animate-rise">
              {finderResults.length === 0 && <li className="px-4 py-3 text-xs text-slate-500">Nic nenalezeno</li>}
              {finderResults.map((b) => {
                const where = formatLocation(locations, b.shelfId);
                return (
                  <li key={b.id}>
                    <button onClick={() => setOpenBookId(b.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-800/60">
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-slate-100 truncate">{b.title}</span>
                        <span className="block text-[11px] text-slate-500 truncate">{b.author || 'Neznámý autor'}</span>
                      </span>
                      <span className={`shrink-0 flex items-center gap-1 text-xs font-medium ${where ? 'text-amber-200' : 'text-slate-500'}`}>
                        <MapPin size={12} /> {where || 'bez umístění'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <AddNameForm placeholder="Nový regál, např. Regál A – Beletrie" buttonLabel="Regál" onAdd={(name) => setLocations(addBookcase(locations, name))} />

        {!ready ? (
          <div className="h-40 rounded-3xl skeleton animate-shimmer" aria-label="Načítám" />
        ) : locations.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-3 py-12 px-6 rounded-3xl border border-dashed border-slate-700/70 bg-slate-900/30 animate-rise">
            <LibraryBig size={36} className="text-amber-300/70" />
            <h2 className="font-semibold text-slate-200">Zatím žádné regály</h2>
            <p className="text-xs text-slate-400 max-w-sm">
              Založte regál, přidejte do něj police a rozestavte knihy. U každé knihy pak uvidíte, kde ji najít — třeba „Regál A → Police 3“.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {locations.map((c, ci) => {
              const caseBooks = c.shelves.reduce((n, s) => n + (booksByShelf.get(s.id)?.length || 0), 0);
              return (
                <section
                  key={c.id}
                  aria-label={c.name}
                  className="rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-900/60 shadow-xl shadow-black/30 overflow-hidden animate-card-in"
                  style={{ animationDelay: `${Math.min(ci, 8) * 50}ms` }}
                >
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/80 bg-slate-950/40">
                    <span className="h-7 w-1.5 rounded-full bg-gradient-to-b from-amber-400 to-orange-600 shrink-0" aria-hidden />
                    <div className="flex-1 min-w-0">
                      <EditableName name={c.name} label={`regál ${c.name}`} className="font-semibold text-slate-50" onRename={(n) => setLocations(renameBookcase(locations, c.id, n))} />
                      <p className="text-[10px] text-slate-500">
                        {plural(c.shelves.length, ['police', 'police', 'polic'])} · {plural(caseBooks, ['kniha', 'knihy', 'knih'])}
                      </p>
                    </div>
                    <ConfirmDelete label={`regál ${c.name}`} detail="Knihy z jeho polic zůstanou v knihovně bez umístění" onConfirm={() => handleDeleteBookcase(c)} />
                  </div>

                  <div className="flex flex-col gap-4 p-4">
                    {c.shelves.length === 0 && <p className="text-xs text-slate-500">Regál je prázdný — přidejte první polici.</p>}
                    {c.shelves.map((s) => {
                      const onShelf = booksByShelf.get(s.id) || [];
                      return (
                        <div key={s.id} className="flex flex-col gap-1.5" aria-label={`${c.name} → ${s.name}`} role="group">
                          <div className="flex items-center gap-1 min-w-0">
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <EditableName name={s.name} label={`polici ${s.name}`} className="text-sm font-medium text-slate-200" onRename={(n) => setLocations(renameShelf(locations, s.id, n))} />
                              <span className="shrink-0 tabular-nums text-[10px] px-1.5 rounded-full bg-slate-800 text-slate-400">{onShelf.length}</span>
                            </div>
                            <button
                              onClick={() => {
                                setPickerQuery('');
                                setPickerShelf(s.id);
                              }}
                              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-amber-200 hover:text-amber-100 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20"
                            >
                              <Plus size={12} /> Kniha
                            </button>
                            <ConfirmDelete label={`polici ${s.name}`} detail="Knihy z police zůstanou v knihovně bez umístění" onConfirm={() => handleDeleteShelf(c, s)} />
                          </div>
                          {/* The shelf itself: books standing on a board */}
                          <div className="relative">
                            <div className="flex items-end gap-2 overflow-x-auto scrollbar-none px-2 pt-2 pb-2 min-h-[6.5rem]">
                              {onShelf.length === 0 ? (
                                <span className="self-center text-[11px] text-slate-600 px-1">Prázdná police</span>
                              ) : (
                                onShelf.map((b) => <BookSpine key={b.id} book={b} onOpen={() => setOpenBookId(b.id)} />)
                              )}
                            </div>
                            <div aria-hidden className="h-2 rounded-full bg-gradient-to-b from-amber-700/80 to-amber-900 shadow-[0_6px_12px_-4px_rgb(0_0_0/0.6)]" />
                          </div>
                        </div>
                      );
                    })}
                    <AddNameForm compact placeholder={nextShelfName(c)} buttonLabel="Police" onAdd={(name) => setLocations(addShelf(locations, c.id, name))} />
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {ready && books.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              Bez umístění
              <span className="tabular-nums text-[10px] px-1.5 rounded-full bg-slate-800 text-slate-400">{unplaced.length}</span>
            </h2>
            {unplaced.length === 0 ? (
              <p className="text-xs text-emerald-400/80">Všechny knihy mají své místo.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                {unplaced.map((b) => (
                  <BookSpine key={b.id} book={b} onOpen={() => setOpenBookId(b.id)} />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Pick a book to put on a shelf */}
      <Modal open={Boolean(picker)} onClose={() => setPickerShelf(null)} label="Přidat knihu na polici">
        {picker && (
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-50 truncate">
                Na polici <span className="text-amber-200">{picker.bookcase.name} → {picker.shelf.name}</span>
              </h2>
              <button aria-label="Zavřít" onClick={() => setPickerShelf(null)} className="p-1.5 text-slate-400 hover:text-slate-50 rounded-full">
                <X size={18} />
              </button>
            </div>
            <input
              autoFocus
              type="search"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Hledat knihu…"
              aria-label="Hledat knihu"
              className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/80"
            />
            <ul className="flex flex-col divide-y divide-slate-800/80 max-h-[55dvh] overflow-y-auto -mx-2">
              {pickerBooks.length === 0 && <li className="px-2 py-4 text-xs text-slate-500 text-center">{books.length ? 'Žádná další kniha' : 'Knihovna je prázdná'}</li>}
              {pickerBooks.map((b) => {
                const where = formatLocation(locations, b.shelfId);
                return (
                  <li key={b.id}>
                    <button onClick={() => setShelf(b, picker.shelf.id)} className="w-full flex items-center gap-3 px-2 py-2 text-left rounded-lg hover:bg-slate-800/60">
                      <BookCover src={b.coverUrl} title={b.title} author={b.author} compact className="w-8 aspect-[2/3] rounded shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-slate-100 truncate">{b.title}</span>
                        <span className="block text-[11px] text-slate-500 truncate">{where ? `teď: ${where}` : b.author || 'bez umístění'}</span>
                      </span>
                      <Plus size={16} className="text-amber-300 shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Modal>

      {/* One book: move it or take it off the shelf */}
      <Modal open={Boolean(openBook)} onClose={() => setOpenBookId(null)} label={openBook?.title || 'Kniha'}>
        {openBook && (
          <div className="flex flex-col gap-4 p-5">
            <div className="flex gap-4 items-start">
              <BookCover src={openBook.coverUrl} title={openBook.title} author={openBook.author} className="w-20 aspect-[2/3] rounded-lg shrink-0 shadow-xl shadow-black/50" />
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-slate-50 leading-tight">{openBook.title}</h2>
                <p className="text-xs text-indigo-300 mt-1">{openBook.author || 'Neznámý autor'}</p>
                <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-200">
                  <MapPin size={12} /> {formatLocation(locations, openBook.shelfId) || <span className="text-slate-500">Bez umístění</span>}
                </p>
              </div>
              <button aria-label="Zavřít" onClick={() => setOpenBookId(null)} className="p-1.5 text-slate-400 hover:text-slate-50 rounded-full">
                <X size={18} />
              </button>
            </div>
            {shelfCount > 0 ? (
              <label className="flex flex-col gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
                Přesunout na
                <ShelfSelect locations={locations} value={openBook.shelfId} onChange={(id) => setShelf(openBook, id)} />
              </label>
            ) : (
              <p className="text-xs text-slate-500">Nejdřív založte regál a polici.</p>
            )}
            {findShelf(locations, openBook.shelfId) && (
              <button
                onClick={() => setShelf(openBook, null)}
                className="py-2 rounded-xl text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700"
              >
                Sundat z police
              </button>
            )}
          </div>
        )}
      </Modal>

      <Toaster />
    </div>
  );
}
