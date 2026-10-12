'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { UserBook } from '@/types';
import { User, LogOut, Download, Moon, Sun, Lock, ShieldCheck } from 'lucide-react';

interface ProfileViewProps {
  userBooks: UserBook[];
  onOpenAuth: () => void;
}

export default function ProfileView({ userBooks, onOpenAuth }: ProfileViewProps) {
  const { user, logout, isDemo } = useAuth();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (typeof document !== 'undefined') {
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const handleExportData = () => {
    const exportData = userBooks.map((ub) => ({
      title: ub.book?.title,
      authors: ub.book?.authors?.join(', '),
      isbn13: ub.book?.isbn13,
      isbn10: ub.book?.isbn10,
      genres: ub.book?.genres?.join(', '),
      page_count: ub.book?.page_count,
      status: ub.status,
      rating: ub.rating,
      favorite: ub.favorite,
      notes: ub.notes,
      date_added: ub.date_added,
      date_finished: ub.date_finished,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `my-library-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Account & Settings</h1>
        <p className="text-xs text-muted-foreground">
          Manage your account credentials, preferences, and data privacy.
        </p>
      </div>

      {/* Profile Card */}
      <div className="bg-card border border-border p-5 rounded-2xl flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg border border-primary/20">
            {user?.display_name?.[0]?.toUpperCase() || <User className="w-6 h-6" />}
          </div>
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-foreground">
              {user?.display_name || 'Guest Reader'}
            </h2>
            <p className="text-xs text-muted-foreground">{user?.email || 'demo@library.app'}</p>
          </div>
        </div>

        {isDemo && (
          <button
            onClick={onOpenAuth}
            className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:opacity-90 transition"
          >
            Sign In
          </button>
        )}
      </div>

      {/* Preferences Section */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/60 shadow-sm">
        {/* Appearance Theme Toggle */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs">
            {theme === 'dark' ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
            <div>
              <p className="font-semibold">Appearance</p>
              <p className="text-[11px] text-muted-foreground">Switch between light and dark themes</p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-xs font-medium rounded-xl transition"
          >
            {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
          </button>
        </div>

        {/* Data Export */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs">
            <Download className="w-4 h-4 text-blue-400" />
            <div>
              <p className="font-semibold">Export Library Data</p>
              <p className="text-[11px] text-muted-foreground">Download JSON backup of your books & notes</p>
            </div>
          </div>
          <button
            onClick={handleExportData}
            className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-xs font-medium rounded-xl transition"
          >
            Export
          </button>
        </div>

        {/* Privacy Note */}
        <div className="p-4 flex items-center gap-3 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Your personal library, reading statuses, and notes are 100% private and encrypted.
          </p>
        </div>
      </div>

      {/* Logout Action */}
      {!isDemo && (
        <div className="pt-2">
          <button
            onClick={() => logout()}
            className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-semibold text-xs rounded-2xl flex items-center justify-center gap-2 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
