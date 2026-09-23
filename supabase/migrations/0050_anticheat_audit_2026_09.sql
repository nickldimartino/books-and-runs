-- Books & Runs — findings from a dedicated cheat-prevention audit (2026-09),
-- separate from 0048/0049's broader security pass. Run this once in the
-- Supabase SQL editor, after 0001–0049.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. leaderboard_entries.mp_games_played / .mp_games_won / .mp_best_win_streak
--    were the one stat family 0035/0036/0039's "server silently overwrites
--    whatever the client pushes" pattern never actually reached — added in
--    migration 0011 as plain owner-writable columns, and nothing since has
--    ever locked them down. Unlike solo stats (locked via player_stats) and
--    Daily/Weekly streaks (locked via their own completion tables), a
--    signed-in client could push any number it wanted into these three
--    directly, and they're genuinely public/competitive: shown on the
--    leaderboard, on public profiles, and used to rank members in
--    club_standings(). The real source of truth (mp_games/mp_participants,
--    the same tables mp_stats_for() already reads honestly, since every
--    multiplayer outcome is stamped server-side by the `mp` Edge Function)
--    already exists — this just wires the same overwrite-on-write pattern
--    up to it. sync_leaderboard_truth() becomes `security definer` (needed
--    to reach mp_stats_for(), which is revoked from `authenticated` itself)
--    — same reasoning migration 0033 already used for compute_total_xp()/
--    category_mastered() needing to reach it.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.sync_leaderboard_truth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stats record;
  mp record;
begin
  select games_played, games_won, average_score, worst_score
    into stats
    from public.player_stats
    where user_id = new.user_id;

  select played, won, best_win_streak into mp from public.mp_stats_for(new.user_id);

  new.level := public.compute_level(new.user_id);
  new.total_xp := public.compute_total_xp(new.user_id);
  new.games_played := coalesce(stats.games_played, 0);
  new.games_won := coalesce(stats.games_won, 0);
  new.average_score := stats.average_score;
  new.worst_score := stats.worst_score;
  new.mp_games_played := coalesce(mp.played, 0);
  new.mp_games_won := coalesce(mp.won, 0);
  new.mp_best_win_streak := coalesce(mp.best_win_streak, 0);

  return new;
end;
$$;

drop trigger if exists sync_leaderboard_truth on public.leaderboard_entries;
create trigger sync_leaderboard_truth
  before insert or update of
    level, total_xp, games_played, games_won, average_score, worst_score,
    mp_games_played, mp_games_won, mp_best_win_streak
  on public.leaderboard_entries
  for each row execute function public.sync_leaderboard_truth();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. game_history still carried its original migration-0001 owner-insert
--    policy — never revoked when 0035 locked down player_stats/
--    achievement_counters alongside it. The real write (solo-verify, via
--    its service-role key) bypasses RLS entirely and is unaffected by this;
--    closing it just removes a client's ability to insert a fabricated
--    "recent game" row directly. Low blast radius (it's only ever read
--    back as the signed-in owner's own private history, never used by any
--    stats/achievement/leaderboard logic) but a genuine unused write path.
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists "game_history: owner insert" on public.game_history;

do $$ begin
  insert into public.schema_migrations (version) values ('0050_anticheat_audit_2026_09')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
