-- Books & Runs — lock down solo/pass-and-play stats to server-verified
-- writes only. Run this once in the Supabase SQL editor, after 0001–0034,
-- and only after the `solo-verify` Edge Function has been deployed and
-- confirmed working (see supabase/functions/README.md) — once this runs,
-- the app's OLD direct-write path (app/lib/recordGameResult.ts /
-- recordAchievementProgress.ts) stops working entirely, so the client must
-- already be calling solo-verify instead.
--
-- The gap this closes: player_stats and achievement_counters have always
-- been plain "owner can write their own row" tables, with no bound on the
-- values — a signed-in account could call supabase.from('player_stats')
-- .update({games_won: 999999}) directly from devtools and it would just
-- work. mp_game_state closed the equivalent gap for multiplayer by having
-- zero client-facing RLS at all (only the `mp` Edge Function's service-role
-- key can touch it) — this does the same thing here, now that solo-verify
-- exists as the only legitimate way to reach these tables.
--
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Drop owner insert/update on player_stats and achievement_counters —
--    keep owner read (nothing about how these are displayed changes).
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists "player_stats: owner insert" on public.player_stats;
drop policy if exists "player_stats: owner update" on public.player_stats;

drop policy if exists "achievement_counters: owner insert" on public.achievement_counters;
drop policy if exists "achievement_counters: owner update" on public.achievement_counters;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. leaderboard_entries stays client-upsertable (cosmetics, display name,
--    bio, etc. are all unaffected) — but level/total_xp/games_played/
--    games_won/average_score/worst_score specifically get silently
--    overwritten with server-recomputed values on every write, so whatever
--    a client tries to push for those particular columns never sticks.
--    compute_level/compute_total_xp (migration 0027) are already exactly
--    this "live, server-side truth" for level/XP; games_played/games_won/
--    average_score/worst_score are copied straight from player_stats,
--    which is itself locked down as of step 1 above.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.sync_leaderboard_truth()
returns trigger
language plpgsql
as $$
declare
  stats record;
begin
  select games_played, games_won, average_score, worst_score
    into stats
    from public.player_stats
    where user_id = new.user_id;

  new.level := public.compute_level(new.user_id);
  new.total_xp := public.compute_total_xp(new.user_id);
  new.games_played := coalesce(stats.games_played, 0);
  new.games_won := coalesce(stats.games_won, 0);
  new.average_score := stats.average_score;
  new.worst_score := stats.worst_score;

  return new;
end;
$$;

drop trigger if exists sync_leaderboard_truth on public.leaderboard_entries;
create trigger sync_leaderboard_truth
  before insert or update of level, total_xp, games_played, games_won, average_score, worst_score
  on public.leaderboard_entries
  for each row execute function public.sync_leaderboard_truth();

do $$ begin
  insert into public.schema_migrations (version) values ('0035_lock_down_solo_stats')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
