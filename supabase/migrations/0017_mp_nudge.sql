-- Books & Runs — "nudge" a player whose turn it's been for a while.
-- Run once in the Supabase SQL editor, after 0001–0016.
--
-- The other player gets a fresh `your_turn` event (their badge bumps). No
-- auto-anything — a participant chooses to send it, and it's rate-limited
-- to a handful per game so it can't become spam.

create or replace function public.mp_nudge(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  g record;
  n_recent int;
begin
  if me is null then raise exception 'not authenticated'; end if;

  -- Caller must be an accepted participant of an active game.
  if not exists (
    select 1 from public.mp_participants
    where game_id = p_game_id and user_id = me and invite_status = 'accepted'
  ) then
    raise exception 'not your game';
  end if;

  select status, turn_user_id, updated_at into g
  from public.mp_games where id = p_game_id;

  if g.status <> 'active' then raise exception 'game is not active'; end if;
  if g.turn_user_id is null or g.turn_user_id = me then
    raise exception 'nothing to nudge';
  end if;

  -- Per-caller rate limit (reuses 0013's helper): a few nudges an hour.
  perform public.mp_bump_rate_limit('mp_nudge', 8);

  -- And don't pile on: at most one nudge per game per 6h regardless of who sent it.
  select count(*) into n_recent
  from public.mp_events
  where game_id = p_game_id and kind = 'nudge' and created_at > now() - interval '6 hours';
  if n_recent > 0 then raise exception 'already nudged recently'; end if;

  insert into public.mp_events (user_id, kind, game_id, actor_id)
    values (g.turn_user_id, 'your_turn', p_game_id, me);
  insert into public.mp_events (user_id, kind, game_id, actor_id)
    values (g.turn_user_id, 'nudge', p_game_id, me);
end;
$$;

revoke execute on function public.mp_nudge(uuid) from anon, public;
grant execute on function public.mp_nudge(uuid) to authenticated;

do $$ begin
  insert into public.schema_migrations (version) values ('0017_mp_nudge')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
