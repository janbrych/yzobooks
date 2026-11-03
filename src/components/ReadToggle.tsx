'use client';

import React, { useState } from 'react';
import { Check } from 'lucide-react';

interface ReadToggleProps {
  checked: boolean;
  onChange: (read: boolean) => void;
  compact?: boolean;
}

const CONFETTI_COLORS = ['#6ee7b7', '#34d399', '#a7f3d0', '#10b981'];
const PARTICLES = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2;
  const distance = 26 + (i % 3) * 8;
  return {
    dx: `${Math.round(Math.cos(angle) * distance)}px`,
    dy: `${Math.round(Math.sin(angle) * distance)}px`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  };
});

// "Přečteno" switch shared by the book form and the library cards. Finishing
// a book deserves a little celebration: the check pops and a confetti burst
// flies out (skipped with prefers-reduced-motion).
export function ReadToggle({ checked, onChange, compact = false }: ReadToggleProps) {
  const [burst, setBurst] = useState(0);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Přečteno"
      title={checked ? 'Označit jako nepřečtené' : 'Označit jako přečtené'}
      onClick={(e) => {
        e.stopPropagation();
        if (!checked) setBurst((n) => n + 1);
        onChange(!checked);
      }}
      onTouchStart={(e) => e.stopPropagation()}
      className={`relative inline-flex items-center gap-1.5 rounded-full border font-medium transition-all duration-300 active:scale-90 ${
        compact ? 'p-1.5 backdrop-blur-md shadow-lg shadow-black/30' : 'py-1.5 pl-1.5 pr-3 text-xs'
      } ${
        checked
          ? 'bg-emerald-500/90 border-emerald-400 text-white shadow-emerald-500/30'
          : 'bg-slate-900/75 border-slate-600 text-slate-300 hover:text-white hover:border-slate-400'
      }`}
    >
      <span
        key={checked ? 'on' : 'off'}
        className={`flex items-center justify-center rounded-full w-5 h-5 transition-colors ${
          checked ? 'bg-white text-emerald-600 animate-pop' : 'border border-slate-400/80'
        }`}
      >
        {checked && <Check size={13} strokeWidth={3} />}
      </span>
      {!compact && 'Přečteno'}
      {burst > 0 && checked && (
        <span key={burst} aria-hidden className="absolute inset-0 pointer-events-none">
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="confetti-particle"
              style={{ background: p.color, ['--dx' as string]: p.dx, ['--dy' as string]: p.dy }}
            />
          ))}
        </span>
      )}
    </button>
  );
}
