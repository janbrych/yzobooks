'use client';

import React from 'react';
import type { Bookcase } from '@/lib/locations';

interface ShelfSelectProps {
  locations: Bookcase[];
  value: string | null | undefined;
  onChange: (shelfId: string | null) => void;
  id?: string;
  className?: string;
}

// One dropdown for "where does this book stand": shelves grouped by bookcase.
export function ShelfSelect({ locations, value, onChange, id, className = '' }: ShelfSelectProps) {
  const known = locations.some((c) => c.shelves.some((s) => s.id === value));
  return (
    <select
      id={id}
      value={known ? value || '' : ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={`w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500/80 focus:ring-4 focus:ring-indigo-500/10 ${className}`}
    >
      <option value="">Bez umístění</option>
      {locations
        .filter((c) => c.shelves.length > 0)
        .map((c) => (
          <optgroup key={c.id} label={c.name}>
            {c.shelves.map((s) => (
              <option key={s.id} value={s.id}>
                {c.name} → {s.name}
              </option>
            ))}
          </optgroup>
        ))}
    </select>
  );
}
