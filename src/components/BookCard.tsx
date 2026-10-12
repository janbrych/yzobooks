'use client';

import React from 'react';
import { Book, UserBook } from '@/types';
import { Heart, Star, BookOpen } from 'lucide-react';

interface BookCardProps {
  userBook: UserBook;
  onClick: () => void;
}

export default function BookCard({ userBook, onClick }: BookCardProps) {
  const book: Partial<Book> = userBook.book || {};

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer flex flex-col space-y-2 focus:outline-none"
    >
      {/* Book Cover Container */}
      <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-slate-900 border border-border/80 shadow-sm group-hover:shadow-md group-hover:scale-[1.02] transition-all duration-200">
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt={book.title || 'Book cover'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-muted-foreground bg-muted/40">
            <BookOpen className="w-8 h-8 opacity-40 mb-1" />
            <span className="text-[10px] font-medium line-clamp-2">{book.title}</span>
          </div>
        )}

        {/* Favorite Badge Indicator */}
        {userBook.favorite && (
          <div className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 backdrop-blur text-rose-500 shadow-sm">
            <Heart className="w-3.5 h-3.5 fill-current" />
          </div>
        )}

        {/* Rating Pill */}
        {userBook.rating && (
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur text-amber-400 flex items-center gap-0.5 text-[10px] font-bold">
            <Star className="w-3 h-3 fill-current" />
            <span>{userBook.rating}</span>
          </div>
        )}
      </div>

      {/* Book Title & Author */}
      <div className="space-y-0.5 px-0.5">
        <h3 className="text-xs font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
          {book.title || 'Untitled Book'}
        </h3>
        <p className="text-[11px] text-muted-foreground line-clamp-1">
          {book.authors?.join(', ') || 'Unknown Author'}
        </p>
      </div>
    </div>
  );
}
