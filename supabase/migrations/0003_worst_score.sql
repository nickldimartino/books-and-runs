-- Books & Runs — tracks each account's worst (highest) single-game score,
-- alongside the best_score column 0001_init.sql already added.
-- Run this once in the Supabase SQL editor for your project, after
-- 0001_init.sql and 0002_achievements.sql.

alter table public.player_stats add column if not exists worst_score integer;
