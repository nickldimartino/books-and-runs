-- Books & Runs — observability: applied-migration tracking, client error
-- capture, and anonymous aggregate product events.
-- Run once in the Supabase SQL editor, after 0001–0015.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. schema_migrations — a record of which .sql files have been run.
--    supabase/migrations/ is hand-applied; this + scripts/migrations.md is
--    the only way to know a project's actual state. Insert a row after
--    running each file (the tail of every migration from here on does it).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
-- No policies — inspected only from the SQL editor / service role.

-- Backfill everything up to and including this file.
insert into public.schema_migrations (version) values
  ('0001_init'), ('0002_achievements'), ('0003_worst_score'), ('0004_games_tied'),
  ('0005_winner_score'), ('0006_leaderboard'), ('0007_daily_deal_streak'),
  ('0008_daily_deal_last_played'), ('0009_friends'), ('0010_multiplayer'),
  ('0011_multiplayer_stats'), ('0012_friend_share'), ('0013_security_hardening'),
  ('0014_mp_housekeeping'), ('0015_solo_save_sync'), ('0016_observability')
on conflict (version) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. client_errors — uncaught client-side errors, so production failures
--    aren't invisible. Anyone (signed in or not) may INSERT their own
--    error; nobody may read (inspected from the SQL editor).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  message text not null,
  stack text,
  source text,          -- 'error-boundary' | 'global-error' | 'window.onerror' | 'unhandledrejection'
  url text,
  user_agent text,
  app_version text
);

create index if not exists client_errors_recent on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

-- Insert-only, and only your own row (or an anonymous one). No read/update/
-- delete for clients.
create policy "client_errors: anyone may report" on public.client_errors
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- Trim aggressively — this is a firehose, not an archive.
create or replace function public.trim_client_errors()
returns void language sql security definer set search_path = public as $$
  delete from public.client_errors where created_at < now() - interval '30 days';
$$;
revoke execute on function public.trim_client_errors() from anon, public, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. app_events — anonymous aggregate product events. NO user_id, no
--    session id, no PII: a row is just "a game_started with difficulty=hard
--    happened". Used to answer "which difficulty is most played / what's the
--    completion rate", nothing that identifies a person. Insert-only for
--    everyone; unreadable by clients.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null,           -- 'game_started' | 'game_completed' | 'mp_game_created' | 'daily_deal_played' | ...
  props jsonb not null default '{}'::jsonb   -- small, non-identifying: {difficulty, players, mode, rounds}
);

create index if not exists app_events_name_time on public.app_events (name, created_at desc);

alter table public.app_events enable row level security;

create policy "app_events: anyone may record" on public.app_events
  for insert to anon, authenticated
  with check (
    char_length(name) <= 64
    and pg_column_size(props) < 2048
  );

create or replace function public.trim_app_events()
returns void language sql security definer set search_path = public as $$
  delete from public.app_events where created_at < now() - interval '400 days';
$$;
revoke execute on function public.trim_app_events() from anon, public, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Fold the two new trims into the existing daily housekeeping job (0014).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.mp_housekeeping()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.mp_events where created_at < now() - interval '30 days';
  delete from public.mp_rate_limit where window_start < now() - interval '2 days';

  delete from public.mp_events e
  using (
    select user_id, id,
           row_number() over (partition by user_id order by created_at desc) as rn
    from public.mp_events
  ) ranked
  where e.id = ranked.id and ranked.rn > 60;

  perform public.trim_client_errors();
  perform public.trim_app_events();
end;
$$;
revoke execute on function public.mp_housekeeping() from anon, public, authenticated;
