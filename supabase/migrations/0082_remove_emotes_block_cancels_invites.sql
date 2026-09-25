-- Books & Runs — fixes from the 2026-09-25 live end-to-end test, plus removal of
-- the emote feature.
--
-- 1. Emotes are removed from the product (they were also unreadable: the
--    mp_emotes read policy called is_blocked_pair, whose EXECUTE 0060 revoked
--    from `authenticated`). Drops the mp_emotes table (its policy, index and
--    realtime publication membership go with it). Any rows were quick-reaction
--    presets only. Safe to re-run.
-- 2. Blocking left an already-pending invite between the pair acceptable.
--    block_user() now also cancels any still-pending game the two share and
--    clears the game_request inbox events in both directions. (The mp
--    function's /respond also refuses to accept into a blocked pair, for
--    invites that predate this migration or slip in through a race.)
-- 3. mp_bump_rate_limit() (0013) was still executable by `authenticated`
--    because 0013 only revoked anon/public. It is only ever called from
--    inside the SECURITY DEFINER RPCs (which run as the owner) — the mp
--    Edge Function and the app never call it — so close it.
--
-- Safe to run any time; nothing here changes a signature.

do $$ begin
  alter publication supabase_realtime drop table public.mp_emotes;
exception when undefined_table or undefined_object or invalid_parameter_value then null;
end $$;
drop table if exists public.mp_emotes cascade;

create or replace function public.block_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_user is null or p_user = me then raise exception 'invalid target'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'no such user'; end if;

  perform public.mp_bump_rate_limit('block_user', 60);

  insert into public.user_blocks (blocker_id, blocked_id) values (me, p_user)
    on conflict do nothing;

  -- Unfriend / drop any pending request in either direction.
  delete from public.friendships
    where (requester_id = me and addressee_id = p_user)
       or (requester_id = p_user and addressee_id = me);
  -- Clear their unseen friend requests / invites from my inbox.
  delete from public.mp_events
    where user_id = me and actor_id = p_user and seen_at is null
      and kind in ('friend_request', 'friend_accepted', 'game_request', 'nudge');
  -- And any invite I had sent them (they must not be able to act on it).
  delete from public.mp_events
    where user_id = p_user and actor_id = me and kind = 'game_request';

  -- Cancel every game that is still only an invite and has both of us in it.
  update public.mp_games g
    set status = 'cancelled', completed_at = now()
    where g.status = 'pending'
      and exists (select 1 from public.mp_participants p where p.game_id = g.id and p.user_id = me)
      and exists (select 1 from public.mp_participants p where p.game_id = g.id and p.user_id = p_user);
end;
$$;

revoke execute on function public.mp_bump_rate_limit(text, int) from anon, public, authenticated;

do $$ begin
  insert into public.schema_migrations (version) values ('0082_remove_emotes_block_cancels_invites')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
