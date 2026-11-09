'use client';

import React, { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
  applyTheme,
  nextThemePreference,
  readThemePreference,
  subscribeToSystemTheme,
  writeThemePreference,
  type ThemePreference,
} from '@/lib/theme';

const LABELS: Record<ThemePreference, string> = {
  system: 'Vzhled: podle systému',
  light: 'Vzhled: světlý',
  dark: 'Vzhled: tmavý',
};

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** One small header button that cycles system → light → dark. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  // null until mounted: the server can't know the stored choice.
  const [pref, setPref] = useState<ThemePreference | null>(null);

  useEffect(() => {
    // Sync with the value the inline head script already applied.
    setPref(readThemePreference());
  }, []);

  useEffect(() => {
    if (pref === null) return;
    applyTheme(pref);
    if (pref !== 'system') return;
    return subscribeToSystemTheme(() => applyTheme('system'));
  }, [pref]);

  const current = pref ?? 'system';
  const next = nextThemePreference(current);
  const Icon = ICONS[current];

  return (
    <button
      type="button"
      onClick={() => {
        writeThemePreference(next);
        setPref(next);
      }}
      title={`${LABELS[current]} — přepnout`}
      aria-label={`${LABELS[current]}. Přepnout na: ${LABELS[next].replace('Vzhled: ', '')}`}
      className={className}
    >
      {/* Hidden until the stored choice is read, so the icon doesn't jump. */}
      <Icon size={18} className={pref === null ? 'opacity-0' : undefined} />
    </button>
  );
}
