-- Books & Runs — multiplayer turn clock (AFK handling) + quick emotes.
-- Run once in the Supabase SQL editor, after 0060, and redeploy the `mp`
-- Edge Function (the function does all the enforcing — see its header).
--
--   • mp_games.turn_limit_hours / turn_started_at / turn_warned_at — the
--     per-game turn limit chosen by the host (0 = off, 24, 48 or 72). EXISTING
--     games get 0 (no limit): nobody's in-progress game starts being forfeited
--     under them. New games default to 72.
--   • mp_participants.missed_turns — consecutive turns a seat has let expire
--     (the first miss auto-plays a safe move, the second forfeits; a real move
--     resets it). See src/mp/turnTimer.ts.
--   • mp_my_games() also returns turn_limit_hours + turn_started_at so a client
--     can show "turn ends in 14h" without another call. Older clients ignore
--     the extra fields.
--   • mp_emotes — quick reactions between players (fixed presets only, no free
--     text). Written only by the `mp` function; readable by the game's
--     participants except from someone they've blocked; on the realtime
--     publication so they appear live.
--   • Scheduling — the `mp` function enforces lazily whenever a game is read
--     or moved, and ALSO exposes /sweep for an optional pg_cron job (below)
--     that forfeits/auto-plays games nobody opens, sends the "time is running
--     out" reminder, and expires stale pending invites (7 days).

alter table public.mp_games
  add column if not exists turn_limit_hours int not null default 0
    check (turn_limit_hours in (0, 24, 48, 72)),
  add column if not exists turn_started_at timestamptz,
  add column if not exists turn_warned_at timestamptz;

-- Rows that existed above got 0 (off); anything created from now on gets 72
-- unless the host picked otherwise.
alter table public.mp_games alter column turn_limit_hours set default 72;

create index if not exists mp_games_turn_clock
  on public.mp_games (turn_started_at) where status = 'active' and turn_limit_hours > 0;

alter table public.mp_participants
  add column if not exists missed_turns int not null default 0;

-- mp_my_games with the two new columns. The return type changes, so drop first.
drop function if exists public.mp_my_games();
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
  updated_at timestamptz,
  turn_limit_hours int,
  turn_started_at timestamptz
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
      g.seats, g.hand_counts, g.cumulative_scores, g.host_id, g.updated_at,
      g.turn_limit_hours, g.turn_started_at
    from public.mp_games g
    join public.mp_participants p on p.game_id = g.id and p.user_id = me
    where g.status in ('pending', 'active')
    order by (g.turn_user_id = me) desc, g.updated_at desc;
end;
$$;

revoke execute on function public.mp_my_games() from anon, public;
grant execute on function public.mp_my_games() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- emotes
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.mp_emotes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.mp_games (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  -- Keep in step with EMOTE_IDS in src/mp/emotes.ts (a unit test checks).
  emote text not null check (emote in
    ('hello', 'nice_meld', 'your_turn', 'oops', 'thanks', 'wow', 'lucky', 'good_game')),
  created_at timestamptz not null default now()
);

create index if not exists mp_emotes_game on public.mp_emotes (game_id, created_at desc);

alter table public.mp_emotes enable row level security;

-- Participants read a game's emotes — except ones sent by an account they
-- have blocked (or that blocked them). No insert/update/delete policy: the
-- `mp` function (service role) is the only writer, and does the rate limiting.
drop policy if exists "mp_emotes: participant read" on public.mp_emotes;
create policy "mp_emotes: participant read" on public.mp_emotes
  for select using (
    public.mp_is_participant(game_id)
    and (sender_id = auth.uid() or not public.is_blocked_pair(auth.uid(), sender_id))
  );

do $$
begin
  alter publication supabase_realtime add table public.mp_emotes;
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Optional: scheduled sweep (every 30 minutes)
-- ─────────────────────────────────────────────────────────────────────────
-- The lazy enforcement in the `mp` function already covers any game someone
-- opens; this catches games where BOTH players have gone quiet, and sends the
-- reminder push at 75% of the limit. Same one-time setup as 0038 (the
-- `mp` function needs the CRON_SECRET secret — the same value the
-- daily-deal-reminder function uses — and that value must be in the Vault as
-- 'daily_deal_reminder_cron_secret', which 0038 already asks for). Replace
-- <YOUR-PROJECT-REF> and <YOUR-ANON-KEY> (the public anon key from
-- .env.local — it only satisfies the platform's JWT gate; the function
-- checks the real secret in x-cron-secret) below before running; harmless
-- no-op notice if pg_cron/pg_net aren't enabled.
do $$
begin
  perform cron.schedule(
    'mp-turn-clock-sweep',
    '*/30 * * * *',
    $cron$
    select net.http_post(
      url := 'https://<YOUR-PROJECT-REF>.functions.supabase.co/mp/sweep',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <YOUR-ANON-KEY>',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'daily_deal_reminder_cron_secret'
        )
      ),
      body := '{}'::jsonb
    );
    $cron$
  );
exception
  when undefined_function or undefined_table or invalid_schema_name then
    raise notice 'pg_cron/pg_net not enabled, or the Vault secret is missing — the turn clock still works lazily; see this file''s header, then re-run this block to add the sweep.';
end;
$$;

do $$ begin
  insert into public.schema_migrations (version) values ('0061_mp_turn_timer_emotes')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
