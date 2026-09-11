-- Books & Runs — sync "my usual" solo/pass-and-play setup across devices.
-- Run this once in the Supabase SQL editor, after 0001–0018.
--
-- app/lib/favoriteGameConfig.ts already keeps this in localStorage
-- (per-device). This table is the same self-reported-snapshot model as
-- solo_saves (0015): one owner-only row per account holding the whole
-- config as jsonb, upserted whenever the player saves/updates/forgets their
-- usual setup, so it follows their account across an iPhone/iPad/laptop the
-- same way the in-progress solo save already does.

create table if not exists public.favorite_game_configs (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  config     jsonb not null,
  updated_at timestamptz not null default now(),
  -- A lineup is a handful of names/difficulties, never large — this just
  -- catches a malformed client write before it bloats the row.
  constraint favorite_game_configs_size check (pg_column_size(config) < 8192)
);

alter table public.favorite_game_configs enable row level security;

create policy "favorite_game_configs: owner read" on public.favorite_game_configs
  for select using (auth.uid() = user_id);
create policy "favorite_game_configs: owner insert" on public.favorite_game_configs
  for insert with check (auth.uid() = user_id);
create policy "favorite_game_configs: owner update" on public.favorite_game_configs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "favorite_game_configs: owner delete" on public.favorite_game_configs
  for delete using (auth.uid() = user_id);

do $$ begin
  insert into public.schema_migrations (version) values ('0019_favorite_game_config')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
