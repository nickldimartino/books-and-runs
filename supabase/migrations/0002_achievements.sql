-- Books & Runs — achievement counters
-- Run this once in the Supabase SQL editor for your project, after 0001_init.sql.

create table if not exists public.achievement_counters (
  user_id uuid primary key references auth.users (id) on delete cascade,
  counters jsonb not null default '{}'::jsonb, -- { counterKey: number }, see src/achievements.ts
  updated_at timestamptz not null default now()
);

alter table public.achievement_counters enable row level security;

create policy "achievement_counters: owner read" on public.achievement_counters
  for select using (auth.uid() = user_id);
create policy "achievement_counters: owner insert" on public.achievement_counters
  for insert with check (auth.uid() = user_id);
create policy "achievement_counters: owner update" on public.achievement_counters
  for update using (auth.uid() = user_id);
