-- Books & Runs — the missing piece for Daily Deal syncing across devices.
--
-- 0007_daily_deal_streak.sql added the streak numbers themselves, but a
-- second device (an iPad, say, after playing on an iPhone) had no way to
-- tell whether the cloud's streak already accounted for *today* — it could
-- only compare against its own local history, which never knew what the
-- other device did. This date is what closes that gap: app/lib/
-- dailyDealStore.ts's mergeCloudDailyDealState compares it against each
-- device's own local last-played date to decide whether the cloud or the
-- local copy is the more recent truth before computing anything.
--
-- Self-reported, same trust model as every other column on this table —
-- see 0006_leaderboard.sql's own comment.
--
-- Run this once in the Supabase SQL editor for your project, after
-- 0007_daily_deal_streak.sql.

alter table public.leaderboard_entries
  add column if not exists daily_deal_last_played date;
