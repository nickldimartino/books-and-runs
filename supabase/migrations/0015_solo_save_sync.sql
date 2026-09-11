-- Books & Runs — sync the single in-progress solo / pass-and-play game to
-- the account, so it can be resumed on any device (like multiplayer games).
-- Run once in the Supabase SQL editor, after 0001–0014.
--
-- One row per user holding the same SavedGame blob the app keeps in
-- localStorage. `saved_at` mirrors SavedGame.savedAt (ms epoch) and is the
-- tiebreak for "which device wrote last". Signed-out play is unaffected —
-- it stays local-only.

create table if not exists public.solo_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  save jsonb not null,
  saved_at bigint not null,
  updated_at timestamptz not null default now(),
  -- A SavedGame is ~7 KB; this is a generous ceiling against a runaway blob.
  constraint solo_save_size check (pg_column_size(save) < 262144)
);

alter table public.solo_saves enable row level security;

-- Owner-only, every operation.
create policy "solo_saves: owner select" on public.solo_saves
  for select using (auth.uid() = user_id);
create policy "solo_saves: owner insert" on public.solo_saves
  for insert with check (auth.uid() = user_id);
create policy "solo_saves: owner update" on public.solo_saves
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "solo_saves: owner delete" on public.solo_saves
  for delete using (auth.uid() = user_id);

-- Record this migration (see supabase/migrations/README.md). Guarded in
-- case 0016 (which creates the table) hasn't been run yet.
do $$ begin
  insert into public.schema_migrations (version) values ('0015_solo_save_sync')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
