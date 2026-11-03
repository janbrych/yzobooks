'use client';

import React, { useSyncExternalStore } from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';
import { dismissToast, getToasts, subscribeToasts, type Toast, type ToastTone } from '@/lib/toast';

const EMPTY: Toast[] = [];

const TONES: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: 'text-emerald-400' },
  info: { icon: Info, className: 'text-indigo-300' },
  warning: { icon: AlertTriangle, className: 'text-amber-400' },
  error: { icon: XCircle, className: 'text-red-400' },
};

export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, () => EMPTY);

  return (
    <div
      aria-live="polite"
      className="fixed z-[60] inset-x-0 bottom-28 flex flex-col items-center gap-2 px-4 pointer-events-none"
    >
      {toasts.map((t) => {
        const { icon: Icon, className } = TONES[t.tone];
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto w-full max-w-sm flex items-center gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/95 backdrop-blur-lg px-4 py-3 shadow-2xl shadow-black/40 animate-toast-in"
          >
            <Icon size={18} className={`shrink-0 ${className}`} />
            <span className="flex-1 text-sm text-slate-100">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onClick();
                  dismissToast(t.id);
                }}
                className="text-sm font-semibold text-indigo-300 hover:text-indigo-200 px-1"
              >
                {t.action.label}
              </button>
            )}
            <button
              aria-label="Zavřít oznámení"
              onClick={() => dismissToast(t.id)}
              className="p-1 -mr-1 text-slate-500 hover:text-slate-300"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
