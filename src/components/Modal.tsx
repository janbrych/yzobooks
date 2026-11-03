'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  label: string;
  // Forms keep their content when the backdrop is tapped by accident.
  dismissOnBackdrop?: boolean;
  className?: string;
}

const EXIT_MS = 220;

// Shared dialog shell: a bottom sheet on phones, a centered card on larger
// screens, with enter/exit animations, Escape to close and the page scroll
// locked underneath.
export function Modal({ open, onClose, children, label, dismissOnBackdrop = true, className = '' }: ModalProps) {
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return;
    }
    if (!rendered) return;
    setClosing(true);
    const timer = setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [open, rendered]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!rendered || typeof document === 'undefined') return null;

  // Portaled to <body> so transformed ancestors (animated cards) can't turn
  // the fixed overlay into one positioned inside them.
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-sm ${
        closing ? 'animate-backdrop-out' : 'animate-backdrop-in'
      }`}
      onMouseDown={(e) => {
        if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`relative w-full max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-black/50 ${
          closing ? 'animate-sheet-out' : 'animate-sheet-in'
        } ${className}`}
      >
        <div aria-hidden className="sm:hidden sticky top-0 z-10 flex justify-center pt-2 pb-1 bg-slate-900/90 backdrop-blur">
          <span className="h-1 w-10 rounded-full bg-slate-700" />
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
