-- Books & Runs — tracks each account's number of tied games (finishing with
-- the exact same lowest score as one or more other players). Deliberately
-- separate from games_won: a tie no longer counts as a win (see
-- app/lib/recordGameResult.ts), so this is the only place that number
-- survives to show on the Stats page.
-- Run this once in the Supabase SQL editor for your project, after
-- 0001_init.sql.

alter table public.player_stats add column if not exists games_tied integer not null default 0;
