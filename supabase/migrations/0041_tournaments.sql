-- Books & Runs — Tournaments (a round-robin series among the same players).
-- Run this once in the Supabase SQL editor, after 0001–0040.
--
-- Deliberately not a true elimination bracket — a bracket can only advance
-- once every match in a round finishes, which stalls hard in an async game
-- where one match can take days. Instead: a fixed roster plays a fixed
-- number of real multiplayer games back-to-back (each one an ordinary
-- mp_games row — "rematch" already existed as a primitive, this is just
-- several rematches linked together with a shared scoreboard), and
-- standings are each player's summed final_score/games_won across every
-- linked game. No changes to the `mp` Edge Function or its engine at all —
-- this is a thin tracking layer on top of what already exists.

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  host_id uuid not null references auth.users (id) on delete cascade,
  -- Optional — a tournament can be started from a club's roster as a
  -- shortcut, or from a plain friend picker; this is purely informational
  -- (shown as "from: <club>"), never a permission check. set null (not
  -- cascade) so deleting the club doesn't erase tournament history.
  club_id uuid references public.clubs (id) on delete set null,
  -- How many games make up the series.
  total_rounds int not null check (total_rounds between 2 and 10),
  -- 1-based positions into CONTRACTS, same shape/meaning as mp_games' own
  -- contract_rounds — every round in the series plays this same shape.
  contract_rounds int[] not null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

-- One row per game in the series. The roster is whoever's in
-- mp_participants for round 1's game_id — every later round is a rematch
-- of that exact same roster (rematchMpGame reuses the finished game's own
-- seats), so there's no separate participants table to keep in sync.
create table if not exists public.tournament_games (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round_number int not null check (round_number >= 1),
  game_id uuid not null unique references public.mp_games (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tournament_id, round_number)
);

create index if not exists tournament_games_tournament on public.tournament_games (tournament_id);

alter table public.tournaments enable row level security;
alter table public.tournament_games enable row level security;

-- "Am I a participant in tournament t?" — true iff I'm an mp_participant of
-- any game linked into it (equivalently, of round 1's game, since the
-- roster is fixed for the whole series). security definer so the read
-- policies below can reference both tables without recursing.
create or replace function public.tournament_is_participant(t uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.tournament_games tg
    join public.mp_participants p on p.game_id = tg.game_id
    where tg.tournament_id = t and p.user_id = auth.uid()
  );
$$;

create policy "tournaments: participant read" on public.tournaments
  for select using (public.tournament_is_participant(id));

create policy "tournament_games: participant read" on public.tournament_games
  for select using (public.tournament_is_participant(tournament_id));
-- No client-facing insert/update/delete — every write goes through the
-- RPCs below, so "the caller actually hosts this game" can be checked
-- server-side.

-- ── RPCs ─────────────────────────────────────────────────────────────────

-- Links an already-created mp_games row (the client calls the `mp` Edge
-- Function's own /create first, exactly like starting any other
-- multiplayer game) as round 1 of a brand-new tournament. Requires the
-- caller to actually be that game's host — the tournament's roster is
-- whatever ends up seated in that game, nothing here re-validates seats.
create or replace function public.tournament_create(
  p_name text,
  p_total_rounds int,
  p_contract_rounds int[],
  p_club_id uuid,
  p_game_id uuid
)
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
  if not exists (select 1 from public.mp_games where id = p_game_id and host_id = me) then
    raise exception 'not found, or not the host of that game';
  end if;
  if p_club_id is not null and not public.club_is_member(p_club_id) then
    raise exception 'not a member of that club';
  end if;

  insert into public.tournaments (name, host_id, club_id, total_rounds, contract_rounds)
    values (btrim(p_name), me, p_club_id, p_total_rounds, p_contract_rounds)
    returning id into new_id;
  insert into public.tournament_games (tournament_id, round_number, game_id) values (new_id, 1, p_game_id);
  return new_id;
end;
$$;

-- Links a freshly-rematched mp_games row as the next round of an existing
-- tournament. Host-only (same person who started the series), and only
-- while rounds remain and the tournament isn't cancelled. Returns the round
-- number it was assigned.
create or replace function public.tournament_add_round(p_tournament_id uuid, p_game_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  t record;
  next_round int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into t from public.tournaments where id = p_tournament_id;
  if t is null then raise exception 'not found'; end if;
  if t.host_id <> me then raise exception 'only the host can add a round'; end if;
  if t.cancelled_at is not null then raise exception 'this tournament was cancelled'; end if;
  if not exists (select 1 from public.mp_games where id = p_game_id and host_id = me) then
    raise exception 'not found, or not the host of that game';
  end if;

  select coalesce(max(round_number), 0) + 1 into next_round
    from public.tournament_games where tournament_id = p_tournament_id;
  if next_round > t.total_rounds then raise exception 'this tournament''s rounds are already complete'; end if;

  insert into public.tournament_games (tournament_id, round_number, game_id)
    values (p_tournament_id, next_round, p_game_id);
  return next_round;
end;
$$;

create or replace function public.tournament_cancel(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  update public.tournaments set cancelled_at = now()
    where id = p_tournament_id and host_id = me and cancelled_at is null;
  if not found then raise exception 'not found, not the host, or already cancelled'; end if;
end;
$$;

-- Every tournament I'm a participant in, with round progress, for the
-- Tournaments list page.
create or replace function public.tournament_my_list()
returns table (
  tournament_id uuid,
  name text,
  host_id uuid,
  club_id uuid,
  total_rounds int,
  rounds_played int,
  cancelled boolean,
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
      t.id, t.name, t.host_id, t.club_id, t.total_rounds,
      (select count(*)::int from public.tournament_games tg where tg.tournament_id = t.id),
      (t.cancelled_at is not null),
      t.created_at
    from public.tournaments t
    where public.tournament_is_participant(t.id)
    order by t.created_at desc;
end;
$$;

-- Every round played so far — round number, the linked game, and whether
-- it's finished — for the tournament detail page.
create or replace function public.tournament_rounds(p_tournament_id uuid)
returns table (round_number int, game_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tournament_is_participant(p_tournament_id) then
    raise exception 'not a participant in this tournament';
  end if;
  return query
    select tg.round_number, tg.game_id, g.status
    from public.tournament_games tg
    join public.mp_games g on g.id = tg.game_id
    where tg.tournament_id = p_tournament_id
    order by tg.round_number asc;
end;
$$;

-- Cumulative standings across every completed round — each player's summed
-- final_score (lower is better, same convention as a single game's own
-- scoring) and total games_won within the series. Derived live from
-- mp_participants' own outcome/final_score (set once by the `mp` function
-- at each game's real end, see mp/index.ts) rather than cached anywhere, so
-- it can never drift out of sync with the actual games.
create or replace function public.tournament_standings(p_tournament_id uuid)
returns table (
  user_id uuid,
  display_name text,
  games_played int,
  games_won int,
  total_score bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tournament_is_participant(p_tournament_id) then
    raise exception 'not a participant in this tournament';
  end if;
  return query
    select
      p.user_id,
      l.display_name,
      count(*)::int filter (where g.status = 'complete'),
      count(*)::int filter (where p.outcome = 'won'),
      coalesce(sum(p.final_score) filter (where g.status = 'complete'), 0)
    from public.tournament_games tg
    join public.mp_games g on g.id = tg.game_id
    join public.mp_participants p on p.game_id = tg.game_id
    left join public.leaderboard_entries l on l.user_id = p.user_id
    where tg.tournament_id = p_tournament_id
    group by p.user_id, l.display_name
    order by total_score asc;
end;
$$;

do $$ begin
  insert into public.schema_migrations (version) values ('0041_tournaments')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
