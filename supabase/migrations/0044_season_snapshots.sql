-- Books & Runs — seasonal (monthly) leaderboard.
-- Run this once in the Supabase SQL editor, after 0001–0043.
--
-- leaderboard_entries has always been purely cumulative (see 0006's own
-- doc) — there's no way to ask "who's been on fire *this month*," which is
-- exactly the kind of resettable, comparable-to-everyone-else ranking that
-- keeps a leaderboard worth checking back on. The all-time board stays
-- exactly as it is; this adds a second, resetting one alongside it.
--
-- Mechanism: once a month, snapshot every account's current (cumulative)
-- games_played/games_won from leaderboard_entries into this table, keyed by
-- the month it was taken. "This season" is then just today's cumulative
-- number minus that baseline — computed client-side (app/leaderboard/page.tsx),
-- the same place every other leaderboard sort/derivation already happens,
-- reading two tables that are both already public-readable. No new RPC, no
-- new Edge Function, no change to how games actually get recorded — this
-- table only ever reads leaderboard_entries, never writes to it.
--
-- Snapshots are taken from leaderboard_entries specifically (not
-- player_stats) because that's the one table these numbers are already
-- publicly compared from — a season is exactly as trustworthy as the
-- all-time board it resets against, not a separate, stronger guarantee.

create table if not exists public.season_snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The 1st of the month this snapshot was taken for, e.g. '2026-09-01' —
  -- a date, not a timestamp, so "this season" is a clean equality match
  -- against date_trunc('month', now())::date rather than a range query.
  season_start date not null,
  games_played integer not null default 0,
  games_won integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, season_start)
);

alter table public.season_snapshots enable row level security;

drop policy if exists "season_snapshots: any signed-in user can read" on public.season_snapshots;
create policy "season_snapshots: any signed-in user can read" on public.season_snapshots
  for select using (auth.role() = 'authenticated');
-- No insert/update/delete policy — only snapshot_season_start() below
-- (run as its owner, postgres, which bypasses RLS) ever writes this.

-- One row per account per month, taken from that account's current
-- cumulative totals. `on conflict do nothing` makes this idempotent within
-- a month — re-running it (the one-time backfill below, or a cron retry)
-- can never overwrite an already-taken baseline with a later, higher
-- number, which would silently erase part of that month's ranking.
create or replace function public.snapshot_season_start()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.season_snapshots (user_id, season_start, games_played, games_won)
  select user_id, date_trunc('month', now())::date, games_played, games_won
  from public.leaderboard_entries
  on conflict (user_id, season_start) do nothing;
end;
$$;

revoke execute on function public.snapshot_season_start() from anon, public, authenticated;

-- Backfill this month's baseline right now, so existing accounts have a
-- season to rank in immediately instead of showing 100% of their all-time
-- total as "this month" until the 1st rolls around again.
select public.snapshot_season_start();

-- pg_cron ships with Supabase but has to be enabled per-project (Database
-- → Extensions → pg_cron) — same caveat as 0014/0029/0038's own cron jobs.
-- Runs a few minutes after midnight UTC on the 1st, comfortably before
-- anyone in any timezone has played much that day.
do $$
begin
  perform cron.schedule(
    'season-snapshot-monthly',
    '5 0 1 * *',
    $cron$ select public.snapshot_season_start(); $cron$
  );
exception
  when undefined_function or undefined_table or invalid_schema_name then
    raise notice 'pg_cron not enabled — enable it and re-run the cron.schedule block, or call snapshot_season_start() manually on the 1st of each month.';
end;
$$;

do $$ begin
  insert into public.schema_migrations (version) values ('0044_season_snapshots')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
