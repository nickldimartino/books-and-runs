-- Books & Runs — server-side leaderboard: sorting, paging, "around me".
-- Run once in the Supabase SQL editor, after 0062.
--
-- The app used to `select *` every row of leaderboard_entries and sort in the
-- browser. PostgREST silently caps a response at 1000 rows, so past ~1000
-- active accounts the board would truncate AND mis-rank, and every viewer
-- downloaded every row. These RPCs rank on the server (same sort keys and tie
-- rules as app/leaderboard/page.tsx had) and return one page at a time:
--
--   leaderboard_page(...)    — rows [offset, offset+limit) of the ranking,
--                              each with its true rank and the total count
--   leaderboard_my_row(...)  — the caller's own row with its rank (for a
--                              "You are #N of M" strip that works no matter
--                              which page is showing)
--
-- Both honour: the "This month" season view (games_played/games_won as a
-- delta against season_snapshots, like the client did), the friends-only
-- scope, test-account exclusion (0047), the "has real activity" bar, and
-- BLOCKS (0060): a blocked pair never appears on each other's board.
--
-- Old clients keep working: they still read leaderboard_entries directly.

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

revoke execute on function public.leaderboard_ranked(text, boolean, boolean, int, int) from anon, public, authenticated;

create or replace function public.leaderboard_page(
  p_sort text default 'level',
  p_season boolean default false,
  p_friends_only boolean default false,
  p_offset int default 0,
  p_limit int default 50,
  p_min_games int default 5,
  p_mp_min_games int default 5
)
returns table (rank bigint, total bigint, entry jsonb)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return query
    select r.rank, r.total, r.entry
    from public.leaderboard_ranked(p_sort, p_season, p_friends_only, p_min_games, p_mp_min_games) r
    order by r.rank
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

create or replace function public.leaderboard_my_row(
  p_sort text default 'level',
  p_season boolean default false,
  p_friends_only boolean default false,
  p_min_games int default 5,
  p_mp_min_games int default 5
)
returns table (rank bigint, total bigint, entry jsonb)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return query
    select r.rank, r.total, r.entry
    from public.leaderboard_ranked(p_sort, p_season, p_friends_only, p_min_games, p_mp_min_games) r
    where (r.entry ->> 'user_id')::uuid = auth.uid();
end;
$$;

revoke execute on function
  public.leaderboard_page(text, boolean, boolean, int, int, int, int),
  public.leaderboard_my_row(text, boolean, boolean, int, int)
  from anon, public;
grant execute on function
  public.leaderboard_page(text, boolean, boolean, int, int, int, int),
  public.leaderboard_my_row(text, boolean, boolean, int, int)
  to authenticated;

do $$ begin
  insert into public.schema_migrations (version) values ('0063_leaderboard_rpc')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
