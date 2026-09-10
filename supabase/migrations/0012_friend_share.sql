-- Books & Runs — one-tap friend links.
-- Run once in the Supabase SQL editor, after 0009_friends.sql.
--
-- A shared link carries a friend code (books-and-runs.vercel.app/friends?add=BR-XXXXX).
-- Opening it and confirming calls mp_add_friend_by_code(), which creates an
-- *accepted* friendship straight away — the code owner shared the link, so
-- there's nothing more for them to approve. Both accounts then see each
-- other (mp_my_friends() already returns the other party for any accepted
-- row, whichever direction it was created).

create or replace function public.mp_add_friend_by_code(code text)
returns table (user_id uuid, display_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  target uuid;
  target_name text;
  existing public.friendships;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select p.id, le.display_name into target, target_name
  from public.profiles p
  left join public.leaderboard_entries le on le.user_id = p.id
  where upper(p.friend_code) = upper(trim(code))
  limit 1;

  if target is null then raise exception 'no such code'; end if;
  if target = me then raise exception 'that is your own code'; end if;

  select * into existing from public.friendships
  where (requester_id = me and addressee_id = target)
     or (requester_id = target and addressee_id = me);

  if existing.id is not null then
    if existing.status <> 'accepted' then
      update public.friendships set status = 'accepted', responded_at = now()
        where id = existing.id;
      insert into public.mp_events (user_id, kind, actor_id)
        values (
          case when existing.requester_id = me then existing.addressee_id else existing.requester_id end,
          'friend_accepted',
          me
        );
    end if;
  else
    insert into public.friendships (requester_id, addressee_id, status, responded_at)
      values (me, target, 'accepted', now());
    insert into public.mp_events (user_id, kind, actor_id)
      values (target, 'friend_accepted', me);
  end if;

  return query select target, target_name;
end;
$$;

revoke execute on function public.mp_add_friend_by_code(text) from anon, public;
grant execute on function public.mp_add_friend_by_code(text) to authenticated;

-- So a friendship UPDATE (pending -> accepted) and DELETE (unfriend) reach
-- BOTH parties over Realtime: the RLS policy filters on requester_id /
-- addressee_id, which aren't in the default (primary-key) replica identity,
-- so without this the other party's row-change events get dropped and their
-- list only refreshes on a manual reload.
alter table public.friendships replica identity full;
