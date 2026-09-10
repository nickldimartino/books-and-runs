-- Books & Runs — Friends (Stage 1 of multiplayer)
-- Run this once in the Supabase SQL editor, after 0001–0008.
--
-- Adds:
--   • profiles    — one row per account, holds a shareable friend code
--   • friendships — pending / accepted friend links (a decline or unfriend
--                   deletes the row)
--   • mp_events   — a small per-user inbox: friend requests now, game events
--                   once the rest of multiplayer lands
--   • RPCs for every friend action, so "they already asked you → accept" and
--     the one-per-pair rule live in exactly one place
--
-- No Edge Function yet — this stage is pure Postgres + RLS, and follows the
-- same "trust the signed-in client, gate everything with RLS" model the rest
-- of this schema already uses (see 0006's header).

-- ─────────────────────────────────────────────────────────────────────────
-- profiles + friend codes
-- ─────────────────────────────────────────────────────────────────────────

-- BR- + 5 Crockford base32 chars (no I/L/O/U) — e.g. BR-7K2Q9. ~24M codes;
-- the loop retries on the rare collision. Referenced as a column default
-- below; the body isn't checked against the schema until it actually runs,
-- so declaring it before the table it reads is fine.
create or replace function public.gen_friend_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  i int;
begin
  loop
    candidate := 'BR-';
    for i in 1..5 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = candidate);
  end loop;
  return candidate;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  friend_code text unique not null default public.gen_friend_code(),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- You can read your own row (to show your code). Resolving someone else's
-- code → account goes through mp_lookup_friend_code() below, so the full
-- code↔account map is never handed to a client. No insert/update policy:
-- rows are created by the trigger and the backfill, never the client.
create policy "profiles: owner read" on public.profiles
  for select using (auth.uid() = id);

-- Auto-create a profile row for every new account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill every existing account.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- friendships
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- One row per pair, regardless of who asked first — stops B sending a fresh
-- request while A's request to B is still pending.
create unique index if not exists friendships_pair_uniq
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships enable row level security;

-- Read + delete: either party. Delete covers both "decline a request" and
-- "unfriend". Inserts and accepts go through the RPCs.
create policy "friendships: party read" on public.friendships
  for select using (auth.uid() in (requester_id, addressee_id));
create policy "friendships: party delete" on public.friendships
  for delete using (auth.uid() in (requester_id, addressee_id));

-- ─────────────────────────────────────────────────────────────────────────
-- mp_events — per-user inbox (badges / notifications)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.mp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,              -- 'friend_request' | 'friend_accepted' | (later) 'game_request' | 'your_turn' | 'game_over' | 'game_cancelled'
  actor_id uuid references auth.users (id) on delete set null,
  game_id uuid,
  payload jsonb not null default '{}'::jsonb,
  seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mp_events_user_unseen
  on public.mp_events (user_id, created_at desc) where seen_at is null;

alter table public.mp_events enable row level security;

-- Owner can read, mark seen, and clear. Writes come from the RPCs / (later)
-- the Edge Function.
create policy "mp_events: owner read" on public.mp_events
  for select using (auth.uid() = user_id);
create policy "mp_events: owner update" on public.mp_events
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "mp_events: owner delete" on public.mp_events
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- RPCs
-- ─────────────────────────────────────────────────────────────────────────

-- Own friend code, self-healing if the profile row is somehow missing.
create or replace function public.mp_my_friend_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  code text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  insert into public.profiles (id) values (me) on conflict (id) do nothing;
  select friend_code into code from public.profiles where id = me;
  return code;
end;
$$;

-- Resolve a pasted code → { user_id, display_name } without exposing the
-- whole profiles table. Case-insensitive, tolerant of surrounding spaces.
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
  return query
    select p.id, le.display_name
    from public.profiles p
    left join public.leaderboard_entries le on le.user_id = p.id
    where upper(p.friend_code) = upper(trim(code))
    limit 1;
end;
$$;

-- Send a friend request. If they already requested you, this accepts it. If
-- a friendship (or your own pending request) already exists, it's a no-op.
create or replace function public.mp_send_friend_request(target uuid)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing public.friendships;
  result public.friendships;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if target is null or target = me then raise exception 'invalid target'; end if;
  if not exists (select 1 from auth.users where id = target) then
    raise exception 'no such user';
  end if;

  select * into existing from public.friendships
  where (requester_id = me and addressee_id = target)
     or (requester_id = target and addressee_id = me);

  if existing.id is not null then
    if existing.status = 'accepted' then
      return existing;
    end if;
    if existing.addressee_id = me then
      update public.friendships
        set status = 'accepted', responded_at = now()
        where id = existing.id
        returning * into result;
      insert into public.mp_events (user_id, kind, actor_id)
        values (existing.requester_id, 'friend_accepted', me);
      return result;
    end if;
    return existing;  -- my own request, still pending
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
    values (me, target, 'pending')
    returning * into result;
  insert into public.mp_events (user_id, kind, actor_id)
    values (target, 'friend_request', me);
  return result;
end;
$$;

-- Accept or decline a pending request addressed to you.
create or replace function public.mp_respond_friend_request(request_id uuid, accept boolean)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r public.friendships;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into r from public.friendships where id = request_id;
  if r.id is null then raise exception 'no such request'; end if;
  if r.addressee_id <> me then raise exception 'not your request'; end if;
  if r.status <> 'pending' then return r; end if;

  if accept then
    update public.friendships set status = 'accepted', responded_at = now()
      where id = request_id returning * into r;
    insert into public.mp_events (user_id, kind, actor_id)
      values (r.requester_id, 'friend_accepted', me);
    return r;
  end if;

  delete from public.friendships where id = request_id;
  return null;
end;
$$;

-- Unfriend, or cancel your own outgoing request. Either party may call it.
create or replace function public.mp_remove_friend(other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.friendships
    where (requester_id = me and addressee_id = other)
       or (requester_id = other and addressee_id = me);
end;
$$;

-- Accepted friends, with display names, for the Friends page.
create or replace function public.mp_my_friends()
returns table (user_id uuid, display_name text, friends_since timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
    select
      case when f.requester_id = me then f.addressee_id else f.requester_id end,
      le.display_name,
      f.responded_at
    from public.friendships f
    left join public.leaderboard_entries le
      on le.user_id = case when f.requester_id = me then f.addressee_id else f.requester_id end
    where f.status = 'accepted' and me in (f.requester_id, f.addressee_id)
    order by le.display_name nulls last;
end;
$$;

-- Pending requests, incoming and outgoing.
create or replace function public.mp_my_requests()
returns table (
  id uuid,
  direction text,
  other_user_id uuid,
  display_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
    select
      f.id,
      case when f.addressee_id = me then 'incoming' else 'outgoing' end,
      case when f.addressee_id = me then f.requester_id else f.addressee_id end,
      le.display_name,
      f.created_at
    from public.friendships f
    left join public.leaderboard_entries le
      on le.user_id = case when f.addressee_id = me then f.requester_id else f.addressee_id end
    where f.status = 'pending' and me in (f.requester_id, f.addressee_id)
    order by f.created_at desc;
end;
$$;

revoke execute on function
  public.mp_my_friend_code(),
  public.mp_lookup_friend_code(text),
  public.mp_send_friend_request(uuid),
  public.mp_respond_friend_request(uuid, boolean),
  public.mp_remove_friend(uuid),
  public.mp_my_friends(),
  public.mp_my_requests()
from anon, public;

grant execute on function
  public.mp_my_friend_code(),
  public.mp_lookup_friend_code(text),
  public.mp_send_friend_request(uuid),
  public.mp_respond_friend_request(uuid, boolean),
  public.mp_remove_friend(uuid),
  public.mp_my_friends(),
  public.mp_my_requests()
to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Realtime — so a request / acceptance reaches the other account without a
-- refresh. RLS still applies to the subscription, so each client only sees
-- its own events and its own friendship rows.
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.mp_events;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;
