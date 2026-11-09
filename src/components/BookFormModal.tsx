'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save, Search, RefreshCw, Star, ScanBarcode, CheckCircle2, AlertTriangle, ImageIcon, ArrowUpDown } from 'lucide-react';
import { processImageOrQuery, lookupBooksByISBN, validateISBNInput, BookSearchResult } from '@/lib/scanner';
import { findAuthorPhotoUrl, findCoverUrl } from '@/lib/bookMedia';
import { BookCover, AuthorAvatar } from '@/components/BookImages';
import { ReadToggle } from '@/components/ReadToggle';
import { Modal } from '@/components/Modal';
import { toast } from '@/lib/toast';

export interface BookFormData {
  id?: string;
  title: string;
  author: string;
  genre: string;
  publisher: string;
  publishedYear: string;
  edition: string;
  pageCount: string;
  isbn: string;
  description: string;
  coverUrl: string;
  authorPhotoUrl: string;
  status: string;
  rating: number;
}

interface BookFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (formData: Record<string, unknown>) => Promise<void>;
  initialData?: BookFormInitialData | null;
}

export type BookFormInitialData = Partial<BookFormData> & {
  // Other catalog titles sharing the code (e.g. a box-set ISBN).
  alternatives?: BookSearchResult[];
  // Message about the recognition shown next to the ISBN field.
  notice?: string;
};

const EMPTY_FORM: BookFormData = {
  title: '',
  author: '',
  genre: '',
  publisher: '',
  publishedYear: '',
  edition: '',
  pageCount: '',
  isbn: '',
  description: '',
  coverUrl: '',
  authorPhotoUrl: '',
  status: 'UNREAD',
  rating: 0,
};

const INPUT_CLASS =
  'w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500';

// Knihovny.cz hands out a cover URL for every ISBN, even ones it has no cover
// for (it then serves a small "no cover" placeholder).
const isCatalogPlaceholderCover = (url: string) => url.includes('knihovny.cz/Cover/Show');

export function BookFormModal({ isOpen, onClose, onSave, initialData }: BookFormModalProps) {
  const [formData, setFormData] = useState<BookFormData>(EMPTY_FORM);

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLookingUpCode, setIsLookingUpCode] = useState(false);
  const [codeLookupMessage, setCodeLookupMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isLoadingCover, setIsLoadingCover] = useState(false);
  const [isLoadingAuthorPhoto, setIsLoadingAuthorPhoto] = useState(false);
  const [alternatives, setAlternatives] = useState<BookSearchResult[]>([]);

  // Bumped whenever a new book is loaded into the form, so image lookups
  // still in flight for the previous one don't overwrite the new data.
  const mediaRequestRef = useRef(0);
  // Code whose catalog record currently fills the form (null when the data
  // was typed by hand or belongs to a saved book). Used to clear that stale
  // record when a different code turns out to be unknown.
  const catalogCodeRef = useRef<string | null>(null);

  // Latest form state and the image lookup in flight, so saving can wait for
  // a cover that is still being found instead of storing a title-only book.
  const formDataRef = useRef(formData);
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);
  const mediaPromiseRef = useRef<Promise<void>>(Promise.resolve());

  const runMediaLookup = useCallback(
    async (book: Pick<BookFormData, 'isbn' | 'author' | 'coverUrl' | 'authorPhotoUrl'>, opts: { cover: boolean; author: boolean }) => {
      const requestId = ++mediaRequestRef.current;
      const isCurrent = () => requestId === mediaRequestRef.current;

      const coverTask = opts.cover
        ? (async () => {
            setIsLoadingCover(true);
            const found = await findCoverUrl(book.isbn, book.coverUrl);
            if (!isCurrent()) return;
            if (found) {
              setFormData((prev) => ({ ...prev, coverUrl: found }));
            } else if (isCatalogPlaceholderCover(book.coverUrl)) {
              setFormData((prev) => ({ ...prev, coverUrl: '' }));
            }
            setIsLoadingCover(false);
          })()
        : Promise.resolve();

      const authorTask =
        opts.author && book.author
          ? (async () => {
              setIsLoadingAuthorPhoto(true);
              const found = await findAuthorPhotoUrl(book.author);
              if (!isCurrent()) return;
              setFormData((prev) => ({ ...prev, authorPhotoUrl: found || '' }));
              setIsLoadingAuthorPhoto(false);
            })()
          : Promise.resolve();

      await Promise.all([coverTask, authorTask]);
    },
    []
  );

  const loadMedia = useCallback(
    (book: Pick<BookFormData, 'isbn' | 'author' | 'coverUrl' | 'authorPhotoUrl'>, opts: { cover: boolean; author: boolean }) => {
      const run = runMediaLookup(book, opts);
      mediaPromiseRef.current = run;
      return run;
    },
    [runMediaLookup]
  );

  useEffect(() => {
    if (!isOpen) return;
    mediaRequestRef.current++;
    setIsLoadingCover(false);
    setIsLoadingAuthorPhoto(false);
    setCodeLookupMessage(initialData?.notice ? { ok: false, text: initialData.notice } : null);
    setAlternatives(initialData?.alternatives || []);
    setSearchQuery('');

    if (!initialData) {
      setFormData(EMPTY_FORM);
      catalogCodeRef.current = null;
      return;
    }

    const data: BookFormData = {
      id: initialData.id,
      title: initialData.title || '',
      author: initialData.author || '',
      genre: initialData.genre || '',
      publisher: initialData.publisher || '',
      publishedYear: initialData.publishedYear || '',
      edition: initialData.edition || '',
      pageCount: initialData.pageCount ? String(initialData.pageCount) : '',
      isbn: initialData.isbn || '',
      description: initialData.description || '',
      coverUrl: initialData.coverUrl || '',
      authorPhotoUrl: initialData.authorPhotoUrl || '',
      status: initialData.status || 'UNREAD',
      rating: initialData.rating || 0,
    };
    setFormData(data);
    catalogCodeRef.current = !data.id && data.isbn && data.title ? data.isbn : null;

    // Freshly recognized books (and older saved ones) usually come without an
    // internet cover or author portrait — look those up in the background.
    const needsCover = !data.coverUrl || !/^https?:/i.test(data.coverUrl) || isCatalogPlaceholderCover(data.coverUrl);
    const needsAuthorPhoto = !data.authorPhotoUrl && Boolean(data.author);
    if ((needsCover && data.isbn) || needsAuthorPhoto) {
      loadMedia(data, { cover: needsCover && Boolean(data.isbn), author: needsAuthorPhoto });
    }
  }, [initialData, isOpen, loadMedia]);

  const codeValidation = validateISBNInput(formData.isbn);

  const applySearchResult = (resData: BookSearchResult) => {
    const next: BookFormData = {
      ...formData,
      title: resData.title || formData.title,
      author: resData.author || formData.author,
      genre: resData.genre || formData.genre,
      publisher: resData.publisher || formData.publisher,
      publishedYear: resData.publishedYear || formData.publishedYear,
      edition: resData.edition || formData.edition,
      pageCount: resData.pageCount ? String(resData.pageCount) : formData.pageCount,
      isbn: resData.isbn || formData.isbn,
      description: resData.description || formData.description,
      coverUrl: resData.coverUrl || formData.coverUrl,
      authorPhotoUrl: resData.author && resData.author !== formData.author ? '' : formData.authorPhotoUrl,
    };
    setFormData(next);
    loadMedia(next, { cover: true, author: !next.authorPhotoUrl });
  };

  const handleSearchOnline = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);

    try {
      // Try backend API first
      const res = await fetch('/api/books/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        if (data.result) {
          applySearchResult(data.result);
          setIsSearching(false);
          return;
        }
      }

      // Fallback to direct client-side search (for static export on GitHub Pages)
      const clientResult = await processImageOrQuery({ query: searchQuery });
      if (clientResult && clientResult.result) {
        applySearchResult(clientResult.result);
      } else {
        toast('K tomuto dotazu jsme nic nenašli.', { tone: 'warning' });
      }
    } catch (err) {
      console.error(err);
      toast('Hledání se nezdařilo. Zkuste to prosím znovu.', { tone: 'error' });
    } finally {
      setIsSearching(false);
    }
  };

  // Replace the bibliographic data with a catalog record. The previous
  // (mis)recognition is replaced wholesale — keeping stale fields from the
  // wrong book would be worse than leaving them empty.
  const applyCatalogBook = (found: BookSearchResult, code: string) => {
    const next: BookFormData = {
      ...formData,
      title: found.title,
      author: found.author,
      genre: found.genre,
      publisher: found.publisher,
      publishedYear: found.publishedYear,
      edition: found.edition,
      pageCount: found.pageCount ? String(found.pageCount) : '',
      isbn: found.isbn || code,
      description: found.description,
      coverUrl: found.coverUrl || '',
      authorPhotoUrl: '',
    };
    setFormData(next);
    catalogCodeRef.current = next.isbn;
    loadMedia(next, { cover: true, author: true });
  };

  // Re-identify the book from a manually typed ISBN/EAN.
  const handleLookupByCode = async () => {
    if (!codeValidation?.valid) return;
    setIsLookingUpCode(true);
    setCodeLookupMessage(null);
    setAlternatives([]);
    try {
      const results = await lookupBooksByISBN(codeValidation.code);
      const [found] = results;
      if (!found) {
        // Data looked up for another code describes a different book — drop
        // it. Hand-typed fields and saved books are kept as they are.
        const staleCatalogData = catalogCodeRef.current !== null && catalogCodeRef.current !== codeValidation.code;
        const next: BookFormData = staleCatalogData
          ? { ...EMPTY_FORM, id: formData.id, status: formData.status, rating: formData.rating, isbn: codeValidation.code }
          : { ...formData, isbn: codeValidation.code };
        catalogCodeRef.current = null;
        setFormData(next);
        setCodeLookupMessage({ ok: false, text: 'Pro tento kód jsme v katalozích nic nenašli. Doplňte prosím údaje ručně.' });
        loadMedia({ ...next, coverUrl: staleCatalogData ? '' : next.coverUrl }, { cover: true, author: false });
        return;
      }
      applyCatalogBook(found, codeValidation.code);
      setAlternatives(results.length > 1 ? results : []);
      setCodeLookupMessage({ ok: true, text: `Načteno: ${found.title || 'kniha'}` });
    } catch (err) {
      console.error(err);
      setCodeLookupMessage({ ok: false, text: 'Vyhledání se nezdařilo. Zkuste to prosím znovu.' });
    } finally {
      setIsLookingUpCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast('Doplňte prosím název knihy.', { tone: 'warning' });
      document.getElementById('title-input')?.focus();
      return;
    }

    setIsSaving(true);
    try {
      if (isLoadingCover || isLoadingAuthorPhoto) {
        await Promise.race([mediaPromiseRef.current, new Promise((resolve) => setTimeout(resolve, 6000))]);
        // let the state updates from the finished lookup land
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const latest = formDataRef.current;
      await onSave({
        ...latest,
        isbn: codeValidation?.valid ? codeValidation.code : latest.isbn.trim(),
        pageCount: latest.pageCount ? parseInt(latest.pageCount, 10) : null,
        rating: latest.rating || null,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      label={initialData?.id ? 'Upravit knihu' : 'Přidat novou knihu'}
      dismissOnBackdrop={false}
    >
      <div className="p-5 pt-2 sm:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-lg font-bold text-slate-100">
            {initialData?.id ? 'Upravit knihu' : 'Přidat novou knihu'}
          </h2>
          <button onClick={onClose} aria-label="Zavřít" className="p-1.5 text-slate-400 hover:text-slate-50 rounded-full hover:bg-slate-800">
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

        {/* Result preview: what the book will look like in the library */}
        <section aria-label="Náhled knihy" className="flex gap-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
          <div className="relative w-24 sm:w-28 shrink-0">
            <BookCover
              key={formData.coverUrl || 'none'}
              src={formData.coverUrl}
              title={formData.title}
              author={formData.author}
              compact
              className="aspect-[2/3] w-full rounded-xl ring-1 ring-white/10 shadow-xl shadow-black/40 animate-rise"
            />
            {isLoadingCover && (
              <div className="absolute inset-0 rounded-xl skeleton animate-shimmer flex items-end justify-center pb-2 text-[10px] font-medium text-slate-200">
                Hledám obálku…
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <h3 className="font-bold text-base text-slate-50 leading-tight line-clamp-3">{formData.title || 'Bez názvu'}</h3>

            <div className="flex items-center gap-2 min-w-0">
              <div className="relative">
                <AuthorAvatar src={formData.authorPhotoUrl} name={formData.author} size={36} />
                {isLoadingAuthorPhoto && (
                  <span className="absolute inset-0 rounded-full bg-slate-950/60 flex items-center justify-center">
                    <RefreshCw size={12} className="animate-spin text-slate-300" />
                  </span>
                )}
              </div>
              <span className="text-sm font-medium text-indigo-300 line-clamp-2">{formData.author || 'Neznámý autor'}</span>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
              {formData.publishedYear && (
                <>
                  <dt>Rok</dt>
                  <dd className="text-slate-200">{formData.publishedYear}</dd>
                </>
              )}
              {formData.publisher && (
                <>
                  <dt>Nakladatel</dt>
                  <dd className="text-slate-200 truncate">{formData.publisher}</dd>
                </>
              )}
              {formData.pageCount && (
                <>
                  <dt>Stran</dt>
                  <dd className="text-slate-200">{formData.pageCount}</dd>
                </>
              )}
              {formData.isbn && (
                <>
                  <dt>ISBN</dt>
                  <dd className="text-slate-200 font-mono">{formData.isbn}</dd>
                </>
              )}
            </dl>

            <div className="mt-auto pt-1">
              <ReadToggle
                checked={formData.status === 'READ'}
                onChange={(read) => setFormData({ ...formData, status: read ? 'READ' : 'UNREAD' })}
              />
            </div>
          </div>
        </section>

        {alternatives.length > 1 && (
          <section aria-label="Další tituly se stejným kódem" className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-3">
            <p className="text-[11px] text-amber-300 mb-2">
              Pod tímto kódem je v katalogu víc titulů (např. ISBN celé sady). Vyberte ten správný:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {alternatives.map((alt, idx) => {
                const selected = alt.title === formData.title;
                return (
                  <button
                    type="button"
                    key={`${alt.title}-${idx}`}
                    aria-pressed={selected}
                    onClick={() => applyCatalogBook(alt, alt.isbn)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                      selected
                        ? 'bg-amber-500 border-amber-400 text-slate-950 font-semibold'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-amber-500'
                    }`}
                  >
                    {alt.title}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Manual code entry — the fix for a wrongly recognized book */}
          <div>
            <label htmlFor="isbn-input" className="block text-xs font-medium text-slate-400 mb-1">
              ISBN / EAN (kód pod čárovým kódem)
            </label>
            <div className="flex gap-2">
              <input
                id="isbn-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="např. 978-80-7483-208-6"
                value={formData.isbn}
                onChange={(e) => {
                  setFormData({ ...formData, isbn: e.target.value });
                  setCodeLookupMessage(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLookupByCode();
                  }
                }}
                aria-invalid={codeValidation ? !codeValidation.valid : undefined}
                aria-describedby="isbn-hint"
                className={`${INPUT_CLASS} font-mono ${
                  codeValidation && !codeValidation.valid ? 'border-amber-600/70 focus:border-amber-500' : ''
                }`}
              />
              <button
                type="button"
                onClick={handleLookupByCode}
                disabled={!codeValidation?.valid || isLookingUpCode}
                title="Znovu vyhledat knihu podle zadaného kódu"
                className="py-2 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors"
              >
                {isLookingUpCode ? <RefreshCw size={14} className="animate-spin" /> : <ScanBarcode size={14} />}
                Vyhledat
              </button>
            </div>
            <div id="isbn-hint" className="mt-1 min-h-4 text-[11px]">
              {codeLookupMessage ? (
                <span className={`flex items-center gap-1 ${codeLookupMessage.ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {codeLookupMessage.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {codeLookupMessage.text}
                </span>
              ) : codeValidation ? (
                <span className={`flex items-center gap-1 ${codeValidation.valid ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {codeValidation.valid ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {codeValidation.message}
                </span>
              ) : (
                <span className="text-slate-500">Rozpoznala se kniha špatně? Opište kód a klikněte na Vyhledat.</span>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="title-input" className="block text-xs font-medium text-slate-400 mb-1">Název knihy *</label>
            <input
              id="title-input"
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="author-input" className="block text-xs font-medium text-slate-400">Autor</label>
                {/* Covers often print the author above the title, so a
                    misread puts them the wrong way round — one tap fixes it. */}
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...formData, title: formData.author, author: formData.title, authorPhotoUrl: '' };
                    setFormData(next);
                    if (next.author) loadMedia(next, { cover: false, author: true });
                  }}
                  disabled={!formData.title && !formData.author}
                  title="Prohodit název a autora"
                  className="inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 disabled:text-slate-600"
                >
                  <ArrowUpDown size={11} /> Prohodit s názvem
                </button>
              </div>
              <input
                id="author-input"
                type="text"
                value={formData.author}
                // The portrait belongs to the previous name; a corrected
                // author gets a fresh lookup once the field is left.
                onChange={(e) => setFormData({ ...formData, author: e.target.value, authorPhotoUrl: '' })}
                onBlur={() => {
                  if (formData.author && !formData.authorPhotoUrl) {
                    loadMedia(formData, { cover: false, author: true });
                  }
                }}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="genre-input" className="block text-xs font-medium text-slate-400 mb-1">Žánr</label>
              <input
                id="genre-input"
                type="text"
                value={formData.genre}
                onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="publisher-input" className="block text-xs font-medium text-slate-400 mb-1">Nakladatelství</label>
              <input
                id="publisher-input"
                type="text"
                value={formData.publisher}
                onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="publishedyear-input" className="block text-xs font-medium text-slate-400 mb-1">Rok / Vydání</label>
              <input
                id="publishedyear-input"
                type="text"
                value={formData.publishedYear}
                onChange={(e) => setFormData({ ...formData, publishedYear: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="edition-input" className="block text-xs font-medium text-slate-400 mb-1">Edice</label>
              <input
                id="edition-input"
                type="text"
                value={formData.edition}
                onChange={(e) => setFormData({ ...formData, edition: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pagecount-input" className="block text-xs font-medium text-slate-400 mb-1">Počet stran</label>
              <input
                id="pagecount-input"
                type="number"
                value={formData.pageCount}
                onChange={(e) => setFormData({ ...formData, pageCount: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="status-input" className="block text-xs font-medium text-slate-400 mb-1">Stav čtení</label>
              <select
                id="status-input"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="UNREAD">Chci si přečíst</option>
                <option value="READING">Právě čtu</option>
                <option value="READ">Přečteno</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Hodnocení</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  aria-label={`${star} z 5`}
                  onClick={() => setFormData({ ...formData, rating: formData.rating === star ? 0 : star })}
                  className="p-1 text-amber-400 focus:outline-none"
                >
                  <Star size={20} fill={formData.rating >= star ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cover-input" className="block text-xs font-medium text-slate-400 mb-1">URL obálky</label>
              <input
                id="cover-input"
                type="text"
                value={formData.coverUrl.startsWith('data:') ? '' : formData.coverUrl}
                placeholder={formData.coverUrl.startsWith('data:') ? 'Použita vlastní fotka' : ''}
                onChange={(e) => setFormData({ ...formData, coverUrl: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor="author-photo-input" className="block text-xs font-medium text-slate-400 mb-1">URL fotky autora</label>
              <input
                id="author-photo-input"
                type="text"
                value={formData.authorPhotoUrl}
                onChange={(e) => setFormData({ ...formData, authorPhotoUrl: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadMedia({ ...formData, coverUrl: '' }, { cover: Boolean(formData.isbn), author: Boolean(formData.author) })}
            disabled={(!formData.isbn && !formData.author) || isLoadingCover || isLoadingAuthorPhoto}
            className="-mt-2 self-start text-[11px] text-indigo-400 hover:text-indigo-300 disabled:text-slate-600 flex items-center gap-1"
          >
            <ImageIcon size={12} /> Znovu dohledat obálku a fotku autora
          </button>

          <div>
            <label htmlFor="description-input" className="block text-xs font-medium text-slate-400 mb-1">Popis / Poznámka</label>
            <textarea
              id="description-input"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={INPUT_CLASS}
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
    </Modal>
  );
}
