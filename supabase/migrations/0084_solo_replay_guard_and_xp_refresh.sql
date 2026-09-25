-- Books & Runs — solo-verify follow-ups from the 2026-09-25 live test.
-- Run BEFORE redeploying `solo-verify` (the function starts using both).
--
-- 1. solo_game_hashes: an already-verified move log resubmitted after the 10 s
--    pacing floor used to count again (games_played +1 each time). solo-verify
--    now records a SHA-256 of (seed, seat config without names, contracts,
--    move log) once a game has been credited, and answers a repeat with a
--    harmless `tracked: false, duplicate: true`. Seeds are random per game, so
--    two genuinely different games never collide; Daily Deal / Weekly Challenge
--    completions are unaffected (they have their own once-per-day/week rows).
--    Service-role only (RLS on, no policies).
-- 2. refresh_leaderboard_truth(uid): leaderboard_entries.total_xp only
--    refreshed when the client next wrote its own row, so XP credited by the
--    server (daily/weekly/streak/quests) showed stale on the board.
--    compute_total_xp() insists auth.uid() = the user, so the function sets the
--    caller-identity claims for the duration of one no-op UPDATE that fires the
--    existing sync_leaderboard_truth trigger (which recomputes level, total_xp
--    and the stats columns from server truth). solo-verify calls it after every
--    credit. Service-role only; no-op for accounts with no leaderboard row.

create table if not exists public.solo_game_hashes (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_hash text not null check (char_length(game_hash) = 64),
  created_at timestamptz not null default now(),
  primary key (user_id, game_hash)
);

alter table public.solo_game_hashes enable row level security;
-- No policies: only solo-verify's service-role client touches it.

create or replace function public.refresh_leaderboard_truth(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prev_sub text := current_setting('request.jwt.claim.sub', true);
  prev_claims text := current_setting('request.jwt.claims', true);
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  update public.leaderboard_entries set total_xp = total_xp where user_id = p_user;
  perform set_config('request.jwt.claim.sub', coalesce(prev_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(prev_claims, ''), true);
end;
$$;

revoke execute on function public.refresh_leaderboard_truth(uuid) from anon, authenticated, public;

do $$ begin
  insert into public.schema_migrations (version) values ('0084_solo_replay_guard_and_xp_refresh')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
