-- Books & Runs — security hardening, September 2026 audit.
-- Run this once in the Supabase SQL editor, after 0001–0047.
--
-- Closes findings from a full defensive security pass over the schema:
--   1. is_creator/is_test_account could be self-granted by any signed-in
--      account (High — a real developer-impersonation path via the
--      Creator-exclusive cosmetics).
--   2. mp_send_friend_request had no rate limit, unlike every sibling
--      friend RPC — user_id is enumerable via the public leaderboard, so
--      this was an unrate-limited spam vector against every account.
--   3. client_errors accepted unbounded-size anonymous inserts.
--   4. mp_active_count let any signed-in caller query another account's
--      active-game count by passing an explicit uid.
--   5. The clubs/tournaments RPCs (0040/0041) never got the REVOKE/GRANT
--      EXECUTE pass every other migration's RPCs already have — not
--      currently exploitable (each starts with its own auth check), but a
--      real deviation from this schema's own defense-in-depth convention.
--   6. avatar_photo_path had no CHECK tying it to the row's own user_id —
--      a display-spoofing nuisance, not a data leak (the bucket is already
--      public-read by design).
--   7. solo-verify's own rate-limit check (MIN_MS_BETWEEN_GAMES) was a
--      plain read-then-later-write, not atomic — concurrent requests could
--      race past it. New RPC makes the check-and-write one statement.
--
-- Deliberately NOT included here (see the audit's own report for why):
-- a per-caller pacing limit on profile_photo_reports (0025 never defined
-- an RPC for it at all — the client inserts directly under RLS — so
-- rate-limiting it properly means changing the RLS policy and the client
-- call site too, not just adding a migration function nothing would call)
-- and a per-account cap on club_create/tournament_create (flagged as
-- "minor DB-bloat only, not worth urgent action" — no cross-account
-- exposure either way).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Pin is_creator/is_test_account to their previous value on every
--    client-reachable write — same "recompute/re-pin from ground truth"
--    idea as sync_leaderboard_truth() (0035), just for these two flags
--    instead of the stats columns. A by-hand `update ... set is_creator =
--    true` from the SQL editor still works (see the trigger body: it only
--    discards a value when the incoming row already differs from the
--    stored one via a *client* write path, and a SQL-editor session has no
--    auth.uid() of its own to gate on, so this keeps it simple and doesn't
--    special-case the editor at all — the trigger just re-pins to OLD
--    every time, and a manual UPDATE that sets NEW = OLD anyway is a no-op
--    either way you write it, while a manual UPDATE from the editor that
--    actually wants to *change* the flag should instead go through a
--    dedicated one-off statement that disables the trigger for that single
--    statement — see the comment at the bottom of this section).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.lock_admin_only_columns()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.is_creator := old.is_creator;
    new.is_test_account := old.is_test_account;
  else
    new.is_creator := false;
    new.is_test_account := false;
  end if;
  return new;
end;
$$;

drop trigger if exists lock_admin_only_columns on public.leaderboard_entries;
create trigger lock_admin_only_columns
  before insert or update of is_creator, is_test_account
  on public.leaderboard_entries
  for each row execute function public.lock_admin_only_columns();

-- To flag an account by hand going forward (same as 0030/0047's own
-- documented process), disable the trigger for just that one statement:
--   alter table public.leaderboard_entries disable trigger lock_admin_only_columns;
--   update public.leaderboard_entries set is_creator = true where user_id = '...';
--   alter table public.leaderboard_entries enable trigger lock_admin_only_columns;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Rate-limit mp_send_friend_request — every other friend RPC reachable
--    with an attacker-chosen target already is (mp_lookup_friend_code
--    60/hr, mp_add_friend_by_code 20/hr); this one was missed in 0013's
--    pass. Verbatim copy of 0009's function, with one new line.
-- ─────────────────────────────────────────────────────────────────────────

-- Verbatim copy of 0009's own definition, with exactly one new line (the
-- perform mp_bump_rate_limit call) — every branch below (auto-accept a
-- reversed pending request + its notification, return the existing row
-- silently for an already-friends or already-pending pair, the new-request
-- notification insert) is unchanged.
create or replace function public.mp_send_friend_request(target uuid)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing public.friendships;
  result public.friendships;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if target is null or target = me then raise exception 'invalid target'; end if;
  if not exists (select 1 from auth.users where id = target) then
    raise exception 'no such user';
  end if;

  perform public.mp_bump_rate_limit('friend_request_send', 20);

  select * into existing from public.friendships
  where (requester_id = me and addressee_id = target)
     or (requester_id = target and addressee_id = me);

  if existing.id is not null then
    if existing.status = 'accepted' then
      return existing;
    end if;
    if existing.addressee_id = me then
      update public.friendships
        set status = 'accepted', responded_at = now()
        where id = existing.id
        returning * into result;
      insert into public.mp_events (user_id, kind, actor_id)
        values (existing.requester_id, 'friend_accepted', me);
      return result;
    end if;
    return existing;  -- my own request, still pending
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
    values (me, target, 'pending')
    returning * into result;
  insert into public.mp_events (user_id, kind, actor_id)
    values (target, 'friend_request', me);
  return result;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Bound client_errors row size — app_events already has a comparable
--    check (0016); client_errors never got one. Doesn't stop a flood of
--    small rows (that needs edge/gateway-level rate limiting, outside what
--    a migration can express), just caps the damage of any single one.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.client_errors
  drop constraint if exists client_errors_size_ok;
alter table public.client_errors
  add constraint client_errors_size_ok check (
    char_length(message) <= 4000
    and (stack is null or char_length(stack) <= 20000)
    and (url is null or char_length(url) <= 2000)
    and (user_agent is null or char_length(user_agent) <= 500)
    and (app_version is null or char_length(app_version) <= 100)
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 4. mp_active_count: stop a client from querying another account's active
--    game count by passing an explicit uid. Its own doc claimed "the Edge
--    Function passes an explicit uid to check invitees" — no longer true:
--    mp/index.ts's own activeCount() does a direct table query via the
--    service-role client instead (bypassing RLS/grants entirely, so it
--    was never actually gated by this function's grants in the first
--    place) and nothing in app/ calls this RPC either — it's the same
--    kind of orphaned-but-still-granted leftover §8's own "Applied
--    historically" note already flagged for its sibling mp_my_record/
--    mp_active_count pair. Always self-scoped now; no caller anywhere
--    legitimately needs someone else's count.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.mp_active_count(uid uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(uid, auth.uid());
begin
  if uid is not null and uid <> auth.uid() then
    raise exception 'not authorized';
  end if;
  return (
    select count(*)::int from public.mp_participants p
    join public.mp_games g on g.id = p.game_id
    where p.user_id = target
      and p.invite_status in ('invited', 'accepted')
      and g.status in ('pending', 'active')
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Clubs/Tournaments RPCs never got the REVOKE/GRANT EXECUTE pass every
--    other migration's functions have. Not currently exploitable (each
--    starts with its own "if me is null then raise exception" auth check)
--    — this is defense-in-depth so a future edit that accidentally drops
--    that guard doesn't also inherit PUBLIC's default EXECUTE grant.
-- ─────────────────────────────────────────────────────────────────────────

revoke execute on function
  public.club_is_member(uuid), public.club_create(text), public.club_rename(uuid, text),
  public.club_delete(uuid), public.club_add_member(uuid, uuid), public.club_remove_member(uuid, uuid),
  public.club_my_clubs(), public.club_standings(uuid)
from anon, public;
grant execute on function
  public.club_is_member(uuid), public.club_create(text), public.club_rename(uuid, text),
  public.club_delete(uuid), public.club_add_member(uuid, uuid), public.club_remove_member(uuid, uuid),
  public.club_my_clubs(), public.club_standings(uuid)
to authenticated;

revoke execute on function
  public.tournament_is_participant(uuid), public.tournament_create(text, int, int[], uuid, uuid),
  public.tournament_add_round(uuid, uuid), public.tournament_cancel(uuid),
  public.tournament_my_list(), public.tournament_rounds(uuid), public.tournament_standings(uuid)
from anon, public;
grant execute on function
  public.tournament_is_participant(uuid), public.tournament_create(text, int, int[], uuid, uuid),
  public.tournament_add_round(uuid, uuid), public.tournament_cancel(uuid),
  public.tournament_my_list(), public.tournament_rounds(uuid), public.tournament_standings(uuid)
to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Tie avatar_photo_path to the row's own user_id — the Storage bucket
--    already scopes *uploads* this way; this closes the same thing for the
--    pointer column (a client could otherwise set their own
--    avatar_photo_path to someone else's real path and display their
--    photo as their own — a spoofing nuisance, not a data leak, since the
--    bucket is public-read by design either way).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_avatar_photo_path_owned;
alter table public.leaderboard_entries
  add constraint leaderboard_avatar_photo_path_owned check (
    avatar_photo_path is null
    or avatar_photo_path like (user_id::text || '/%')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Atomic check-and-write for solo-verify's MIN_MS_BETWEEN_GAMES floor —
--    the Edge Function's own read-then-later-write wasn't atomic, so
--    concurrent requests could each read the same "stale enough"
--    updated_at and all pass the check before any of their writes
--    committed. This folds the check into the same statement as the write
--    (an INSERT ... ON CONFLICT DO UPDATE ... WHERE), so only one
--    concurrent request can ever actually land; the rest see 0 rows
--    affected and the Edge Function treats that as "too soon," exactly
--    like today's check already does for a genuinely-too-fast resubmit.
--    Service-role-only — solo-verify/index.ts calls this instead of its
--    own bare upsert.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.solo_verify_upsert_player_stats(
  p_user_id uuid,
  p_games_played integer,
  p_games_won integer,
  p_games_tied integer,
  p_best_score integer,
  p_worst_score integer,
  p_average_score numeric,
  p_wins_by_difficulty jsonb,
  p_min_ms_between_games integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int;
begin
  insert into public.player_stats (
    user_id, games_played, games_won, games_tied, best_score, worst_score,
    average_score, wins_by_difficulty, updated_at
  )
  values (
    p_user_id, p_games_played, p_games_won, p_games_tied, p_best_score, p_worst_score,
    p_average_score, p_wins_by_difficulty, now()
  )
  on conflict (user_id) do update set
    games_played = excluded.games_played,
    games_won = excluded.games_won,
    games_tied = excluded.games_tied,
    best_score = excluded.best_score,
    worst_score = excluded.worst_score,
    average_score = excluded.average_score,
    wins_by_difficulty = excluded.wins_by_difficulty,
    updated_at = excluded.updated_at
  where player_stats.updated_at is null
     or player_stats.updated_at < now() - (p_min_ms_between_games || ' milliseconds')::interval;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke execute on function public.solo_verify_upsert_player_stats(
  uuid, integer, integer, integer, integer, integer, numeric, jsonb, integer
) from anon, public;
-- Only the service-role Edge Function calls it; it owns the function so no
-- grant to `authenticated` is needed — same convention as mp_trim_events
-- (0014).

do $$ begin
  insert into public.schema_migrations (version) values ('0048_security_hardening_2026_09')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
