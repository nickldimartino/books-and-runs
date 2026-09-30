-- Books & Runs — a skill rating for human-vs-human multiplayer, distinct
-- from level/XP (which reward time spent, not skill — someone who's played
-- 500 easy games outranks someone who's won 50 hard ones on the existing
-- leaderboard). Plain Elo, not Glicko-2 — simpler to implement correctly
-- and still a real improvement over "no rating at all." Run this once,
-- after 0001-0096.
--
-- Unlike mp_games_played/mp_games_won/mp_best_win_streak (migration 0050),
-- this can't use the "let the client write anything, then silently
-- overwrite it with a recomputed truth" pattern those columns use as-is —
-- Elo is path-dependent (each game's delta depends on the rating going
-- into it), not a stateless aggregate a trigger can cheaply re-derive from
-- mp_games/mp_participants on every touch. Same *shape* of protection,
-- adapted: the trigger below restores whatever was already there instead
-- of recomputing a fresh value, for any caller except the `mp` Edge
-- Function's own service-role client (auth.role() = 'service_role').
--
-- A column-level `revoke update (...) ... from authenticated` was tried
-- first and verified (scratch Postgres) to NOT actually block anything:
-- Postgres tracks a table-level UPDATE grant separately from column-level
-- privileges, so revoking just the two rating columns while a table-level
-- grant still exists is a no-op — the table-level grant alone is enough to
-- let a client write any column, including ones a later column-revoke
-- named. The trigger below doesn't depend on knowing (or not breaking) the
-- table's full existing grant shape, which a correct fix via grants would
-- have required auditing across every prior migration that added a
-- client-writable column to this table.

alter table public.leaderboard_entries
  add column if not exists mp_rating integer not null default 1200,
  add column if not exists mp_rated_games integer not null default 0;

create or replace function public.protect_mp_rating()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new; -- the mp Edge Function's own writes go through untouched
  end if;
  new.mp_rating := old.mp_rating;
  new.mp_rated_games := old.mp_rated_games;
  return new;
end;
$$;

drop trigger if exists protect_mp_rating on public.leaderboard_entries;
create trigger protect_mp_rating
  before update of mp_rating, mp_rated_games on public.leaderboard_entries
  for each row execute function public.protect_mp_rating();

-- Add "mp_rating" as a leaderboard_ranked() sort option (0063) — same
-- p_mp_min_games gate mp_win_rate already uses, so a single lucky rated
-- game can't top the board; an account under that threshold sorts last,
-- same convention every other gated sort here already follows.
create or replace function public.leaderboard_ranked(
  p_sort text,
  p_season boolean,
  p_friends_only boolean,
  p_min_games int,
  p_mp_min_games int
)
returns table (rank bigint, total bigint, entry jsonb)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  me uuid := auth.uid();
  this_season date := date_trunc('month', now())::date;
begin
  if me is null then raise exception 'not authenticated'; end if;

  return query
  with base as (
    select
      le.user_id,
      le.level,
      le.total_xp,
      le.achievements_unlocked,
      le.average_score,
      le.worst_score,
      le.daily_deal_streak,
      le.daily_deal_best_streak,
      coalesce(le.mp_games_won, 0) as mp_won,
      coalesce(le.mp_games_played, 0) as mp_played,
      coalesce(le.mp_best_win_streak, 0) as mp_streak,
      coalesce(le.mp_rating, 1200) as mp_rating,
      coalesce(le.mp_rated_games, 0) as mp_rated_games,
      case when p_season then greatest(0, le.games_played - coalesce(ss.games_played, 0)) else le.games_played end as gp,
      case when p_season then greatest(0, le.games_won - coalesce(ss.games_won, 0)) else le.games_won end as gw,
      to_jsonb(le) as j
    from public.leaderboard_entries le
    left join public.season_snapshots ss
      on ss.user_id = le.user_id and ss.season_start = this_season
    where not le.is_test_account
      and (le.games_played > 0 or le.daily_deal_best_streak > 0)
      and (le.user_id = me or not public.is_blocked_pair(me, le.user_id))
      and (
        not p_friends_only
        or le.user_id = me
        or exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.requester_id = me and f.addressee_id = le.user_id)
              or (f.addressee_id = me and f.requester_id = le.user_id))
        )
      )
  ),
  live as (
    select * from base where not p_season or gp > 0
  ),
  scored as (
    select
      b.*,
      case p_sort
        when 'achievements' then b.achievements_unlocked::numeric
        when 'total_xp' then b.total_xp::numeric
        when 'win_rate' then case when b.gp < p_min_games or b.gp = 0 then -1e9 else b.gw::numeric / b.gp end
        when 'average_score' then case when b.average_score is null then -1e9 else -b.average_score::numeric end
        when 'games_played' then b.gp::numeric
        when 'games_won' then b.gw::numeric
        when 'worst_score' then case when b.worst_score is null then -1e9 else b.worst_score::numeric end
        when 'daily_deal_streak' then b.daily_deal_streak::numeric
        when 'daily_deal_best_streak' then b.daily_deal_best_streak::numeric
        when 'mp_games_won' then b.mp_won::numeric
        when 'mp_win_rate' then case when b.mp_played < p_mp_min_games or b.mp_played = 0 then -1e9 else b.mp_won::numeric / b.mp_played end
        when 'mp_best_win_streak' then b.mp_streak::numeric
        when 'mp_rating' then case when b.mp_rated_games < p_mp_min_games then -1e9 else b.mp_rating::numeric end
        else b.level::numeric
      end as sv
    from live b
  )
  select
    row_number() over (order by s.sv desc, s.level desc, s.total_xp desc, s.user_id) as rank,
    count(*) over () as total,
    (s.j || jsonb_build_object('games_played', s.gp, 'games_won', s.gw)) as entry
  from scored s;
end;
$$;

-- `create or replace function` preserves whatever privileges the original
-- 0063 definition already had (a client can only reach this through
-- leaderboard_page()/leaderboard_my_row(), both security definer and owned
-- by the migration-running role, same as before) — nothing to re-grant or
-- re-revoke here.

insert into public.schema_migrations (version) values ('0097_mp_skill_rating')
on conflict (version) do nothing;
