'use client';

import React, { useState } from 'react';
import { User } from 'lucide-react';

// Stable small hash so a book keeps "its" colors across renders and devices.
function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const COVER_PALETTES = [
  ['#312e81', '#6366f1'],
  ['#134e4a', '#14b8a6'],
  ['#7c2d12', '#f97316'],
  ['#4a044e', '#c026d3'],
  ['#1e3a8a', '#38bdf8'],
  ['#3f6212', '#a3e635'],
  ['#7f1d1d', '#f43f5e'],
  ['#422006', '#eab308'],
];

interface GeneratedCoverProps {
  title: string;
  author?: string | null;
  compact?: boolean;
}

// Typographic stand-in for a missing cover, styled like a real book jacket
// so a shelf with a few cover-less books still looks intentional.
function GeneratedCover({ title, author, compact }: GeneratedCoverProps) {
  const [from, to] = COVER_PALETTES[hashString(title || 'kniha') % COVER_PALETTES.length];
  return (
    <div
      data-testid="cover-placeholder"
      className="relative w-full h-full flex flex-col gap-2 p-[10%] pl-[14%] text-left overflow-hidden"
      style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}
    >
      {/* spine shading + a subtle ornament */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[7%] bg-black/25" />
      <span aria-hidden className="absolute -right-[20%] -bottom-[12%] w-[70%] aspect-square rounded-full border border-white/15" />
      <span
        className={`relative font-serif font-semibold leading-tight text-white drop-shadow line-clamp-4 ${
          compact ? 'text-[10px]' : 'text-sm'
        }`}
      >
        {title || 'Bez názvu'}
      </span>
      {author && !compact && (
        <>
          <span aria-hidden className="relative h-px w-8 bg-white/40" />
          <span className="relative text-[10px] uppercase tracking-wider text-white/75 line-clamp-2">{author}</span>
        </>
      )}
    </div>
  );
}

interface BookCoverProps {
  src?: string | null;
  title: string;
  author?: string | null;
  className?: string;
  imgClassName?: string;
  compact?: boolean;
}

// Catalog "no cover" placeholders (Knihovny.cz: 65×80) load fine, so they are
// recognized by size and swapped for the generated cover.
const MIN_REAL_COVER_WIDTH = 80;

// Cover image that fades in over a shimmer while loading and degrades to a
// generated cover when the URL is missing, broken or a catalog placeholder.
export function BookCover({ src, title, author, className = '', imgClassName = '', compact = false }: BookCoverProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const loaded = loadedSrc === src;

  return (
    <div className={`relative overflow-hidden bg-slate-800/60 ${className}`}>
      {showImage ? (
        <>
          {!loaded && <div aria-hidden className="absolute inset-0 skeleton animate-shimmer" />}
          <img
            src={src || undefined}
            alt={title}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth > 0 && img.naturalWidth < MIN_REAL_COVER_WIDTH) setFailedSrc(src || null);
              else setLoadedSrc(src || null);
            }}
            onError={() => setFailedSrc(src || null)}
            className={`w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
          />
        </>
      ) : (
        <GeneratedCover title={title} author={author} compact={compact} />
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

interface AuthorAvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
}

export function AuthorAvatar({ src, name, size = 28 }: AuthorAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const label = initials(name || '');
  const [from, to] = COVER_PALETTES[hashString(name || '') % COVER_PALETTES.length];

  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden border border-white/10 text-white/90 font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.36)),
        background: showImage ? undefined : `linear-gradient(135deg, ${from}, ${to})`,
      }}
    >
      {showImage ? (
        <>
          {loadedSrc !== src && <span aria-hidden className="absolute inset-0 skeleton animate-shimmer" />}
          <img
            src={src || undefined}
            alt={name || 'Autor'}
            onLoad={() => setLoadedSrc(src || null)}
            onError={() => setFailedSrc(src || null)}
            className={`w-full h-full object-cover object-top transition-opacity duration-500 ${
              loadedSrc === src ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </>
      ) : label ? (
        <span data-testid="author-placeholder">{label}</span>
      ) : (
        <User size={Math.round(size * 0.55)} data-testid="author-placeholder" />
      )}
    </span>
  );
}
