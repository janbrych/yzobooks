// Client-side lookup of a book's cover and its author's portrait from public
// sources. Runs in the browser so it works the same with the API backend and
// in the static GitHub Pages export.

import { cleanAuthorName, normalizeISBNInput } from '@/lib/scanner';

// Catalog cover services answer a missing cover with a tiny placeholder
// instead of an error (Knihovny.cz: a 65×80 "no cover" PNG, Open Library
// without ?default=false: a 1×1 GIF), so a loaded image is only accepted as a
// real cover/portrait above this size.
const MIN_IMAGE_WIDTH = 80;
const MIN_IMAGE_HEIGHT = 100;
const PROBE_TIMEOUT_MS = 8000;

export function probeImage(url: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
    function finish(ok: boolean) {
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    }
    img.onload = () => finish(img.naturalWidth >= MIN_IMAGE_WIDTH && img.naturalHeight >= MIN_IMAGE_HEIGHT);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

async function firstLoadable(candidates: string[]): Promise<string | null> {
  for (const url of candidates) {
    if (await probeImage(url)) return url;
  }
  return null;
}

export function coverCandidates(isbn: string): string[] {
  const code = normalizeISBNInput(isbn);
  if (!code) return [];
  return [
    `https://www.knihovny.cz/Cover/Show?isbn=${encodeURIComponent(code)}&size=large`,
    `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(code)}-L.jpg?default=false`,
  ];
}

// Prefer a cover the catalog lookup already returned, then ISBN-based cover
// services. A photo taken by the camera (data: URL) is only a last resort.
export async function findCoverUrl(isbn: string, currentCoverUrl?: string): Promise<string | null> {
  const current = currentCoverUrl && /^https?:/i.test(currentCoverUrl) ? [currentCoverUrl] : [];
  return firstLoadable([...current, ...coverCandidates(isbn)]);
}

// Only the first author is pictured: "Karel Čapek, Josef Čapek" → "Karel Čapek".
export function primaryAuthorName(author: string): string {
  if (!author) return '';
  const cleaned = cleanAuthorName(author.split(/;|\s+a\s+|\s+&\s+/)[0].trim());
  // cleanAuthorName already swapped a "Surname, Given" pair; any comma left
  // separates further authors.
  return cleaned.split(',')[0].trim();
}

async function wikipediaPortrait(lang: string, name: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, '_'))}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.type !== 'standard') return null; // disambiguation / missing page
    return data?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

async function openLibraryPortrait(name: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(name)}&limit=1&fields=key`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const key = data?.docs?.[0]?.key;
    if (!key) return null;
    return `https://covers.openlibrary.org/a/olid/${encodeURIComponent(key)}-M.jpg?default=false`;
  } catch {
    return null;
  }
}

export async function findAuthorPhotoUrl(author: string): Promise<string | null> {
  const name = primaryAuthorName(author);
  if (name.length < 3) return null;

  for (const lookup of [() => wikipediaPortrait('cs', name), () => wikipediaPortrait('en', name), () => openLibraryPortrait(name)]) {
    const url = await lookup();
    if (url && (await probeImage(url))) return url;
  }
  return null;
}
