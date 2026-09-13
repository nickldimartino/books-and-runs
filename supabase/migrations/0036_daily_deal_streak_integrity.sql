-- Books & Runs — server-verified Daily Deal streak integrity.
-- Run this once in the Supabase SQL editor, after 0001–0035, and after the
-- `solo-verify` Edge Function has been redeployed with Daily Deal support
-- (see supabase/functions/README.md) — until then, nothing ever inserts
-- into daily_deal_completions, and every account's streak would compute
-- to 0 the moment this trigger goes live.
--
-- The gap this closes: daily_deal_streak / daily_deal_best_streak /
-- daily_deal_last_played (migrations 0007-0008) have always been plain
-- client-writable columns on leaderboard_entries, self-reported the same
-- way every other column on that table is (see 0006's own doc) — a
-- signed-in account could push any streak number it wanted directly, with
-- nothing to check it against. Same fix as migration 0035 used for level/
-- XP: a small server-only table of ground truth, and a trigger that
-- silently recomputes the public columns from it on every write.

create table if not exists public.daily_deal_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The local calendar day (app/lib/dailyDealStore.ts's localDateKey) the
  -- deal was seeded from — not a UTC "today", since a calendar day is
  -- inherently a client-side concept; solo-verify checks it against its
  -- own clock with generous tolerance before ever inserting a row (see
  -- that function's isBelievableDailyDealDate).
  date date not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.daily_deal_completions enable row level security;

drop policy if exists "daily_deal_completions: owner read" on public.daily_deal_completions;
create policy "daily_deal_completions: owner read" on public.daily_deal_completions
  for select using (auth.uid() = user_id);
-- No insert/update/delete policy — only solo-verify's service-role client
-- ever writes this, same "zero client-facing RLS for the write side" idea
-- mp_game_state and (as of 0035) player_stats/achievement_counters use.

-- Recomputes the streak ending at the account's most recent completion (0
-- if there are none yet) and the longest streak ever seen, by walking every
-- completion in date order — the same "current streak" semantics
-- app/lib/dailyDealStore.ts's recordDailyDealResult already uses
-- (incrementing on a consecutive day, resetting to 1 otherwise), just
-- recomputed from the ground-truth table instead of trusted as a client-
-- maintained running total. A real player's history is small (at most one
-- row per calendar day they've ever played), so looping it per write is
-- cheap.
create or replace function public.sync_daily_deal_streak_truth()
returns trigger
language plpgsql
as $$
declare
  rec record;
  cur_streak int := 0;
  best_streak int := 0;
  last_date date := null;
  prev_date date := null;
begin
  for rec in
    select date from public.daily_deal_completions
    where user_id = new.user_id
    order by date asc
  loop
    if prev_date is not null and rec.date = prev_date + 1 then
      cur_streak := cur_streak + 1;
    else
      cur_streak := 1;
    end if;
    if cur_streak > best_streak then best_streak := cur_streak; end if;
    prev_date := rec.date;
    last_date := rec.date;
  end loop;

  new.daily_deal_streak := cur_streak;
  new.daily_deal_best_streak := best_streak;
  new.daily_deal_last_played := last_date;
  return new;
end;
$$;

drop trigger if exists sync_daily_deal_streak_truth on public.leaderboard_entries;
create trigger sync_daily_deal_streak_truth
  before insert or update of daily_deal_streak, daily_deal_best_streak, daily_deal_last_played
  on public.leaderboard_entries
  for each row execute function public.sync_daily_deal_streak_truth();

do $$ begin
  insert into public.schema_migrations (version) values ('0036_daily_deal_streak_integrity')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
