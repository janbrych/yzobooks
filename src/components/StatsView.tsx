'use client';

import React from 'react';
import { UserBook } from '@/types';
import { BookOpen, CheckCircle, Clock, Star, Award, Layers } from 'lucide-react';

export default function StatsView({ userBooks }: { userBooks: UserBook[] }) {
  const totalBooks = userBooks.length;
  const readBooks = userBooks.filter((ub) => ub.status === 'read');
  const readingBooks = userBooks.filter((ub) => ub.status === 'reading');
  const wantToReadBooks = userBooks.filter((ub) => ub.status === 'want_to_read');
  const favoriteBooks = userBooks.filter((ub) => ub.favorite);

  const totalPagesRead = readBooks.reduce(
    (acc, ub) => acc + (ub.book?.page_count || 250),
    0
  );

  const ratedBooks = userBooks.filter((ub) => ub.rating && ub.rating > 0);
  const avgRating = ratedBooks.length
    ? (
        ratedBooks.reduce((acc, ub) => acc + (ub.rating || 0), 0) /
        ratedBooks.length
      ).toFixed(1)
    : '0.0';

  const currentYear = new Date().getFullYear();
  const readThisYear = readBooks.filter((ub) => {
    if (!ub.date_finished) return false;
    return new Date(ub.date_finished).getFullYear() === currentYear;
  }).length;

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Reading Stats</h1>
        <p className="text-xs text-muted-foreground">
          Overview of your reading journey and bookshelf highlights.
        </p>
      </div>

      {/* Main Highlights Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border p-4 rounded-2xl flex flex-col space-y-1 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-1">
            <BookOpen className="w-4 h-4" />
          </div>
          <span className="text-2xl font-extrabold">{totalBooks}</span>
          <span className="text-xs text-muted-foreground">Total Books</span>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl flex flex-col space-y-1 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-1">
            <CheckCircle className="w-4 h-4" />
          </div>
          <span className="text-2xl font-extrabold">{readBooks.length}</span>
          <span className="text-xs text-muted-foreground">Books Read</span>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl flex flex-col space-y-1 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center mb-1">
            <Layers className="w-4 h-4" />
          </div>
          <span className="text-2xl font-extrabold">{totalPagesRead.toLocaleString()}</span>
          <span className="text-xs text-muted-foreground">Est. Pages Read</span>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl flex flex-col space-y-1 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-1">
            <Award className="w-4 h-4" />
          </div>
          <span className="text-2xl font-extrabold">{readThisYear}</span>
          <span className="text-xs text-muted-foreground">Read in {currentYear}</span>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Library Summary
        </h3>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-blue-400" /> Currently Reading
            </span>
            <span className="font-semibold">{readingBooks.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" /> Want to Read
            </span>
            <span className="font-semibold">{wantToReadBooks.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> Average Rating
            </span>
            <span className="font-semibold">{avgRating} / 5.0</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-2">
              <Award className="w-3.5 h-3.5 text-rose-400" /> Favorite Books
            </span>
            <span className="font-semibold">{favoriteBooks.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
