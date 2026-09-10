-- Books & Runs — Multiplayer games (Stage 2)
-- Run this once in the Supabase SQL editor, after 0009_friends.sql, and then
-- deploy the Edge Function:  supabase functions deploy mp
--
--   • mp_games        — public game metadata (status, seats, whose turn,
--                       hand counts, scores). Readable by participants.
--   • mp_game_state   — the SEALED half: full engine state + shuffled deck.
--                       No RLS policies at all → unreachable from any
--                       client. Only the Edge Function (service role)
--                       touches it. This is the entire hand-privacy
--                       mechanism.
--   • mp_participants — who's in each game, invite status, final outcome.
--                       The separate MP win/loss record is derived from
--                       this.
--
-- All game mutations (create / accept / decline / draw / commit / resign)
-- go through the `mp` Edge Function, which runs the real src/ engine. This
-- schema has no client write policies for games — only reads.

-- ─────────────────────────────────────────────────────────────────────────
-- tables
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.mp_games (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'active', 'complete', 'cancelled')),
  -- 1-based positions into CONTRACTS (src/types.ts), in play order.
  contract_rounds int[] not null,
  -- [{seat, kind:'human', user_id, name} | {seat, kind:'ai', difficulty, name}]
  -- Names are snapshotted at create time.
  seats jsonb not null,
  round int not null default 1,
  turn_seat int,
  turn_user_id uuid references auth.users (id) on delete set null,  -- null on an AI seat / game over
  hand_counts jsonb not null default '{}'::jsonb,        -- {seat: n}
  cumulative_scores jsonb not null default '{}'::jsonb,  -- {seat: score}
  winner_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists mp_games_status on public.mp_games (status);

create table if not exists public.mp_game_state (
  game_id uuid primary key references public.mp_games (id) on delete cascade,
  engine jsonb not null,   -- the entire MpEngine (GameState + deck + turnDrawn + resignedSeats + roundResults)
  version int not null default 0   -- optimistic lock: a write is conditioned on the version it read
);

create table if not exists public.mp_participants (
  game_id uuid not null references public.mp_games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seat int not null,
  invite_status text not null check (invite_status in ('invited', 'accepted', 'declined')),
  outcome text check (outcome in ('won', 'lost', 'resigned')),
  final_score int,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (game_id, user_id)
);

create index if not exists mp_participants_user on public.mp_participants (user_id);

alter table public.mp_games enable row level security;
alter table public.mp_game_state enable row level security;  -- with NO policies: deny-all
alter table public.mp_participants enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────

-- "Am I a participant of game g?" — security definer so the mp_participants
-- read policy can reference the table without recursing on itself.
create or replace function public.mp_is_participant(g uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.mp_participants where game_id = g and user_id = auth.uid()
  );
$$;

create policy "mp_games: participant read" on public.mp_games
  for select using (public.mp_is_participant(id));

create policy "mp_participants: participant read" on public.mp_participants
  for select using (public.mp_is_participant(game_id));

-- mp_game_state: deliberately no policies. Only the service role (Edge
-- Function) can see or change it.

-- ─────────────────────────────────────────────────────────────────────────
-- RPCs (reads only — all writes are the Edge Function)
-- ─────────────────────────────────────────────────────────────────────────

-- Games you're in, newest-active first, with everything the Home card and
-- the game screen's header need. The client derives "your turn" /
-- "waiting for X" / "waiting for players to accept" from these fields.
create or replace function public.mp_my_games()
returns table (
  game_id uuid,
  status text,
  round int,
  total_rounds int,
  your_seat int,
  invite_status text,
  turn_seat int,
  turn_user_id uuid,
  seats jsonb,
  hand_counts jsonb,
  cumulative_scores jsonb,
  host_id uuid,
  updated_at timestamptz
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
      g.id, g.status, g.round, coalesce(array_length(g.contract_rounds, 1), 0),
      p.seat, p.invite_status, g.turn_seat, g.turn_user_id,
      g.seats, g.hand_counts, g.cumulative_scores, g.host_id, g.updated_at
    from public.mp_games g
    join public.mp_participants p on p.game_id = g.id and p.user_id = me
    where g.status in ('pending', 'active')
    order by (g.turn_user_id = me) desc, g.updated_at desc;
end;
$$;

-- Your multiplayer win/loss record (separate from the vs-AI stats).
create or replace function public.mp_my_record()
returns table (played int, won int, lost int)
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
    select
      count(*) filter (where outcome is not null)::int,
      count(*) filter (where outcome = 'won')::int,
      count(*) filter (where outcome in ('lost', 'resigned'))::int
    from public.mp_participants
    where user_id = me;
end;
$$;

-- Active games + pending invites counting against the 3-game cap. Defaults
-- to the caller; the Edge Function passes an explicit uid to check invitees.
create or replace function public.mp_active_count(uid uuid default null)
returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.mp_participants p
  join public.mp_games g on g.id = p.game_id
  where p.user_id = coalesce(uid, auth.uid())
    and p.invite_status in ('invited', 'accepted')
    and g.status in ('pending', 'active');
$$;

-- Completed games, for the History "Multiplayer" filter.
create or replace function public.mp_my_history(limit_n int default 20)
returns table (
  game_id uuid,
  seats jsonb,
  cumulative_scores jsonb,
  winner_user_id uuid,
  your_outcome text,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
    select g.id, g.seats, g.cumulative_scores, g.winner_user_id, p.outcome, g.completed_at
    from public.mp_games g
    join public.mp_participants p on p.game_id = g.id and p.user_id = me
    where g.status = 'complete'
    order by g.completed_at desc nulls last
    limit greatest(1, least(limit_n, 100));
end;
$$;

revoke execute on function
  public.mp_my_games(),
  public.mp_my_record(),
  public.mp_active_count(uuid),
  public.mp_my_history(int)
from anon, public;

grant execute on function
  public.mp_my_games(),
  public.mp_my_record(),
  public.mp_active_count(uuid),
  public.mp_my_history(int)
to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Realtime — turn changes and new invites reach open clients without a poll.
-- RLS still gates the subscription, so each client only sees its own games.
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.mp_games;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.mp_participants;
exception when duplicate_object then null;
end $$;
