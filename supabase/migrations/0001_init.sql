-- Books & Runs — Phase 5 schema (accounts + stats)
-- Run this once in the Supabase SQL editor for your project.
-- `users` itself is managed by Supabase Auth (auth.users) — not created here.

create table if not exists public.player_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  games_played integer not null default 0,
  games_won integer not null default 0,
  best_score integer,
  average_score numeric,
  wins_by_difficulty jsonb not null default '{"beginner":0,"easy":0,"medium":0,"hard":0,"expert":0}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opponents jsonb not null, -- list of {name, difficulty | null}
  rounds jsonb not null, -- per-round cumulative scores by player name
  winner text not null, -- winning player's name
  played_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  wild_card_limit_house_rule integer,
  preferred_ai_difficulty_default text default 'medium',
  sound_on boolean not null default true
);

alter table public.player_stats enable row level security;
alter table public.game_history enable row level security;
alter table public.settings enable row level security;

-- Each user can only ever read/write their own rows.
create policy "player_stats: owner read" on public.player_stats
  for select using (auth.uid() = user_id);
create policy "player_stats: owner insert" on public.player_stats
  for insert with check (auth.uid() = user_id);
create policy "player_stats: owner update" on public.player_stats
  for update using (auth.uid() = user_id);

create policy "game_history: owner read" on public.game_history
  for select using (auth.uid() = user_id);
create policy "game_history: owner insert" on public.game_history
  for insert with check (auth.uid() = user_id);

create policy "settings: owner read" on public.settings
  for select using (auth.uid() = user_id);
create policy "settings: owner insert" on public.settings
  for insert with check (auth.uid() = user_id);
create policy "settings: owner update" on public.settings
  for update using (auth.uid() = user_id);
