'use client';

import React, { useState } from 'react';
import { BookOpen, LogIn, UserPlus } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Nastala chyba při autentizaci.');
      } else {
        onSuccess();
        onClose();
      }
    } catch (err) {
      setError('Nepodařilo se připojit k serveru.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 flex flex-col gap-5">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="p-3 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl text-indigo-400">
            <BookOpen size={28} />
          </div>
          <h2 className="text-xl font-bold text-white">
            {isRegister ? 'Vytvořit účet' : 'Přihlášení do Knihovny'}
          </h2>
          <p className="text-xs text-slate-400">
            {isRegister ? 'Zaregistrujte se pro ukládání vaší sbírky' : 'Přihlaste se ke své osobní knihovně'}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-xl text-xs text-red-300 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Jméno</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                placeholder="Jan Novák"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              placeholder="vas@email.cz"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Heslo</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-500/20"
          >
            {isRegister ? <UserPlus size={18} /> : <LogIn size={18} />}
            {loading ? 'Zpracovávám...' : isRegister ? 'Registrovat se' : 'Přihlásit se'}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-slate-800">
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className="text-xs text-slate-400 hover:text-indigo-400 transition-colors"
          >
            {isRegister ? 'Již máte účet? Přihlaste se' : 'Nemáte účet? Zaregistrujte se'}
          </button>
        </div>
      </div>
    </div>
  );
}
