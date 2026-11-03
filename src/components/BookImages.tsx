'use client';

import React, { useState } from 'react';
import { BookPlus, User } from 'lucide-react';

interface BookCoverProps {
  src?: string | null;
  title: string;
  className?: string;
  imgClassName?: string;
  showTitle?: boolean;
}

// Cover image that degrades to a titled placeholder when the URL is missing
// or fails to load (dead links, offline, a service that removed the cover).
export function BookCover({ src, title, className = '', imgClassName = '', showTitle = true }: BookCoverProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;

  return (
    <div className={`relative overflow-hidden bg-slate-800/60 flex items-center justify-center ${className}`}>
      {showImage ? (
        <img
          src={src || undefined}
          alt={title}
          onError={() => setFailedSrc(src || null)}
          className={`w-full h-full object-cover ${imgClassName}`}
        />
      ) : (
        <div
          data-testid="cover-placeholder"
          className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-2 text-center bg-gradient-to-br from-slate-800 to-slate-900"
        >
          <BookPlus size={32} className="mb-2 opacity-50" />
          {showTitle && <span className="text-xs font-medium line-clamp-3">{title || 'Bez obálky'}</span>}
        </div>
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
  const showImage = Boolean(src) && failedSrc !== src;
  const label = initials(name || '');

  return (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden bg-slate-800 border border-slate-700 text-slate-400 font-semibold"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)) }}
    >
      {showImage ? (
        <img
          src={src || undefined}
          alt={name || 'Autor'}
          onError={() => setFailedSrc(src || null)}
          className="w-full h-full object-cover object-top"
        />
      ) : label ? (
        <span data-testid="author-placeholder">{label}</span>
      ) : (
        <User size={Math.round(size * 0.55)} data-testid="author-placeholder" />
      )}
    </span>
  );
}
