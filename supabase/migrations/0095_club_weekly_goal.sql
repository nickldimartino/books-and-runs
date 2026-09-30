-- Books & Runs — a club weekly goal: clubs were a shared scoreboard, not a
-- group with something to actually do together (Clash Royale clan wars,
-- Pokémon GO gyms — every real "clan" feature gives the group a common
-- target, not just a ranked list of each other). Run this once, after
-- 0001–0040 (needs clubs/club_members/mp_games/mp_participants).
--
-- Sums each member's own completed multiplayer games this ISO week (Monday
-- 00:00 UTC — `date_trunc('week', ...)` already uses that boundary, the
-- same convention app/lib/weeklyChallengeStore.ts's isoWeekKey uses) against
-- a fixed weekly target. No new anti-cheat surface: every number summed is
-- already server-verified (mp_games.completed_at, mp_participants), this
-- just adds them up for a roster instead of one account.

create or replace function public.club_goal_progress(p_club_id uuid)
returns table (games_this_week int, goal_target int, week_start timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Fixed rather than per-club-configurable — simplest version that's
  -- still a real shared target. Revisit if clubs want to set their own.
  target constant int := 20;
begin
  if not public.club_is_member(p_club_id) then
    raise exception 'not a member of this club';
  end if;
  return query
    select
      count(*)::int,
      target,
      date_trunc('week', now())
    from public.club_members m
    join public.mp_participants p on p.user_id = m.user_id
    join public.mp_games g on g.id = p.game_id
    where m.club_id = p_club_id
      and g.status = 'complete'
      and g.completed_at >= date_trunc('week', now());
end;
$$;

revoke all on function public.club_goal_progress(uuid) from public;
grant execute on function public.club_goal_progress(uuid) to authenticated;

insert into public.schema_migrations (version) values ('0095_club_weekly_goal')
on conflict (version) do nothing;
