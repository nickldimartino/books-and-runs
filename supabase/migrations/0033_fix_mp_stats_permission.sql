-- Books & Runs — fixes 0032's own mistake: nothing could save a frame,
-- title, banner, or badge after that migration ran.
-- Run this once in the Supabase SQL editor, after 0001–0032.
--
-- 0032 locked mp_stats_for(uuid) down to internal-only (revoked from
-- anon/public/authenticated), on the assumption it would only ever be
-- reached from inside compute_total_xp()/category_mastered() — but
-- neither of those is `security definer`, so a nested call from inside
-- them still runs as whoever actually called them (the real signed-in
-- user, `authenticated`), not as an elevated definer role. The moment
-- validate_cosmetic_columns() reached mp_stats_for() through that chain,
-- Postgres correctly refused it: `authenticated` has no grant on it.
--
-- Fixed properly this time: compute_total_xp() and category_mastered()
-- become `security definer` themselves (same as mp_stats_for(), and the
-- same pattern compute_level()/cosmetic_unlocked() already relied on one
-- level up) — everything from there down now runs under one consistent,
-- elevated identity regardless of who's actually asking, so nesting a
-- definer function inside another no longer depends on the caller
-- happening to also have direct grants on it. mp_stats_for() itself stays
-- locked down; nobody needs direct access to it anymore.

create or replace function public.category_mastered(p_user_id uuid, p_category text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
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
security definer
set search_path = public
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

do $$ begin
  insert into public.schema_migrations (version) values ('0033_fix_mp_stats_permission')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
