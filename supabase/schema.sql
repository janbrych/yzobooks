-- Knihovna: storage for signed-in users. Run once in the Supabase dashboard
-- (SQL Editor → New query → paste → Run).
--
-- One table holds every user's books and their two documents (bookcases and
-- the floor plan) as JSON. Each row belongs to one user and row level
-- security lets a user see and change only their own rows.

create table if not exists public.library_items (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('book', 'doc')),
  id text not null,
  data jsonb,
  client_updated_at bigint not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create index if not exists library_items_user_updated on public.library_items (user_id, updated_at);

-- The server's clock decides "what's new since" for every device.
create or replace function public.library_items_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists library_items_touch on public.library_items;
create trigger library_items_touch before insert or update on public.library_items
for each row execute function public.library_items_touch();

alter table public.library_items enable row level security;

drop policy if exists "own rows: read" on public.library_items;
drop policy if exists "own rows: insert" on public.library_items;
drop policy if exists "own rows: update" on public.library_items;
drop policy if exists "own rows: delete" on public.library_items;

create policy "own rows: read" on public.library_items for select to authenticated using (user_id = auth.uid());
create policy "own rows: insert" on public.library_items for insert to authenticated with check (user_id = auth.uid());
create policy "own rows: update" on public.library_items for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows: delete" on public.library_items for delete to authenticated using (user_id = auth.uid());
