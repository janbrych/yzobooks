# Accounts with Supabase

Signing in and saving the library to an account use [Supabase](https://supabase.com)
(free tier). Without it the app keeps the library on one device only.

## Setup (once)

1. Create a project on supabase.com (any name and region, e.g. Frankfurt).
2. **SQL Editor → New query**: paste `supabase/schema.sql` and run it.
3. **Authentication → URL Configuration**:
   - Site URL: `https://janbrych.github.io/yzobooks/`
   - Redirect URLs: add `https://janbrych.github.io/yzobooks/` and
     `http://localhost:3000/` (local development).
4. **Project Settings → API**: copy the *Project URL* and the *anon public* key.
5. Give them to the build as repository variables (Settings → Secrets and
   variables → Actions → Variables): `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`. For local development put the same two
   lines in `.env.local`.

The anon key is meant to be public: row level security in `schema.sql` lets
every signed-in user read and change only their own rows. Never put the
`service_role` key anywhere in the app.

## How saving works

The library stays on the device (localStorage) and the app works with that
copy, also offline. When signed in, `src/lib/sync.ts` sends local changes to
the `library_items` table and brings changes from other devices, on start,
on focus, after every edit (1.5 s later) and every 45 s. When the same book
was changed on two devices, the later edit wins. Signing in adds what is on
the device to the account; signing out removes the library from the device
(it stays in the account).
