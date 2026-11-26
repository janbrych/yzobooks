'use client';

import React from 'react';
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import type { SyncStatus } from '@/lib/cloud';

const LOOK: Record<SyncStatus, { icon: typeof Cloud; text: string; className: string }> = {
  off: { icon: CloudOff, text: 'Nesynchronizováno', className: 'text-slate-500' },
  syncing: { icon: RefreshCw, text: 'Ukládám do účtu…', className: 'text-indigo-300' },
  synced: { icon: Cloud, text: 'Uloženo v účtu', className: 'text-emerald-400' },
  offline: { icon: CloudOff, text: 'Offline: uloží se, až budeš online', className: 'text-amber-300' },
  error: { icon: TriangleAlert, text: 'Uložení selhalo, klepni pro nový pokus', className: 'text-red-400' },
};

// Where the library stands with the account, at a glance; tap to sync now.
export function SyncBadge({ status, lastSyncedAt, onRetry }: { status: SyncStatus; lastSyncedAt: number | null; onRetry: () => void }) {
  const { icon: Icon, text, className } = LOOK[status];
  const when = lastSyncedAt ? ` · ${new Date(lastSyncedAt).toLocaleTimeString('cs', { hour: '2-digit', minute: '2-digit' })}` : '';
  return (
    <button
      onClick={onRetry}
      title={`${text}${status === 'synced' ? when : ''}`}
      aria-label={text}
      className={`p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-colors ${className}`}
    >
      <Icon size={18} className={status === 'syncing' ? 'animate-spin' : ''} />
    </button>
  );
}
