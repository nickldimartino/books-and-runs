-- Books & Runs — Streak Shields: a free, earned, automatic grace for the
-- Daily Deal and Weekly Challenge streaks. Run once in the Supabase SQL
-- editor, AFTER 0080 (it replaces the two streak-truth trigger functions
-- from 0036/0039 and re-runs 0080's repair with the new math). Safe to re-run.
--
-- The rule (mirrored line for line by src/streakShield.ts; the two are
-- checked against each other on generated histories by
-- src/streakShield.sql.test.ts):
--   Walk the account's completion keys in ascending order.
--     * consecutive unit                          -> streak + 1
--     * exactly ONE missed unit and a shield held -> shield spent, that unit is
--       "covered", streak continues (+1 for the unit actually played; the
--       covered unit adds nothing to the count)
--     * 2+ missed units, or 1 missed with no shield -> streak restarts at 1
--       (shields already held are kept)
--     * each time the streak reaches a multiple of `earn_every` a shield is
--       earned, if fewer than `cap` are held (not granted at the cap)
--   Daily: earn_every 7, cap 2, unit = calendar day (the local-day key the
--   Daily Deal already stores). Weekly: earn_every 4, cap 1, unit = ISO week
--   (its own single shield: it covers one missed week).
-- Covered units are NOT completions: nothing counts them as plays, and the
-- streak-milestone XP ledger (xp_ledger, one row per milestone) can never pay
-- twice because of them. Shields are never purchasable and no client column
-- write can change them: the BEFORE trigger recomputes every shield column
-- from daily_deal_completions / weekly_challenge_completions on every write.
--
-- Old clients keep working: every new column is defaulted, and the streak /
-- best_streak / last_played columns keep their meaning (run ending at the
-- last completion), they simply now include shield bridges.

alter table public.leaderboard_entries
  add column if not exists daily_deal_shields int not null default 0,
  add column if not exists daily_deal_shields_earned int not null default 0,
  add column if not exists daily_deal_shields_used int not null default 0,
  add column if not exists daily_deal_covered_days date[] not null default '{}',
  add column if not exists weekly_challenge_shields int not null default 0,
  add column if not exists weekly_challenge_covered_weeks text[] not null default '{}';

-- ── the pure walk ───────────────────────────────────────────────────────
-- p_idx: integer unit indexes (order/duplicates irrelevant).
create or replace function public.streak_shield_walk(p_idx int[], p_earn_every int, p_cap int)
returns table (
  cnt int, cur int, best int, shields int, earned int, used int,
  last_idx int, last_earned_idx int, covered int[]
)
language plpgsql
immutable
as $$
declare
  v int;
  prev int := null;
begin
  cnt := 0; cur := 0; best := 0; shields := 0; earned := 0; used := 0;
  last_idx := null; last_earned_idx := null; covered := '{}';
  for v in select distinct x from unnest(p_idx) as x order by x loop
    cnt := cnt + 1;
    if prev is null then
      cur := 1;
    elsif v - prev - 1 = 0 then
      cur := cur + 1;
    elsif v - prev - 1 = 1 and shields > 0 then
      shields := shields - 1;
      used := used + 1;
      covered := covered || (prev + 1);
      cur := cur + 1;
    else
      cur := 1;
    end if;
    if cur > best then best := cur; end if;
    if cur % p_earn_every = 0 and shields < p_cap then
      shields := shields + 1;
      earned := earned + 1;
      last_earned_idx := v;
    end if;
    prev := v;
  end loop;
  last_idx := prev;
  return next;
end;
$$;

-- Integer week index from an ISO week key ("2026-W39"): weeks since the
-- Monday 2001-01-01 (Monday of ISO week 1 = the Monday on/before Jan 4th).
-- Same formula migration 0057 uses for the achievement counters.
create or replace function public.iso_week_key_index(p_week text)
returns int
language sql
immutable
as $$
  select (((make_date(split_part(p_week, '-W', 1)::int, 1, 4)
             - (extract(isodow from make_date(split_part(p_week, '-W', 1)::int, 1, 4))::int - 1))
           + (split_part(p_week, '-W', 2)::int - 1) * 7
           - date '2001-01-01') / 7)::int;
$$;

create or replace function public.iso_week_key_from_index(p_idx int)
returns text
language sql
immutable
as $$
  -- The Monday of that week; to_char's IYYY/IW give the ISO year and week.
  select to_char(date '2001-01-01' + p_idx * 7, 'IYYY') || '-W' || to_char(date '2001-01-01' + p_idx * 7, 'IW');
$$;

-- ── per-account state, always recomputed from the ground-truth tables ───
create or replace function public.daily_deal_shield_state(p_user uuid)
returns table (
  cnt int, streak int, best int, last_played date,
  shields int, earned int, used int, covered date[]
)
language sql
stable
security definer
set search_path = public
as $$
  with w as (
    select * from public.streak_shield_walk(
      coalesce((select array_agg(c.date - date '2001-01-01') from public.daily_deal_completions c where c.user_id = p_user), '{}'),
      7, 2)
  )
  select w.cnt, w.cur, w.best,
         case when w.last_idx is null then null else date '2001-01-01' + w.last_idx end,
         w.shields, w.earned, w.used,
         -- Keep the newest 30 covered days: enough for any UI, bounded row size.
         coalesce((select array_agg(date '2001-01-01' + x order by x)
                     from (select x from unnest(w.covered) as x order by x desc limit 30) t), '{}')
  from w;
$$;

create or replace function public.weekly_challenge_shield_state(p_user uuid)
returns table (
  cnt int, streak int, best int, last_played text,
  shields int, earned int, used int, covered text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with w as (
    select * from public.streak_shield_walk(
      coalesce((select array_agg(public.iso_week_key_index(c.week)) from public.weekly_challenge_completions c where c.user_id = p_user), '{}'),
      4, 1)
  )
  select w.cnt, w.cur, w.best,
         case when w.last_idx is null then null else public.iso_week_key_from_index(w.last_idx) end,
         w.shields, w.earned, w.used,
         coalesce((select array_agg(public.iso_week_key_from_index(x) order by x)
                     from (select x from unnest(w.covered) as x order by x desc limit 30) t), '{}')
  from w;
$$;

revoke execute on function public.daily_deal_shield_state(uuid), public.weekly_challenge_shield_state(uuid)
  from public, anon, authenticated;

-- ── the streak-truth triggers now own the shield columns too ────────────
create or replace function public.sync_daily_deal_streak_truth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  st record;
begin
  select * into st from public.daily_deal_shield_state(new.user_id);
  new.daily_deal_streak := st.streak;
  new.daily_deal_best_streak := st.best;
  new.daily_deal_last_played := st.last_played;
  new.daily_deal_shields := st.shields;
  new.daily_deal_shields_earned := st.earned;
  new.daily_deal_shields_used := st.used;
  new.daily_deal_covered_days := st.covered;
  return new;
end;
$$;

create or replace function public.sync_weekly_challenge_streak_truth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  st record;
begin
  select * into st from public.weekly_challenge_shield_state(new.user_id);
  new.weekly_challenge_streak := st.streak;
  new.weekly_challenge_best_streak := st.best;
  new.weekly_challenge_last_played := st.last_played;
  new.weekly_challenge_shields := st.shields;
  new.weekly_challenge_covered_weeks := st.covered;
  return new;
end;
$$;

revoke execute on function public.sync_daily_deal_streak_truth(), public.sync_weekly_challenge_streak_truth()
  from public, anon, authenticated;

-- Fire on the shield columns as well, so a client can't claim shields by
-- writing them without touching a streak column.
drop trigger if exists sync_daily_deal_streak_truth on public.leaderboard_entries;
create trigger sync_daily_deal_streak_truth
  before insert or update of daily_deal_streak, daily_deal_best_streak, daily_deal_last_played,
    daily_deal_shields, daily_deal_shields_earned, daily_deal_shields_used, daily_deal_covered_days
  on public.leaderboard_entries
  for each row execute function public.sync_daily_deal_streak_truth();

drop trigger if exists sync_weekly_challenge_streak_truth on public.leaderboard_entries;
create trigger sync_weekly_challenge_streak_truth
  before insert or update of weekly_challenge_streak, weekly_challenge_best_streak, weekly_challenge_last_played,
    weekly_challenge_shields, weekly_challenge_covered_weeks
  on public.leaderboard_entries
  for each row execute function public.sync_weekly_challenge_streak_truth();

-- ── repair: recompute everyone from their completion history ────────────
-- Idempotent. Setting a streak column re-fires the BEFORE trigger, which
-- rewrites every streak + shield column from the completions. This is what
-- repairs existing users: the rule is applied to each account's WHOLE
-- history, so a one-day gap that a shield (earned by an earlier 7-day run)
-- would have covered is bridged retroactively. Streaks and best streaks can
-- only stay the same or go up; nothing is invented (no completion is added).
insert into public.leaderboard_entries (user_id, daily_deal_streak)
  select distinct user_id, 0 from public.daily_deal_completions
  on conflict (user_id) do update set daily_deal_streak = 0;

insert into public.leaderboard_entries (user_id, weekly_challenge_streak)
  select distinct user_id, 0 from public.weekly_challenge_completions
  on conflict (user_id) do update set weekly_challenge_streak = 0;

-- Achievement counters: `*_completed` stays the count of days/weeks actually
-- played (covered units are not completions); the best-streak counters now
-- include shield bridges, matching what the leaderboard and Home show.
insert into public.achievement_counters (user_id, counters, updated_at)
select u.user_id,
       jsonb_build_object('daily_deals_completed', s.cnt, 'daily_deal_best_streak', s.best),
       now()
from (select distinct user_id from public.daily_deal_completions) u,
     lateral public.daily_deal_shield_state(u.user_id) s
on conflict (user_id) do update
  set counters = public.achievement_counters.counters || excluded.counters,
      updated_at = now();

insert into public.achievement_counters (user_id, counters, updated_at)
select u.user_id,
       jsonb_build_object('weekly_challenges_completed', s.cnt, 'weekly_challenge_best_streak', s.best),
       now()
from (select distinct user_id from public.weekly_challenge_completions) u,
     lateral public.weekly_challenge_shield_state(u.user_id) s
on conflict (user_id) do update
  set counters = public.achievement_counters.counters || excluded.counters,
      updated_at = now();

select public.refresh_achievement_rarity();

do $$ begin
  insert into public.schema_migrations (version) values ('0081_streak_shields')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
