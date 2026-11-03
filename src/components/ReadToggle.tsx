'use client';

import React from 'react';
import { Check } from 'lucide-react';

interface ReadToggleProps {
  checked: boolean;
  onChange: (read: boolean) => void;
  compact?: boolean;
}

// "Přečteno" switch shared by the book form and the library cards.
export function ReadToggle({ checked, onChange, compact = false }: ReadToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Přečteno"
      title={checked ? 'Označit jako nepřečtené' : 'Označit jako přečtené'}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      onTouchStart={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors ${
        compact ? 'p-1.5 backdrop-blur-md shadow-md' : 'py-1.5 pl-1.5 pr-3 text-xs'
      } ${
        checked
          ? 'bg-emerald-600/90 border-emerald-500 text-white'
          : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500'
      }`}
    >
      <span
        className={`flex items-center justify-center rounded-full w-5 h-5 ${
          checked ? 'bg-white text-emerald-600' : 'border border-slate-500'
        }`}
      >
        {checked && <Check size={13} strokeWidth={3} />}
      </span>
      {!compact && 'Přečteno'}
    </button>
  );
}
