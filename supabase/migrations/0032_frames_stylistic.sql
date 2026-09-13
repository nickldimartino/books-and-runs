-- Books & Runs — avatar frames become purely stylistic, free picks.
-- Run this once in the Supabase SQL editor, after 0001–0031.
--
-- Bronze/Silver/Gold/Diamond frames used to require the exact same level
-- milestones (10/25/50/100) as the badge's own 🥉🥈🥇💎 — two gated systems
-- saying the same thing about a person's level, plus the (now-removed)
-- win-rate rank badge as a third. The badge is the one place level shows
-- up now; frames are just a color to pick, no requirement at all — only
-- "Grandmaster" (every achievement category mastered) stays earned, since
-- that's a different kind of flex than a level number.
--
-- Renamed rather than added alongside, so nobody ends up with two frames
-- for the same ring color: bronze->amber, silver->mist, gold->citrine,
-- diamond->sky. Keep AVATAR_FRAME_OPTIONS in app/lib/profileCosmetics.ts
-- in sync with these ids by hand if they ever change again.
--
-- ─────────────────────────────────────────────────────────────────────────
-- A real bug this migration's own bulk UPDATE surfaced on first attempt:
-- validate_cosmetic_columns() fires on any UPDATE touching avatar_frame/
-- title/banner/badge, and its body unconditionally re-checks ALL FOUR
-- columns (not just the one that changed) via cosmetic_unlocked() ->
-- compute_level() -> compute_total_xp() -> mp_my_stats(). mp_my_stats()
-- computes stats for auth.uid() — the CALLING SESSION — not the account
-- actually being validated. That's invisible in normal app use (a client
-- only ever equips cosmetics on their own signed-in account, so auth.uid()
-- and the row's user_id are always the same), but a SQL-editor migration
-- has no authenticated session at all: bulk-renaming avatar_frame on a row
-- that also happens to have a gated title/badge/banner already set fires
-- this same trigger, which needs a real level, which calls mp_my_stats(),
-- which immediately raises "not authenticated" — unrelated to the frame
-- rename itself.
--
-- Fixed at the root: mp_stats_for(p_user_id) is the same computation,
-- parameterized properly instead of trusting auth.uid(); mp_my_stats()
-- becomes a thin wrapper over it (unchanged for every existing client
-- caller — see app/lib/mpStore.ts's getMyMpStats), and compute_total_xp/
-- category_mastered (migration 0027) now call mp_stats_for() directly so
-- they work correctly regardless of who — or what — is asking.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.mp_stats_for(p_user_id uuid)
returns table (
  played int,
  won int,
  lost int,
  current_win_streak int,
  best_win_streak int,
  podiums int,
  biggest_table_beaten int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := p_user_id;
  r record;
  cur int := 0;
  best int := 0;
  running int := 0;
  streak_live boolean := true;
  p_played int := 0;
  p_won int := 0;
  p_lost int := 0;
  p_podiums int := 0;
  p_biggest int := 0;
  my_score numeric;
  n_seats int;
  better int;
begin
  if me is null then
    return query select 0, 0, 0, 0, 0, 0, 0;
    return;
  end if;

  for r in
    select g.seats, g.cumulative_scores, p.seat, p.outcome
    from public.mp_games g
    join public.mp_participants p on p.game_id = g.id and p.user_id = me
    where g.status = 'complete'
    order by g.completed_at desc nulls last
  loop
    p_played := p_played + 1;

    if r.outcome = 'won' then
      p_won := p_won + 1;
      running := running + 1;
      if running > best then best := running; end if;
      if streak_live then cur := cur + 1; end if;
    else
      p_lost := p_lost + 1;
      running := 0;
      streak_live := false;
    end if;

    my_score := (r.cumulative_scores ->> r.seat::text)::numeric;
    n_seats := coalesce(jsonb_array_length(r.seats), 2);
    if my_score is not null then
      select count(*) into better
      from jsonb_each_text(r.cumulative_scores) e
      where e.value::numeric < my_score;
      if better + 1 <= ceil(n_seats / 2.0) then
        p_podiums := p_podiums + 1;
      end if;
    end if;

    if r.outcome = 'won' and n_seats > p_biggest then
      p_biggest := n_seats;
    end if;
  end loop;

  return query select p_played, p_won, p_lost, cur, best, p_podiums, p_biggest;
end;
$$;

-- Internal only — not granted to anon/authenticated. Reachable from the
-- outside only via mp_my_stats() (bound to the caller's own auth.uid())
-- or from within compute_total_xp/category_mastered.
revoke execute on function public.mp_stats_for(uuid) from anon, public, authenticated;

create or replace function public.mp_my_stats()
returns table (
  played int,
  won int,
  lost int,
  current_win_streak int,
  best_win_streak int,
  podiums int,
  biggest_table_beaten int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return query select * from public.mp_stats_for(auth.uid());
end;
$$;

revoke execute on function public.mp_my_stats() from anon, public;
grant execute on function public.mp_my_stats() to authenticated;

-- Same bodies as migration 0027, just calling mp_stats_for(p_user_id)
-- instead of mp_my_stats().
create or replace function public.category_mastered(p_user_id uuid, p_category text)
returns boolean
language plpgsql
stable
as $$
declare
  fam record;
  stats record;
  counters jsonb;
  mp record;
  val numeric;
begin
  select games_played, games_won, best_score, wins_by_difficulty
    into stats
    from public.player_stats where user_id = p_user_id;

  select c.counters into counters
    from public.achievement_counters c where c.user_id = p_user_id;

  select * into mp from public.mp_stats_for(p_user_id);

  for fam in
    select * from public.achievement_thresholds where category = p_category
  loop
    val := case fam.source_kind
      when 'counter' then coalesce((counters ->> fam.source_key)::numeric, 0)
      when 'gamesPlayed' then coalesce(stats.games_played, 0)
      when 'gamesWon' then coalesce(stats.games_won, 0)
      when 'bestScore' then
        case when coalesce(stats.games_played, 0) >= 5 then stats.best_score else null end
      when 'winRate' then
        case when coalesce(stats.games_played, 0) >= 10
          then (100.0 * stats.games_won) / stats.games_played
          else 0 end
      when 'winsByDifficulty' then coalesce((stats.wins_by_difficulty ->> fam.source_key)::numeric, 0)
      when 'mpGamesPlayed' then coalesce(mp.played, 0)
      when 'mpGamesWon' then coalesce(mp.won, 0)
      when 'mpBestWinStreak' then coalesce(mp.best_win_streak, 0)
      when 'mpWinRate' then
        case when coalesce(mp.played, 0) >= 6
          then (100.0 * mp.won) / mp.played
          else 0 end
      else null
    end;

    if fam.lower_is_better then
      if val is null or val > fam.expert_threshold then return false; end if;
    else
      if val is null or val < fam.expert_threshold then return false; end if;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.compute_total_xp(p_user_id uuid)
returns numeric
language plpgsql
stable
as $$
declare
  stats record;
  counters jsonb;
  mp record;
  fam record;
  tier record;
  val numeric;
  xp numeric := 0;
begin
  select games_played, games_won, best_score, wins_by_difficulty
    into stats
    from public.player_stats where user_id = p_user_id;

  select c.counters into counters
    from public.achievement_counters c where c.user_id = p_user_id;

  select * into mp from public.mp_stats_for(p_user_id);

  xp := xp + coalesce(stats.games_played, 0) * 5;
  xp := xp + coalesce(stats.games_won, 0) * 100;
  xp := xp + coalesce((stats.wins_by_difficulty ->> 'beginner')::numeric, 0) * 10;
  xp := xp + coalesce((stats.wins_by_difficulty ->> 'easy')::numeric, 0) * 20;
  xp := xp + coalesce((stats.wins_by_difficulty ->> 'medium')::numeric, 0) * 35;
  xp := xp + coalesce((stats.wins_by_difficulty ->> 'hard')::numeric, 0) * 55;
  xp := xp + coalesce((stats.wins_by_difficulty ->> 'expert')::numeric, 0) * 80;

  for fam in select * from public.achievement_thresholds loop
    val := case fam.source_kind
      when 'counter' then coalesce((counters ->> fam.source_key)::numeric, 0)
      when 'gamesPlayed' then coalesce(stats.games_played, 0)
      when 'gamesWon' then coalesce(stats.games_won, 0)
      when 'bestScore' then
        case when coalesce(stats.games_played, 0) >= 5 then stats.best_score else null end
      when 'winRate' then
        case when coalesce(stats.games_played, 0) >= 10
          then (100.0 * stats.games_won) / stats.games_played
          else 0 end
      when 'winsByDifficulty' then coalesce((stats.wins_by_difficulty ->> fam.source_key)::numeric, 0)
      when 'mpGamesPlayed' then coalesce(mp.played, 0)
      when 'mpGamesWon' then coalesce(mp.won, 0)
      when 'mpBestWinStreak' then coalesce(mp.best_win_streak, 0)
      when 'mpWinRate' then
        case when coalesce(mp.played, 0) >= 6
          then (100.0 * mp.won) / mp.played
          else 0 end
      else null
    end;

    if val is not null then
      for tier in
        select * from (values
          ('beginner', fam.beginner_threshold, 10::numeric),
          ('easy', fam.easy_threshold, 25::numeric),
          ('medium', fam.medium_threshold, 60::numeric),
          ('hard', fam.hard_threshold, 150::numeric),
          ('expert', fam.expert_threshold, 400::numeric)
        ) as t(name, threshold, tier_xp)
      loop
        if (fam.lower_is_better and val <= tier.threshold) or (not fam.lower_is_better and val >= tier.threshold) then
          xp := xp + tier.tier_xp;
        end if;
      end loop;
    end if;
  end loop;

  return xp;
end;
$$;

revoke execute on function public.category_mastered(uuid, text) from anon, public;
grant execute on function public.category_mastered(uuid, text) to authenticated;
revoke execute on function public.compute_total_xp(uuid) from anon, public;
grant execute on function public.compute_total_xp(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- The actual frame rename this migration set out to do.
-- ─────────────────────────────────────────────────────────────────────────

update public.leaderboard_entries set avatar_frame = 'amber' where avatar_frame = 'bronze';
update public.leaderboard_entries set avatar_frame = 'mist' where avatar_frame = 'silver';
update public.leaderboard_entries set avatar_frame = 'citrine' where avatar_frame = 'gold';
update public.leaderboard_entries set avatar_frame = 'sky' where avatar_frame = 'diamond';

-- No unlock requirement for any of the four color frames anymore —
-- cosmetic_unlocked() already treats a (cosmetic_type, cosmetic_key) with
-- no catalog row as free, so removing these rows is the whole fix.
-- "grandmaster" is untouched — still gated on all_categories.
delete from public.cosmetic_unlocks
where cosmetic_type = 'avatar_frame' and cosmetic_key in ('bronze', 'silver', 'gold', 'diamond');

do $$ begin
  insert into public.schema_migrations (version) values ('0032_frames_stylistic')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
