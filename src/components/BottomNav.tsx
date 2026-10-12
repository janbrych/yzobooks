'use client';

import React from 'react';
import { Library, Search, Plus, BarChart2, User } from 'lucide-react';

export type NavigationTab = 'library' | 'search' | 'stats' | 'profile';

interface BottomNavProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  onAddClick: () => void;
}

export default function BottomNav({ activeTab, onTabChange, onAddClick }: BottomNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-card/90 backdrop-blur-xl border-t border-border safe-padding-bottom">
      <div className="max-w-md mx-auto flex items-center justify-around h-16 px-3">
        {/* Library Tab */}
        <button
          onClick={() => onTabChange('library')}
          className={`flex flex-col items-center justify-center space-y-1 w-12 py-1 transition ${
            activeTab === 'library' ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Library className="w-5 h-5" />
          <span className="text-[10px]">Library</span>
        </button>

        {/* Search Tab */}
        <button
          onClick={() => onTabChange('search')}
          className={`flex flex-col items-center justify-center space-y-1 w-12 py-1 transition ${
            activeTab === 'search' ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px]">Search</span>
        </button>

        {/* Central Prominent Floating + Button */}
        <div className="relative -top-3">
          <button
            onClick={onAddClick}
            aria-label="Add Book"
            className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus className="w-7 h-7 stroke-[2.5]" />
          </button>
        </div>

        {/* Stats Tab */}
        <button
          onClick={() => onTabChange('stats')}
          className={`flex flex-col items-center justify-center space-y-1 w-12 py-1 transition ${
            activeTab === 'stats' ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <BarChart2 className="w-5 h-5" />
          <span className="text-[10px]">Stats</span>
        </button>

        {/* Profile Tab */}
        <button
          onClick={() => onTabChange('profile')}
          className={`flex flex-col items-center justify-center space-y-1 w-12 py-1 transition ${
            activeTab === 'profile' ? 'text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px]">Profile</span>
        </button>
      </div>
    </div>
  );
}
