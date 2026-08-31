-- Books & Runs — Daily Deal's current/best streak, added to the leaderboard.
--
-- Daily Deal (see app/lib/dailyDealStore.ts) is otherwise entirely local —
-- computed and stored in localStorage, never touching player_stats,
-- game_history, or achievement_counters, so it can't inflate a real
-- account's games_played or achievement progress. These two columns are the
-- one exception: once signed in, finishing a Daily Deal also broadcasts the
-- resulting streak numbers here (app/lib/leaderboardStore.ts's
-- syncDailyDealStreak), the same "self-reported snapshot, no more or less
-- trustworthy than the client-side data it's derived from" model
-- 0006_leaderboard.sql already uses for every other column on this table —
-- not a new trust boundary, just two more numbers computed the same way.
--
-- localStorage stays the actual source of truth for streak *logic* (whether
-- today continues yesterday's streak or resets it) — these columns are only
-- ever written wholesale after that computation, never read back to drive
-- it, so playing on a second device without ever revisiting the first
-- can't corrupt anything; it just means the leaderboard/Stats reflect
-- whichever device most recently reported in.
--
-- Run this once in the Supabase SQL editor for your project, after
-- 0006_leaderboard.sql.

alter table public.leaderboard_entries
  add column if not exists daily_deal_streak integer not null default 0,
  add column if not exists daily_deal_best_streak integer not null default 0;
