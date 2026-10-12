'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { BookOpen, Sparkles, ArrowRight, Check } from 'lucide-react';

export default function AuthModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { login, isDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    try {
      await login(email);
      setSent(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-card text-card-foreground border border-border rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col items-center text-center space-y-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-500 flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Your Personal Bookshelf</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isDemo
              ? 'Enter your email to create an instant account and save your personal book library across sessions.'
              : 'Sign in or register with email magic link to sync your bookshelf across all your devices.'}
          </p>
        </div>

        {sent ? (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Check className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium">Welcome!</p>
            <p className="text-xs text-muted-foreground">Logged in as {email}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="reader@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:opacity-90 active:scale-[0.98] transition flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-border/50 text-center">
          <p className="text-[11px] text-muted-foreground">
            {isDemo ? '⚡ Offline-first demo mode active' : '🔐 Secure passwordless login'}
          </p>
        </div>
      </div>
    </div>
  );
}
