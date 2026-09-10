-- Books & Runs — Multiplayer stats (for the Profile page, the leaderboard,
-- and the new multiplayer achievement families).
-- Run once in the Supabase SQL editor, after 0010_multiplayer.sql.
--
--   • mp_my_stats()  — everything the Profile card / achievements need,
--                      computed from mp_participants + mp_games (the
--                      outcomes are stamped by the Edge Function, so this
--                      is an honest source, not client-reported).
--   • leaderboard_entries gains mp_* columns, self-reported the same way
--                      every other column on that table already is (see
--                      0006's header) — filled by syncLeaderboardStats.

alter table public.leaderboard_entries
  add column if not exists mp_games_played integer not null default 0,
  add column if not exists mp_games_won integer not null default 0,
  add column if not exists mp_best_win_streak integer not null default 0;

-- All of one account's completed-multiplayer numbers.
create or replace function public.mp_my_stats()
returns table (
  played int,
  won int,
  lost int,
  current_win_streak int,
  best_win_streak int,
  podiums int,
  biggest_table_beaten int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r record;
  cur int := 0;          -- current streak (unbroken from the most recent game)
  best int := 0;
  running int := 0;      -- rolling consecutive-wins counter, for best
  streak_live boolean := true;
  p_played int := 0;
  p_won int := 0;
  p_lost int := 0;
  p_podiums int := 0;
  p_biggest int := 0;
  my_score numeric;
  n_seats int;
  better int;
begin
  if me is null then raise exception 'not authenticated'; end if;

  for r in
    select g.seats, g.cumulative_scores, p.seat, p.outcome
    from public.mp_games g
    join public.mp_participants p on p.game_id = g.id and p.user_id = me
    where g.status = 'complete'
    order by g.completed_at desc nulls last
  loop
    p_played := p_played + 1;

    if r.outcome = 'won' then
      p_won := p_won + 1;
      running := running + 1;
      if running > best then best := running; end if;
      if streak_live then cur := cur + 1; end if;
    else
      p_lost := p_lost + 1;
      running := 0;
      streak_live := false;
    end if;

    -- finishing position from this game's cumulative scores
    my_score := (r.cumulative_scores ->> r.seat::text)::numeric;
    n_seats := coalesce(jsonb_array_length(r.seats), 2);
    if my_score is not null then
      select count(*) into better
      from jsonb_each_text(r.cumulative_scores) e
      where e.value::numeric < my_score;
      if better + 1 <= ceil(n_seats / 2.0) then
        p_podiums := p_podiums + 1;
      end if;
    end if;

    if r.outcome = 'won' and n_seats > p_biggest then
      p_biggest := n_seats;
    end if;
  end loop;

  return query select p_played, p_won, p_lost, cur, best, p_podiums, p_biggest;
end;
$$;

revoke execute on function public.mp_my_stats() from anon, public;
grant execute on function public.mp_my_stats() to authenticated;
