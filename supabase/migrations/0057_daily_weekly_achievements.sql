-- Books & Runs — four Daily Deal / Weekly Challenge achievement families
-- ("challenges" category): daily_deals_completed, daily_deal_best_streak,
-- weekly_challenges_completed, weekly_challenge_best_streak. Run once in the
-- Supabase SQL editor, after 0056.
--
-- src/achievements.ts's ACHIEVEMENT_FAMILIES and achievement_thresholds
-- (migration 0027) are kept in sync by hand — this adds the four new rows so
-- compute_total_xp() / category_mastered() / refresh_achievement_rarity()
-- see them. All four are plain 'counter' families: the solo-verify Edge
-- Function sets the counters (as absolute values recomputed from
-- daily_deal_completions / weekly_challenge_completions) every time it
-- records a completion, so they inherit the same "server-verified only"
-- guarantee as every other counter.
--
-- Note: 'challenges' is a tenth category, so cosmetic_unlocked()'s
-- 'categories_count' (Epic tiers) still needs the same 3 / 6 mastered, and
-- 'complete' (Prismatic) now also needs it — a 100-day Daily Deal streak
-- and 250 completions is consistent with "everything at once".
--
-- Backfill: counters for accounts that already have completions, so existing
-- streaks and completion counts show up (and unlock tiers) immediately
-- rather than only after each account's next completion. Existing
-- completions do NOT earn retroactive completion XP — only new ones pay.

insert into public.achievement_thresholds
  (family_id, category, source_kind, source_key,
   beginner_threshold, easy_threshold, medium_threshold, hard_threshold, expert_threshold, lower_is_better)
values
  ('daily_deals_completed', 'challenges', 'counter', 'daily_deals_completed', 3, 10, 30, 100, 250, false),
  ('daily_deal_best_streak', 'challenges', 'counter', 'daily_deal_best_streak', 3, 7, 14, 30, 100, false),
  ('weekly_challenges_completed', 'challenges', 'counter', 'weekly_challenges_completed', 1, 4, 12, 26, 52, false),
  ('weekly_challenge_best_streak', 'challenges', 'counter', 'weekly_challenge_best_streak', 2, 4, 8, 12, 26, false)
on conflict (family_id) do nothing;

-- Daily: gaps-and-islands over each account's completion dates.
with numbered as (
  select user_id, date,
         date - (row_number() over (partition by user_id order by date))::int as grp
  from public.daily_deal_completions
),
runs as (
  select user_id, count(*) as len from numbered group by user_id, grp
),
agg as (
  select user_id, max(len) as best, sum(len) as total from runs group by user_id
)
insert into public.achievement_counters (user_id, counters, updated_at)
select user_id,
       jsonb_build_object('daily_deals_completed', total, 'daily_deal_best_streak', best),
       now()
from agg
on conflict (user_id) do update
  set counters = public.achievement_counters.counters || excluded.counters,
      updated_at = now();

-- Weekly: same, over an integer week index derived from the ISO week key
-- (Monday of ISO week 1 = the Monday on/before Jan 4th).
with weeks as (
  select user_id, week,
         ((make_date(split_part(week, '-W', 1)::int, 1, 4)
             - (extract(isodow from make_date(split_part(week, '-W', 1)::int, 1, 4))::int - 1))
           + (split_part(week, '-W', 2)::int - 1) * 7
           - date '2001-01-01') / 7 as idx
  from public.weekly_challenge_completions
),
numbered as (
  select user_id, idx,
         idx - (row_number() over (partition by user_id order by idx))::int as grp
  from weeks
),
runs as (
  select user_id, count(*) as len from numbered group by user_id, grp
),
agg as (
  select user_id, max(len) as best, sum(len) as total from runs group by user_id
)
insert into public.achievement_counters (user_id, counters, updated_at)
select user_id,
       jsonb_build_object('weekly_challenges_completed', total, 'weekly_challenge_best_streak', best),
       now()
from agg
on conflict (user_id) do update
  set counters = public.achievement_counters.counters || excluded.counters,
      updated_at = now();

select public.refresh_achievement_rarity();

do $$ begin
  insert into public.schema_migrations (version) values ('0057_daily_weekly_achievements')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
