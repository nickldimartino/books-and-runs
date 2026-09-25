-- Books & Runs — self-serve account deletion (support for the
-- `delete-account` Edge Function).
-- Run once in the Supabase SQL editor, after 0063, then deploy the new
-- `delete-account` function (and redeploy `mp`, which it calls to resign
-- active games — see supabase/functions/delete-account/index.ts).
--
-- Almost everything tied to an account already goes away when its
-- auth.users row is deleted (every user_id FK is ON DELETE CASCADE: profile,
-- stats, history, achievements, settings, saves, leaderboard entry, friends,
-- inbox, push subscriptions, participants, blocks, clubs/tournaments owned…).
-- Three things would go wrong if we just deleted the user:
--   1. mp_games.host_id is NOT NULL … ON DELETE CASCADE, so deleting a host
--      would delete the whole game — including every OTHER player's copy of
--      a finished game in their history. So hosted games are first handed to
--      another participant.
--   2. Finished (and still-running) games keep the deleted player's display
--      name inside mp_games.seats and the sealed mp_game_state.engine; those
--      seats are rewritten to "Deleted player" with the user id removed.
--   3. Active games must be resigned through the engine (that's TypeScript,
--      in the `mp` function) before the row disappears — the Edge Function
--      does that first, then calls this, then deletes the storage objects
--      and finally the auth user.
--
-- Service-role only. Returns { avatar_path } so the function can also remove
-- the uploaded profile photo (Storage isn't reachable from SQL).

create or replace function public.delete_account_prepare(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  seat_rec record;
  avatar text;
begin
  if p_user is null then raise exception 'no user'; end if;

  select avatar_photo_path into avatar from public.leaderboard_entries where user_id = p_user;

  -- Stop pushes immediately, even if a later step fails.
  delete from public.push_subscriptions where user_id = p_user;

  -- 1. Re-home hosted games that other people are still in.
  update public.mp_games gm
     set host_id = (
       select p.user_id from public.mp_participants p
       where p.game_id = gm.id and p.user_id <> p_user
       order by p.seat limit 1)
   where gm.host_id = p_user
     and exists (select 1 from public.mp_participants p where p.game_id = gm.id and p.user_id <> p_user);

  -- 2. Anonymise every seat this account held.
  for g in
    select gm.id, gm.seats
    from public.mp_games gm
    join public.mp_participants p on p.game_id = gm.id
    where p.user_id = p_user
  loop
    update public.mp_games
       set seats = (
         select coalesce(jsonb_agg(
           case when t.s ->> 'userId' = p_user::text
                then (t.s - 'userId') || jsonb_build_object('name', 'Deleted player')
                else t.s end
           order by t.ord), '[]'::jsonb)
         from jsonb_array_elements(g.seats) with ordinality as t(s, ord))
     where id = g.id;

    for seat_rec in
      select (t.s ->> 'seat')::int as seat
      from jsonb_array_elements(g.seats) as t(s)
      where t.s ->> 'userId' = p_user::text
    loop
      update public.mp_game_state gs
         set engine = jsonb_set(gs.engine, array['state', 'players', seat_rec.seat::text, 'name'], to_jsonb('Deleted player'::text))
       where gs.game_id = g.id
         and gs.engine #> array['state', 'players', seat_rec.seat::text] is not null;
    end loop;
  end loop;

  return jsonb_build_object('avatar_path', avatar);
end;
$$;

revoke execute on function public.delete_account_prepare(uuid) from anon, public, authenticated;
-- service_role bypasses grants; nothing else may call it.

do $$ begin
  insert into public.schema_migrations (version) values ('0064_delete_account')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
