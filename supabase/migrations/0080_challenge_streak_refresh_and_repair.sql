-- Books & Runs — Daily Deal / Weekly Challenge streaks that actually
-- accumulate. Run once in the Supabase SQL editor, after 0073. Safe to re-run.
--
-- Root cause (found Sept 25 2026): migrations 0036/0039 recompute the streak
-- columns on leaderboard_entries with BEFORE INSERT/UPDATE triggers on that
-- table — i.e. only when the *client* happens to write those columns. But the
-- client's own write (syncDailyDealStreak) races the verified completion the
-- `solo-verify` Edge Function inserts into daily_deal_completions: the client
-- write lands first, the trigger finds no completion yet and stores
-- streak 0 / last_played null, and inserting the completion afterwards never
-- touches leaderboard_entries again. Result: the ground-truth table said
-- "completed" while every cloud reader (Home on another device, the
-- leaderboard, streak cosmetics) said "didn't". Separately, solo-verify
-- rejected completions in a US player's local evening (see
-- src/dailyRewards.ts isBelievableDayKey) — that is fixed by redeploying
-- `solo-verify`; those completions were never recorded at all.
--
-- 1. AFTER INSERT triggers on daily_deal_completions / weekly_challenge_completions
--    that (upsert +) touch the account's leaderboard row so the existing
--    BEFORE triggers recompute the streak columns from the ground truth.
-- 2. Repair, idempotent, no invented streaks:
--    a. Daily days that have a daily_deal_scores row (written by the app's
--       game-over flow) from the last 3 days but no completion row get one —
--       evidence-backed, and bounded to the last 3 days because that table
--       is owner-insertable so older rows aren't trustworthy proof.
--       Weekly has no evidence table, so nothing is backfilled there; an
--       account whose weekly completion was rejected just plays it again
--       (the deal is replayable until the week ends).
--    b. Recompute leaderboard streak columns for every account with a
--       completion, and the Daily/Weekly achievement counters (absolute
--       values, same math as 0057). No retroactive XP is granted.

-- ── 1. keep leaderboard_entries in step with the completions tables ─────
create or replace function public.touch_leaderboard_daily_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Setting a streak column (even to the same value it will be recomputed
  -- from) fires sync_daily_deal_streak_truth, which rewrites all three
  -- columns from daily_deal_completions.
  insert into public.leaderboard_entries (user_id, daily_deal_streak)
    values (new.user_id, 0)
    on conflict (user_id) do update set daily_deal_streak = 0;
  return null;
end;
$$;

create or replace function public.touch_leaderboard_weekly_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.leaderboard_entries (user_id, weekly_challenge_streak)
    values (new.user_id, 0)
    on conflict (user_id) do update set weekly_challenge_streak = 0;
  return null;
end;
$$;

revoke execute on function public.touch_leaderboard_daily_streak(), public.touch_leaderboard_weekly_streak()
  from public, anon, authenticated;

drop trigger if exists touch_leaderboard_daily_streak on public.daily_deal_completions;
create trigger touch_leaderboard_daily_streak
  after insert on public.daily_deal_completions
  for each row execute function public.touch_leaderboard_daily_streak();

drop trigger if exists touch_leaderboard_weekly_streak on public.weekly_challenge_completions;
create trigger touch_leaderboard_weekly_streak
  after insert on public.weekly_challenge_completions
  for each row execute function public.touch_leaderboard_weekly_streak();

-- ── 2a. evidence-backed backfill of recent Daily completions ────────────
insert into public.daily_deal_completions (user_id, date, completed_at)
select s.user_id, s.deal_date::date, s.created_at
from public.daily_deal_scores s
where s.deal_date::date between (now() at time zone 'UTC')::date - 3 and (now() at time zone 'UTC')::date + 1
on conflict (user_id, date) do nothing;
-- (the AFTER INSERT trigger above refreshes each affected leaderboard row)

-- ── 2b. recompute cached streak columns + counters for everyone ─────────
update public.leaderboard_entries
   set daily_deal_streak = 0
 where user_id in (select distinct user_id from public.daily_deal_completions);

update public.leaderboard_entries
   set weekly_challenge_streak = 0
 where user_id in (select distinct user_id from public.weekly_challenge_completions);

with numbered as (
  select user_id, date,
         date - (row_number() over (partition by user_id order by date))::int as grp
  from public.daily_deal_completions
),
runs as (select user_id, count(*) as len from numbered group by user_id, grp),
agg as (select user_id, max(len) as best, sum(len) as total from runs group by user_id)
insert into public.achievement_counters (user_id, counters, updated_at)
select user_id,
       jsonb_build_object('daily_deals_completed', total, 'daily_deal_best_streak', best),
       now()
from agg
on conflict (user_id) do update
  set counters = public.achievement_counters.counters || excluded.counters,
      updated_at = now();

select public.refresh_achievement_rarity();

do $$ begin
  insert into public.schema_migrations (version) values ('0080_challenge_streak_refresh_and_repair')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
