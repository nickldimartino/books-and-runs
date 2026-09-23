-- Books & Runs — Clubs ("a regular table").
-- Run this once in the Supabase SQL editor, after 0001–0039.
--
-- Friends today are strictly 1:1 — a club is a standing named group (a
-- recurring pass-and-play/multiplayer crew) with its own roster and a
-- shared scoreboard scoped to just that roster, distinct from the global
-- leaderboard. Deliberately reuses each member's existing multiplayer stats
-- (player_stats/leaderboard_entries, already real and server-verified) —
-- club standings are just those numbers filtered to the roster and
-- re-ranked, not a new stats pipeline. Membership is owner-curated (add/
-- remove from your own friends list, no separate invite/accept flow) since
-- it only ever surfaces a filtered view of stats already visible between
-- friends — nothing new is exposed by being added.

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create index if not exists club_members_user on public.club_members (user_id);

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;

-- "Am I a member of club c?" — security definer so the club_members read
-- policy (and clubs') can reference the table without recursing on itself.
-- Same pattern as mp_is_participant (migration 0010).
create or replace function public.club_is_member(c uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.club_members where club_id = c and user_id = auth.uid()
  );
$$;

create policy "clubs: member read" on public.clubs
  for select using (public.club_is_member(id));
-- No client-facing insert/update/delete — every write goes through the RPCs
-- below (security definer), so "must already be a friend" and roster caps
-- can be enforced server-side rather than just by RLS.

create policy "club_members: member read" on public.club_members
  for select using (public.club_is_member(club_id));

-- ── RPCs ─────────────────────────────────────────────────────────────────

-- A generous cap — a "regular table" is a real recurring group, not a mass
-- broadcast list. High enough that no genuine friend group hits it.
create or replace function public.club_create(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 40 then
    raise exception 'name must be 1-40 characters';
  end if;
  insert into public.clubs (name, owner_id) values (btrim(p_name), me) returning id into new_id;
  insert into public.club_members (club_id, user_id) values (new_id, me);
  return new_id;
end;
$$;

create or replace function public.club_rename(p_club_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 40 then
    raise exception 'name must be 1-40 characters';
  end if;
  update public.clubs set name = btrim(p_name) where id = p_club_id and owner_id = me;
  if not found then raise exception 'not found, or not the owner'; end if;
end;
$$;

create or replace function public.club_delete(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.clubs where id = p_club_id and owner_id = me;
  if not found then raise exception 'not found, or not the owner'; end if;
end;
$$;

-- Owner-only, and only onto an existing (accepted) friend — same trust
-- boundary MP invites already use (new-game/multiplayer only offers
-- friends). 24-member cap: generous for a real recurring group, low enough
-- to keep this from becoming an unbounded broadcast list.
create or replace function public.club_add_member(p_club_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  member_count int;
  is_friend boolean;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.clubs where id = p_club_id and owner_id = me) then
    raise exception 'not found, or not the owner';
  end if;
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = me and addressee_id = p_user_id)
        or (requester_id = p_user_id and addressee_id = me))
  ) into is_friend;
  if not is_friend then raise exception 'must be a friend first'; end if;

  select count(*) into member_count from public.club_members where club_id = p_club_id;
  if member_count >= 24 then raise exception 'this club is full (24 members)'; end if;

  insert into public.club_members (club_id, user_id) values (p_club_id, p_user_id)
    on conflict do nothing;
end;
$$;

-- Owner can remove anyone; any member can remove themselves (leave). The
-- owner can't leave/remove themselves this way — club_delete is the way to
-- end a club they own, so there's always exactly one owner while it exists.
create or replace function public.club_remove_member(p_club_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  is_owner boolean;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select (owner_id = me) into is_owner from public.clubs where id = p_club_id;
  if is_owner is null then raise exception 'not found'; end if;
  if not is_owner and me <> p_user_id then
    raise exception 'only the owner can remove someone else';
  end if;
  if p_user_id = (select owner_id from public.clubs where id = p_club_id) then
    raise exception 'the owner can''t be removed — delete the club instead';
  end if;
  delete from public.club_members where club_id = p_club_id and user_id = p_user_id;
end;
$$;

-- Every club I belong to, with a member count, for the Clubs list page.
create or replace function public.club_my_clubs()
returns table (club_id uuid, name text, owner_id uuid, member_count int, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
    select c.id, c.name, c.owner_id,
           (select count(*)::int from public.club_members m2 where m2.club_id = c.id),
           c.created_at
    from public.clubs c
    join public.club_members m on m.club_id = c.id and m.user_id = me
    order by c.created_at desc;
end;
$$;

-- The roster + each member's real multiplayer stats — the club's "shared
-- standings, distinct from the global leaderboard" (per this file's own
-- doc). Pulls straight from leaderboard_entries's mp_* columns (server-
-- verified as of migration 0050, which closed a gap where these three had
-- stayed plain client-writable since 0011) rather than a new tally.
create or replace function public.club_standings(p_club_id uuid)
returns table (
  user_id uuid,
  display_name text,
  games_played int,
  games_won int,
  best_win_streak int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.club_is_member(p_club_id) then
    raise exception 'not a member of this club';
  end if;
  return query
    select
      m.user_id,
      l.display_name,
      coalesce(l.mp_games_played, 0),
      coalesce(l.mp_games_won, 0),
      coalesce(l.mp_best_win_streak, 0)
    from public.club_members m
    left join public.leaderboard_entries l on l.user_id = m.user_id
    where m.club_id = p_club_id
    order by coalesce(l.mp_games_won, 0) desc, coalesce(l.mp_games_played, 0) desc;
end;
$$;

do $$ begin
  insert into public.schema_migrations (version) values ('0040_clubs')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
