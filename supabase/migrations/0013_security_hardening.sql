-- Books & Runs — security hardening.
-- Run once in the Supabase SQL editor, after 0001–0012.
--
--   1. Add WITH CHECK to the owner UPDATE policies, so an UPDATE can't move
--      a row you own to a different user_id.
--   2. Constrain display_name (length + no control characters) at the DB,
--      not only the Account page's <input maxLength>.
--   3. Per-user hourly rate limit on the friend-code lookup / add-by-code
--      RPCs, so the code space can't be enumerated (add-by-code creates an
--      accepted friendship on the spot).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. WITH CHECK on owner UPDATE policies
-- ─────────────────────────────────────────────────────────────────────────

alter policy "player_stats: owner update" on public.player_stats
  with check (auth.uid() = user_id);

alter policy "settings: owner update" on public.settings
  with check (auth.uid() = user_id);

alter policy "leaderboard_entries: owner update" on public.leaderboard_entries
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. display_name sanity constraint
-- ─────────────────────────────────────────────────────────────────────────

-- Defensive: null out anything already stored that would fail the CHECK
-- (there shouldn't be any — the UI has always capped input — but ADD
-- CONSTRAINT fails outright if a single row violates it).
update public.leaderboard_entries
  set display_name = null
  where display_name is not null
    and (char_length(display_name) > 48 or display_name ~ '[[:cntrl:]]');

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_display_name_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_display_name_ok
  check (
    display_name is null
    or (char_length(display_name) between 1 and 48 and display_name !~ '[[:cntrl:]]')
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. per-user hourly rate limiting for friend-code RPCs
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.mp_rate_limit (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  window_start timestamptz not null default date_trunc('hour', now()),
  count int not null default 0,
  primary key (user_id, action, window_start)
);

alter table public.mp_rate_limit enable row level security;
-- No policies: only the security-definer RPCs below ever touch this table.

-- Increments this hour's counter for (caller, action) and raises if it went
-- over p_limit. Also opportunistically drops windows older than a day.
create or replace function public.mp_bump_rate_limit(p_action text, p_limit int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  w timestamptz := date_trunc('hour', now());
  c int;
begin
  if me is null then raise exception 'not authenticated'; end if;

  insert into public.mp_rate_limit (user_id, action, window_start, count)
    values (me, p_action, w, 1)
    on conflict (user_id, action, window_start)
      do update set count = public.mp_rate_limit.count + 1
    returning count into c;

  delete from public.mp_rate_limit where window_start < now() - interval '1 day';

  if c > p_limit then
    raise exception 'Too many attempts — try again later.'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.mp_bump_rate_limit(text, int) from anon, public;
-- Not granted to `authenticated` either — it's only called from inside the
-- other security-definer functions, which run as the definer.

-- Redefine the two friend-code RPCs (originally from 0009 / 0012) with a
-- rate-limit gate as their first step. Bodies are otherwise unchanged.

create or replace function public.mp_lookup_friend_code(code text)
returns table (user_id uuid, display_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  perform public.mp_bump_rate_limit('friend_code_lookup', 60);
  return query
    select p.id, le.display_name
    from public.profiles p
    left join public.leaderboard_entries le on le.user_id = p.id
    where upper(p.friend_code) = upper(trim(code))
    limit 1;
end;
$$;

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
  perform public.mp_bump_rate_limit('friend_add_by_code', 20);

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

-- Re-assert grants (create or replace keeps them, but be explicit).
revoke execute on function public.mp_lookup_friend_code(text) from anon, public;
revoke execute on function public.mp_add_friend_by_code(text) from anon, public;
grant execute on function public.mp_lookup_friend_code(text) to authenticated;
grant execute on function public.mp_add_friend_by_code(text) to authenticated;
