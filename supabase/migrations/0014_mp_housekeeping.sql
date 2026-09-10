-- Books & Runs — multiplayer housekeeping.
-- Run once in the Supabase SQL editor, after 0001–0013.
--
--   1. mp_trim_events(user, keep) — cap one account's notification inbox.
--      The mp Edge Function calls this on every event write; it's a no-op
--      until this migration runs.
--   2. mp_housekeeping() + a daily pg_cron job — the backstop sweep for
--      accounts that never come back: trims every inbox, drops stale
--      notifications and rate-limit rows outright.
--
-- Nothing here forfeits or cancels a game — abandoned games are still ended
-- only by a player choosing to resign (which force-completes a 2-player
-- game on its own).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. per-account inbox cap (called from the Edge Function)
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.mp_trim_events(p_user uuid, p_keep int default 40)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.mp_events e
  where e.user_id = p_user
    and e.id not in (
      select id from public.mp_events
      where user_id = p_user
      order by created_at desc
      limit greatest(p_keep, 1)
    );
$$;

revoke execute on function public.mp_trim_events(uuid, int) from anon, public;
-- Only the service-role Edge Function calls it; it owns the function so no
-- grant to `authenticated` is needed.

-- ─────────────────────────────────────────────────────────────────────────
-- 2. daily sweep
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.mp_housekeeping()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Notifications are only ever shown as "recent" — a month-old one is noise.
  delete from public.mp_events where created_at < now() - interval '30 days';

  -- Rate-limit windows: the bump function already prunes opportunistically,
  -- this catches accounts that stopped calling it.
  delete from public.mp_rate_limit where window_start < now() - interval '2 days';

  -- Backstop the per-write trim for accounts that haven't triggered it.
  delete from public.mp_events e
  using (
    select user_id, id,
           row_number() over (partition by user_id order by created_at desc) as rn
    from public.mp_events
  ) ranked
  where e.id = ranked.id and ranked.rn > 60;
end;
$$;

revoke execute on function public.mp_housekeeping() from anon, public, authenticated;

-- Schedule it daily at 08:00 UTC. pg_cron ships with Supabase but has to be
-- enabled; wrapped so this migration still succeeds if it isn't (enable it
-- under Database → Extensions, then re-run just this block).
do $$
begin
  perform cron.schedule(
    'mp-housekeeping-daily',
    '0 8 * * *',
    $cron$ select public.mp_housekeeping(); $cron$
  );
exception
  when undefined_function or undefined_table or invalid_schema_name then
    raise notice 'pg_cron not enabled — enable it and re-run the cron.schedule block, or call mp_housekeeping() manually.';
end;
$$;
