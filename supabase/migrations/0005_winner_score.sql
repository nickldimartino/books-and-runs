-- Books & Runs — records the winning score alongside each game_history row.
-- Nullable and left unbackfilled for existing rows on purpose: only games
-- recorded after this migration (and the matching app/lib/recordGameResult.ts
-- change) will have it, and the Stats page treats a null here the same as
-- "not recorded" rather than showing a 0.
-- Run this once in the Supabase SQL editor for your project, after
-- 0001_init.sql.

alter table public.game_history add column if not exists winner_score integer;
