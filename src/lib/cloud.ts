// The user's account in Supabase: signing in and out, and keeping the library
// on this device in sync with the account (src/lib/sync.ts). Without
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY the app works on
// this device only, exactly as before.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { LOCAL_CHANGE_EVENT } from '@/lib/localChanges';
import { clearLocalLibrary, syncOnce, type RemoteItem, type RemoteStore } from '@/lib/sync';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// The public "anon" key: meant to be in the web page; row level security on
// the server decides what each signed-in user may touch.
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const cloudConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const TABLE = 'library_items';
const PAGE = 1000;
const PUSH_CHUNK = 300;
const SYNC_DEBOUNCE_MS = 1500;
const SYNC_INTERVAL_MS = 45_000;

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'error';

export interface CloudState {
  ready: boolean; // the stored session has been checked
  user: { id: string; email: string } | null;
  status: SyncStatus;
  lastSyncedAt: number | null;
  // The user came back from a "reset password" e-mail and must choose one.
  recovering: boolean;
}

let state: CloudState = { ready: !cloudConfigured, user: null, status: 'off', lastSyncedAt: null, recovering: false };
const listeners = new Set<(s: CloudState) => void>();

function setState(patch: Partial<CloudState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function getCloudState(): CloudState {
  return state;
}

export function subscribeCloud(listener: (s: CloudState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---- client --------------------------------------------------------------

let clientPromise: Promise<SupabaseClient> | null = null;

function getClient(): Promise<SupabaseClient> {
  if (!cloudConfigured) return Promise.reject(new Error('Účty nejsou nastavené.'));
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  );
  return clientPromise;
}

interface Row {
  kind: 'book' | 'doc';
  id: string;
  data: unknown;
  client_updated_at: number;
  deleted: boolean;
  updated_at: string;
}

export function supabaseRemote(client: SupabaseClient): RemoteStore {
  return {
    async pull(since) {
      const out: RemoteItem[] = [];
      for (let from = 0; ; from += PAGE) {
        let query = client.from(TABLE).select('kind,id,data,client_updated_at,deleted,updated_at').order('updated_at').range(from, from + PAGE - 1);
        if (since) query = query.gt('updated_at', since);
        const { data, error } = await query;
        if (error) throw error;
        const rows = (data || []) as Row[];
        out.push(
          ...rows.map((r) => ({
            kind: r.kind,
            id: r.id,
            data: r.data,
            clientUpdatedAt: Number(r.client_updated_at),
            deleted: r.deleted,
            serverUpdatedAt: r.updated_at,
          }))
        );
        if (rows.length < PAGE) return out;
      }
    },
    async push(items) {
      for (let i = 0; i < items.length; i += PUSH_CHUNK) {
        const rows = items.slice(i, i + PUSH_CHUNK).map((it) => ({
          kind: it.kind,
          id: it.id,
          data: it.data,
          client_updated_at: it.clientUpdatedAt,
          deleted: it.deleted,
        }));
        const { error } = await client.from(TABLE).upsert(rows, { onConflict: 'user_id,kind,id' });
        if (error) throw error;
      }
    },
  };
}

// ---- syncing ---------------------------------------------------------------

let running: Promise<void> | null = null;
let again = false;
let debounce: ReturnType<typeof setTimeout> | null = null;

/** Sync now (or right after the round already running). */
export function syncNow(): Promise<void> {
  if (!state.user) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      const user = state.user;
      if (!user) break;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setState({ status: 'offline' });
        break;
      }
      setState({ status: 'syncing' });
      try {
        await syncOnce(supabaseRemote(await getClient()), user.id);
        setState({ status: 'synced', lastSyncedAt: Date.now() });
      } catch (err) {
        console.error('Sync failed:', err);
        setState({ status: navigator.onLine === false ? 'offline' : 'error' });
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

function scheduleSync(): void {
  if (!state.user) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => syncNow(), SYNC_DEBOUNCE_MS);
}

let started = false;

/** Starts watching the account; safe to call from every page. */
export function startCloud(): void {
  if (started || !cloudConfigured || typeof window === 'undefined') return;
  started = true;
  getClient()
    .then(async (client) => {
      const apply = (user: User | null) => {
        const next = user ? { id: user.id, email: user.email || '' } : null;
        const changed = next?.id !== state.user?.id;
        setState({ user: next, ready: true, status: next ? state.status : 'off' });
        if (next && changed) syncNow();
      };
      const { data } = await client.auth.getSession();
      apply(data.session?.user ?? null);
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') setState({ recovering: true });
        apply(session?.user ?? null);
      });
    })
    .catch((err) => {
      console.error('Cloud start failed:', err);
      setState({ ready: true, status: 'error' });
    });

  window.addEventListener(LOCAL_CHANGE_EVENT, scheduleSync);
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => state.user && setState({ status: 'offline' }));
  window.addEventListener('focus', () => syncNow());
  setInterval(() => document.visibilityState === 'visible' && syncNow(), SYNC_INTERVAL_MS);
}

// ---- account actions (errors come back as Czech messages) -----------------

function czech(message: string): string {
  if (/invalid login/i.test(message)) return 'Nesprávný e-mail nebo heslo.';
  if (/email not confirmed/i.test(message)) return 'E-mail ještě není potvrzený. Klikni na odkaz, který jsme ti poslali.';
  if (/already registered|already exists/i.test(message)) return 'Tenhle e-mail už má účet. Přihlas se.';
  if (/password should be|at least/i.test(message)) return 'Heslo musí mít aspoň 6 znaků.';
  if (/rate limit|too many/i.test(message)) return 'Moc pokusů za sebou. Zkus to za chvíli.';
  if (/fetch|network/i.test(message)) return 'Nepodařilo se spojit se serverem. Jsi online?';
  return message;
}

// Where e-mail links (confirmation, password reset) bring the user back.
function homeUrl(): string {
  return `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await (await getClient()).auth.signInWithPassword({ email, password });
  if (error) throw new Error(czech(error.message));
}

/** True when the account is ready; false when the e-mail must be confirmed first. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await (await getClient()).auth.signUp({ email, password, options: { emailRedirectTo: homeUrl() } });
  if (error) throw new Error(czech(error.message));
  return Boolean(data.session);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await (await getClient()).auth.resetPasswordForEmail(email, { redirectTo: homeUrl() });
  if (error) throw new Error(czech(error.message));
}

export async function setNewPassword(password: string): Promise<void> {
  const { error } = await (await getClient()).auth.updateUser({ password });
  if (error) throw new Error(czech(error.message));
  setState({ recovering: false });
}

/**
 * Sends what is left, signs out and removes the library from this device
 * (it stays in the account). Returns false when the last changes couldn't
 * be sent; the caller then asks before signing out anyway.
 */
export async function signOut({ force = false }: { force?: boolean } = {}): Promise<boolean> {
  await syncNow();
  if (state.status !== 'synced' && !force) return false;
  await (await getClient()).auth.signOut();
  clearLocalLibrary();
  setState({ user: null, status: 'off', lastSyncedAt: null });
  return true;
}
