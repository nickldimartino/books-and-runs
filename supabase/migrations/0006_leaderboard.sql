-- Books & Runs — the leaderboard: one row per account, holding a
-- self-reported snapshot of that account's publicly-visible stats.
--
-- This is the one table in this schema that ISN'T owner-read-only by
-- design — see the select policy below — so keep anything actually
-- private (email, raw game history, settings) out of it.
--
-- Each row is written only by its own owner (see the insert/update
-- policies, and app/lib/leaderboardStore.ts), computed with the exact same
-- scoring/leveling logic already used everywhere else in the app
-- (src/leveling.ts, src/achievements.ts) rather than a separate,
-- server-side source of truth. That matches how this schema already
-- trusts the client for game results and achievement progress
-- (recordGameResult.ts, recordAchievementProgress.ts) — a leaderboard row
-- is no more (and no less) trustworthy than the data it's derived from.
--
-- Run this once in the Supabase SQL editor for your project, after
-- 0001_init.sql and 0002_achievements.sql.

create table if not exists public.leaderboard_entries (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Null until the account holder sets one on the Account page — shown as a
  -- generated placeholder ("Player 1234") in the UI rather than stored here,
  -- so a name picked later doesn't leave stale placeholder text behind.
  display_name text,
  level integer not null default 0,
  total_xp integer not null default 0,
  -- Out of ACHIEVEMENT_FAMILIES.length * ACHIEVEMENT_TIERS.length (40 * 5 =
  -- 200 today) — computed in the app, not hardcoded here, so this stays
  -- correct if that ever changes.
  achievements_unlocked integer not null default 0,
  games_played integer not null default 0,
  games_won integer not null default 0,
  average_score numeric,
  -- Highest (worst) single-game score, not lowest — see
  -- app/lib/leaderboardStore.ts for why this is what's shown instead of a
  -- personal-best column.
  worst_score integer,
  updated_at timestamptz not null default now()
);

alter table public.leaderboard_entries enable row level security;

-- Visible by design to any signed-in account, not just its own row — this
-- is what makes it a leaderboard instead of another private per-account
-- table. Restricted to the `authenticated` role specifically (not `true`,
-- which the public anon key could also satisfy with nobody signed in at
-- all) so this still only opens up to people who actually have an account.
create policy "leaderboard_entries: any signed-in user can read" on public.leaderboard_entries
  for select using (auth.role() = 'authenticated');
create policy "leaderboard_entries: owner insert" on public.leaderboard_entries
  for insert with check (auth.uid() = user_id);
create policy "leaderboard_entries: owner update" on public.leaderboard_entries
  for update using (auth.uid() = user_id);
