// Loading and saving books the way the whole app does: the API when there is
// a server, localStorage otherwise (GitHub Pages / offline).

import { addOrUpdateLocalBook, getLocalBooks, type LocalBook } from '@/lib/localStorage';

export async function loadBooks(): Promise<LocalBook[]> {
  const res = await fetch('/api/books').catch(() => null);
  if (res && res.ok) {
    const data = await res.json().catch(() => ({}));
    if (Array.isArray(data.books)) return data.books;
  }
  return getLocalBooks();
}

export async function createBook(data: Partial<LocalBook>): Promise<LocalBook> {
  const res = await fetch('/api/books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => null);
  if (res && res.ok) {
    const saved = await res.json().catch(() => ({}));
    if (saved.book?.id) return saved.book;
  }
  return addOrUpdateLocalBook(data);
}

// Never brings back a book deleted in the meantime.
export async function updateBook(id: string, data: Partial<LocalBook>): Promise<void> {
  const res = await fetch(`/api/books/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => null);
  if (res && res.ok) return;
  if (getLocalBooks().some((b) => b.id === id)) addOrUpdateLocalBook({ ...data, id });
}
