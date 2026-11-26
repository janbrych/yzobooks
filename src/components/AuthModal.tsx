'use client';

import React, { useEffect, useState } from 'react';
import { BookOpen, Cloud, KeyRound, LogIn, MailCheck, UserPlus } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { cloudConfigured, sendPasswordReset, setNewPassword, signIn, signUp } from '@/lib/cloud';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  // Back from a "reset password" e-mail: ask for the new password.
  recovering?: boolean;
}

type Step = 'login' | 'register' | 'forgot' | 'recover';

const INPUT =
  'w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500';

// Without Supabase settings the old self-hosted server API is used.
async function legacyAuth(register: boolean, email: string, password: string, name: string): Promise<void> {
  const res = await fetch(register ? '/api/auth/register' : '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  }).catch(() => null);
  if (!res) throw new Error('Nepodařilo se připojit k serveru.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Nastala chyba při přihlašování.');
}

export function AuthModal({ isOpen, onClose, onSuccess, recovering = false }: AuthModalProps) {
  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep(recovering ? 'recover' : 'login');
    setError('');
    setSent(null);
    setPassword('');
  }, [isOpen, recovering]);

  const go = (next: Step) => {
    setStep(next);
    setError('');
    setSent(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!cloudConfigured) {
        await legacyAuth(step === 'register', email, password, name);
      } else if (step === 'login') {
        await signIn(email, password);
      } else if (step === 'register') {
        if (!(await signUp(email, password))) {
          setSent(`Poslali jsme e-mail na ${email}. Klikni na odkaz v něm a pak se tady přihlas.`);
          setStep('login');
          return;
        }
      } else if (step === 'forgot') {
        await sendPasswordReset(email);
        setSent(`Odkaz pro nové heslo je na cestě na ${email}.`);
        return;
      } else {
        await setNewPassword(password);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nastala chyba.');
    } finally {
      setLoading(false);
    }
  };

  const title = { login: 'Přihlášení', register: 'Vytvořit účet', forgot: 'Zapomenuté heslo', recover: 'Nové heslo' }[step];
  const button = { login: 'Přihlásit se', register: 'Vytvořit účet', forgot: 'Poslat odkaz', recover: 'Uložit heslo' }[step];
  const Icon = { login: LogIn, register: UserPlus, forgot: MailCheck, recover: KeyRound }[step];

  return (
    <Modal open={isOpen} onClose={onClose} label={title} className="sm:max-w-sm">
      <div className="p-6 pt-2 sm:pt-6 flex flex-col gap-5">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="p-3 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl text-indigo-400">
            {cloudConfigured ? <Cloud size={28} /> : <BookOpen size={28} />}
          </div>
          <h2 className="text-xl font-bold text-slate-50">{title}</h2>
          <p className="text-xs text-slate-400 max-w-xs">
            {step === 'recover'
              ? 'Zvol si nové heslo k účtu.'
              : step === 'forgot'
                ? 'Pošleme ti odkaz, přes který si nastavíš nové heslo.'
                : cloudConfigured
                  ? 'Knihovna, regály i mapa se uloží do účtu a uvidíš je na každém zařízení. Co máš v knihovně teď, se do účtu přidá.'
                  : 'Přihlaste se ke své osobní knihovně.'}
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3 bg-red-950/50 border border-red-800/80 rounded-xl text-xs text-red-300 text-center">
            {error}
          </div>
        )}
        {sent && (
          <div role="status" className="p-3 bg-emerald-950/50 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 text-center">
            {sent}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {step === 'register' && !cloudConfigured && (
            <label className="block text-xs font-medium text-slate-400">
              Jméno
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={`${INPUT} mt-1`} placeholder="Jan Novák" />
            </label>
          )}

          {step !== 'recover' && (
            <label className="block text-xs font-medium text-slate-400">
              E-mail
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${INPUT} mt-1`}
                placeholder="vas@email.cz"
              />
            </label>
          )}

          {step !== 'forgot' && (
            <label className="block text-xs font-medium text-slate-400">
              {step === 'recover' ? 'Nové heslo' : 'Heslo'}
              <input
                type="password"
                required
                minLength={6}
                autoComplete={step === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${INPUT} mt-1`}
                placeholder="••••••••"
              />
            </label>
          )}

          {step === 'login' && cloudConfigured && (
            <button type="button" onClick={() => go('forgot')} className="self-end -mt-1 text-[11px] text-slate-400 hover:text-indigo-300">
              Zapomenuté heslo?
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-500/20"
          >
            <Icon size={18} />
            {loading ? 'Chvilku…' : button}
          </button>
        </form>

        {step !== 'recover' && (
          <div className="text-center pt-2 border-t border-slate-800">
            <button
              onClick={() => go(step === 'login' ? 'register' : 'login')}
              className="text-xs text-slate-400 hover:text-indigo-400 transition-colors"
            >
              {step === 'login' ? 'Nemáš účet? Vytvoř si ho' : 'Máš účet? Přihlas se'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
