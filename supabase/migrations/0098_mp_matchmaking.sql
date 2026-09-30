-- Books & Runs — opt-in matchmaking with a stranger, not just a friend or
-- an AI. Every multiplayer game before this needed a friend on the other
-- end; a friendless new player could never actually try the headline
-- multiplayer feature. Run this once, after 0001-0097 (needs mp_rating).
--
-- A plain waiting-room table, matched by the `mp` Edge Function (not a raw
-- SQL RPC) — the actual game-creation/dealing logic (dealGame, the engine)
-- already lives there, and handleMatchmakingJoin reuses it exactly rather
-- than duplicating a second copy of "how to build a game" in PL/pgSQL.
--
-- Deliberately no realtime channel or push for "you've been matched" —
-- the client just polls matchmaking_status() every couple seconds while on
-- the waiting screen (see useMpGame.ts's own comment on why refresh() is
-- already a cheap, coalesced operation this can reuse the same shape of).

create table if not exists public.mp_matchmaking_queue (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rating integer not null default 1200,
  joined_at timestamptz not null default now(),
  -- Set by whichever OTHER account's own join call matched into this row;
  -- null means still waiting. The matched-into account (this row's owner)
  -- discovers it by polling their own row instead of it being pushed to
  -- them, since RLS only ever lets them read their own row anyway.
  matched_game_id uuid references public.mp_games (id) on delete set null
);

alter table public.mp_matchmaking_queue enable row level security;

-- Owner-only read — nobody can see who else is waiting or at what rating;
-- matching itself happens through the service-role Edge Function, which
-- bypasses RLS. No client insert/update/delete policy: joining, leaving,
-- and the match handoff all go through the function's own service-role
-- client, same "every write is server-verified" shape as mp_game_state.
create policy "mp_matchmaking_queue: owner read" on public.mp_matchmaking_queue
  for select using (auth.uid() = user_id);

insert into public.schema_migrations (version) values ('0098_mp_matchmaking')
on conflict (version) do nothing;
