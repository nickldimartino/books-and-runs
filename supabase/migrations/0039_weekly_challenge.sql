-- Books & Runs — the Weekly Challenge (Daily Deal's bigger, harder sibling).
-- Run this once in the Supabase SQL editor, after 0001–0038, and after the
-- `solo-verify` Edge Function has been redeployed with Weekly Challenge
-- support — until then, nothing ever inserts into
-- weekly_challenge_completions, and every account's streak computes to 0
-- the moment this trigger goes live (same rollout note as migration 0036).
--
-- Same server-verified-streak shape as Daily Deal (migrations 0007/0008 for
-- the original client-writable columns, 0036 for closing that hole) — built
-- server-verified from day one rather than repeating that history: a small
-- ground-truth table `solo-verify` alone writes to, and a trigger that
-- recomputes the public streak columns on leaderboard_entries from it on
-- every write, so those columns can never be pushed directly by a client.

create table if not exists public.weekly_challenge_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- ISO 8601 week, "YYYY-Www" (weeklyChallengeStore.ts's isoWeekKey) — the
  -- week the challenge was seeded from. Text, not a native date type: an
  -- ISO week has no single calendar date to anchor it to.
  week text not null check (week ~ '^\d{4}-W\d{2}$'),
  completed_at timestamptz not null default now(),
  primary key (user_id, week)
);

alter table public.weekly_challenge_completions enable row level security;

drop policy if exists "weekly_challenge_completions: owner read" on public.weekly_challenge_completions;
create policy "weekly_challenge_completions: owner read" on public.weekly_challenge_completions
  for select using (auth.uid() = user_id);
-- No insert/update/delete policy — only solo-verify's service-role client
-- ever writes this, same as daily_deal_completions.

alter table public.leaderboard_entries
  add column if not exists weekly_challenge_streak int not null default 0,
  add column if not exists weekly_challenge_best_streak int not null default 0,
  add column if not exists weekly_challenge_last_played text;

-- Recomputes the streak ending at the account's most recently completed
-- week (0 if none yet) and the longest streak ever seen, by walking every
-- completion in week order — same "current streak" semantics
-- weeklyChallengeStore.ts's recordWeeklyChallengeResult already uses,
-- recomputed from the ground-truth table instead of trusted as a client-
-- maintained running total. String comparison/ordering on "YYYY-Www" sorts
-- correctly year-then-week as long as the week is always zero-padded to 2
-- digits (isoWeekKey always does; the CHECK constraint above enforces the
-- shape) — this only ever needs *an* ordering, not date arithmetic, since
-- "consecutive" here means "the immediately preceding row in this account's
-- own list," not a fixed calendar gap.
create or replace function public.sync_weekly_challenge_streak_truth()
returns trigger
language plpgsql
as $$
declare
  rec record;
  cur_streak int := 0;
  best_streak int := 0;
  last_week text := null;
  prev_week text := null;
  prev_year int;
  prev_wk int;
  this_year int;
  this_wk int;
  is_consecutive boolean;
begin
  for rec in
    select week from public.weekly_challenge_completions
    where user_id = new.user_id
    order by week asc
  loop
    is_consecutive := false;
    if prev_week is not null then
      prev_year := split_part(prev_week, '-W', 1)::int;
      prev_wk := split_part(prev_week, '-W', 2)::int;
      this_year := split_part(rec.week, '-W', 1)::int;
      this_wk := split_part(rec.week, '-W', 2)::int;
      -- Same year, next week number — the common case.
      if this_year = prev_year and this_wk = prev_wk + 1 then
        is_consecutive := true;
      -- Year rolled over: last week of prev_year (52 or 53) into week 1 of
      -- this_year. Both 52->1 and 53->1 count — not worth pinning down
      -- which years actually have 53 ISO weeks just for this check.
      elsif this_year = prev_year + 1 and this_wk = 1 and prev_wk >= 52 then
        is_consecutive := true;
      end if;
    end if;

    if is_consecutive then
      cur_streak := cur_streak + 1;
    else
      cur_streak := 1;
    end if;
    if cur_streak > best_streak then best_streak := cur_streak; end if;
    prev_week := rec.week;
    last_week := rec.week;
  end loop;

  new.weekly_challenge_streak := cur_streak;
  new.weekly_challenge_best_streak := best_streak;
  new.weekly_challenge_last_played := last_week;
  return new;
end;
$$;

drop trigger if exists sync_weekly_challenge_streak_truth on public.leaderboard_entries;
create trigger sync_weekly_challenge_streak_truth
  before insert or update of weekly_challenge_streak, weekly_challenge_best_streak, weekly_challenge_last_played
  on public.leaderboard_entries
  for each row execute function public.sync_weekly_challenge_streak_truth();

do $$ begin
  insert into public.schema_migrations (version) values ('0039_weekly_challenge')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
