-- Books & Runs — fix the premium-emoji level gate to use a live level,
-- not a stale synced snapshot.
-- Run this once in the Supabase SQL editor, after 0001–0026.
--
-- The bug: migration 0026's trigger checked `new.level` — leaderboard_
-- entries.level, a column only ever refreshed when syncLeaderboardStats
-- happens to run (a game finishing, an Account/Leaderboard/Profile page
-- visit). The Edit Profile picker itself computes your level live (from
-- PlayerLevelContext, which reads player_stats/achievement_counters
-- directly) — so a real level-24 account could see 🥉 (needs Level 10)
-- correctly unlocked in the picker, then have the *save* rejected because
-- the stored snapshot the trigger checked hadn't caught up yet. This
-- replaces that snapshot check with a live recomputation, the same way
-- category_mastered() already worked (it was never affected by this bug —
-- it always read player_stats/achievement_counters directly, never a
-- synced snapshot).
--
-- Ports src/leveling.ts's computeTotalXp/levelForXp to SQL, which needs
-- every family's full 5-tier thresholds (XP accrues per unlocked tier, not
-- just the highest) — migration 0026's achievement_expert_thresholds only
-- had the Expert one, enough for category mastery but not this. Replaced
-- here with achievement_thresholds (all 5 tiers); keep BOTH this table and
-- src/achievements.ts's ACHIEVEMENT_FAMILIES in sync by hand if a family
-- or its thresholds ever change.

drop table if exists public.achievement_expert_thresholds cascade;

create table public.achievement_thresholds (
  family_id text primary key,
  category text not null,
  source_kind text not null,
  source_key text,
  beginner_threshold numeric not null,
  easy_threshold numeric not null,
  medium_threshold numeric not null,
  hard_threshold numeric not null,
  expert_threshold numeric not null,
  lower_is_better boolean not null default false
);

insert into public.achievement_thresholds
  (family_id, category, source_kind, source_key,
   beginner_threshold, easy_threshold, medium_threshold, hard_threshold, expert_threshold, lower_is_better)
values
  ('games_played', 'accountStats', 'gamesPlayed', null, 10, 50, 150, 400, 1000, false),
  ('games_won', 'accountStats', 'gamesWon', null, 5, 15, 35, 65, 100, false),
  ('best_score', 'accountStats', 'bestScore', null, 70, 50, 30, 15, 0, true),
  ('win_rate', 'accountStats', 'winRate', null, 10, 25, 40, 60, 80, false),
  ('mp_games_played', 'multiplayer', 'mpGamesPlayed', null, 1, 5, 15, 30, 60, false),
  ('mp_games_won', 'multiplayer', 'mpGamesWon', null, 1, 3, 10, 25, 50, false),
  ('mp_win_streak', 'multiplayer', 'mpBestWinStreak', null, 2, 3, 5, 8, 12, false),
  ('mp_win_rate', 'multiplayer', 'mpWinRate', null, 20, 35, 50, 65, 80, false),
  ('wins_vs_beginner', 'aiRivals', 'winsByDifficulty', 'beginner', 1, 5, 15, 40, 100, false),
  ('wins_vs_easy', 'aiRivals', 'winsByDifficulty', 'easy', 1, 5, 15, 40, 100, false),
  ('wins_vs_medium', 'aiRivals', 'winsByDifficulty', 'medium', 1, 5, 15, 40, 100, false),
  ('wins_vs_hard', 'aiRivals', 'winsByDifficulty', 'hard', 1, 5, 15, 40, 100, false),
  ('wins_vs_expert', 'aiRivals', 'winsByDifficulty', 'expert', 1, 5, 15, 40, 100, false),
  ('books_melded', 'melding', 'counter', 'books_melded', 5, 25, 75, 300, 1000, false),
  ('runs_melded', 'melding', 'counter', 'runs_melded', 5, 25, 75, 300, 1000, false),
  ('oversized_books_melded', 'melding', 'counter', 'oversized_books_melded', 1, 5, 15, 40, 100, false),
  ('oversized_runs_melded', 'melding', 'counter', 'oversized_runs_melded', 1, 5, 15, 40, 100, false),
  ('wilds_used_in_melds', 'melding', 'counter', 'wilds_used_in_melds', 5, 25, 75, 200, 500, false),
  ('melds_with_zero_wilds', 'melding', 'counter', 'melds_with_zero_wilds', 5, 25, 75, 200, 500, false),
  ('cards_laid_off', 'layingOff', 'counter', 'cards_laid_off', 10, 50, 150, 400, 1000, false),
  ('wilds_laid_off', 'layingOff', 'counter', 'wilds_laid_off', 5, 20, 60, 150, 400, false),
  ('laid_off_onto_opponent', 'layingOff', 'counter', 'laid_off_onto_opponent', 5, 20, 60, 150, 400, false),
  ('ambiguous_wild_choices_made', 'layingOff', 'counter', 'ambiguous_wild_choices_made', 1, 5, 15, 40, 100, false),
  ('cards_drawn_blind', 'drawDiscard', 'counter', 'cards_drawn_blind', 25, 100, 300, 750, 2000, false),
  ('cards_drawn_from_discard', 'drawDiscard', 'counter', 'cards_drawn_from_discard', 10, 40, 120, 300, 800, false),
  ('wilds_drawn', 'drawDiscard', 'counter', 'wilds_drawn', 5, 20, 60, 150, 400, false),
  ('jokers_drawn', 'drawDiscard', 'counter', 'jokers_drawn', 3, 10, 30, 75, 200, false),
  ('cards_discarded', 'drawDiscard', 'counter', 'cards_discarded', 25, 100, 300, 750, 2000, false),
  ('rounds_won', 'goingOut', 'counter', 'rounds_won', 5, 25, 75, 200, 500, false),
  ('rounds_won_no_discard', 'goingOut', 'counter', 'rounds_won_no_discard', 1, 5, 15, 40, 100, false),
  ('rounds_won_via_discard', 'goingOut', 'counter', 'rounds_won_via_discard', 5, 20, 60, 150, 400, false),
  ('rounds_won_final_round', 'goingOut', 'counter', 'rounds_won_final_round', 1, 3, 8, 20, 50, false),
  ('zero_penalty_games', 'goingOut', 'counter', 'zero_penalty_games', 1, 3, 8, 20, 50, false),
  ('completed_round_1', 'contracts', 'counter', 'completed_round_1', 5, 20, 60, 150, 400, false),
  ('completed_round_2', 'contracts', 'counter', 'completed_round_2', 5, 20, 60, 150, 400, false),
  ('completed_round_3', 'contracts', 'counter', 'completed_round_3', 5, 20, 60, 150, 400, false),
  ('completed_round_4', 'contracts', 'counter', 'completed_round_4', 3, 10, 30, 75, 200, false),
  ('completed_round_5', 'contracts', 'counter', 'completed_round_5', 3, 10, 30, 75, 200, false),
  ('completed_round_6', 'contracts', 'counter', 'completed_round_6', 5, 20, 60, 150, 400, false),
  ('completed_round_7', 'contracts', 'counter', 'completed_round_7', 1, 5, 15, 40, 100, false),
  ('pass_and_play_games', 'tableComposition', 'counter', 'pass_and_play_games', 1, 5, 15, 40, 100, false),
  ('solo_vs_ai_games', 'tableComposition', 'counter', 'solo_vs_ai_games', 3, 15, 50, 150, 400, false),
  ('large_table_games', 'tableComposition', 'counter', 'large_table_games', 1, 5, 15, 40, 100, false),
  ('turns_taken', 'tableComposition', 'counter', 'turns_taken', 50, 250, 750, 2000, 5000, false);

alter table public.achievement_thresholds enable row level security;
drop policy if exists "achievement_thresholds: any signed-in read" on public.achievement_thresholds;
create policy "achievement_thresholds: any signed-in read" on public.achievement_thresholds
  for select using (auth.role() = 'authenticated');

-- Same logic as 0026's category_mastered(), just against the renamed/
-- fuller table (still only needs the Expert column — meeting Expert
-- already implies every lower tier, since thresholds only increase).
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

  select * into mp from public.mp_my_stats();

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

-- Total account XP, computed live — mirrors src/leveling.ts's
-- computeTotalXp exactly (FINISH_GAME_XP=5, WIN_GAME_XP=100,
-- DIFFICULTY_WIN_XP, ACHIEVEMENT_TIER_XP). Unlike category_mastered above,
-- this needs every family's full tier ladder (an achievement contributes
-- XP for *each* unlocked tier, not just its highest).
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

  select * into mp from public.mp_my_stats();

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

-- Level curve: xp needed to reach level N is 50*N^2 (src/leveling.ts's
-- LEVEL_CURVE_K=50) — inverted here the same way levelForXp does.
create or replace function public.compute_level(p_user_id uuid)
returns integer
language sql
stable
as $$
  select floor(sqrt(greatest(public.compute_total_xp(p_user_id), 0) / 50.0))::integer;
$$;

revoke execute on function public.category_mastered(uuid, text) from anon, public;
grant execute on function public.category_mastered(uuid, text) to authenticated;
revoke execute on function public.compute_total_xp(uuid) from anon, public;
grant execute on function public.compute_total_xp(uuid) to authenticated;
revoke execute on function public.compute_level(uuid) from anon, public;
grant execute on function public.compute_level(uuid) to authenticated;

-- The only actual behavior change: the level branch now calls
-- compute_level(new.user_id) instead of trusting new.level.
create or replace function public.validate_premium_avatar_emoji()
returns trigger
language plpgsql
as $$
declare
  required_level integer;
  required_category text;
begin
  if new.avatar_emoji is null then
    return new;
  end if;

  required_level := case new.avatar_emoji
    when '🥉' then 10
    when '🥈' then 25
    when '🥇' then 50
    when '💎' then 100
    else null
  end;
  if required_level is not null then
    if public.compute_level(new.user_id) < required_level then
      raise exception 'avatar_emoji_locked';
    end if;
    return new;
  end if;

  required_category := case new.avatar_emoji
    when '📊' then 'accountStats'
    when '🎖️' then 'aiRivals'
    when '🧩' then 'melding'
    when '🪄' then 'layingOff'
    when '🔄' then 'drawDiscard'
    when '🚪' then 'goingOut'
    when '📜' then 'contracts'
    when '🎪' then 'tableComposition'
    when '👑' then 'multiplayer'
    else null
  end;
  if required_category is not null and not public.category_mastered(new.user_id, required_category) then
    raise exception 'avatar_emoji_locked';
  end if;

  return new;
end;
$$;

do $$ begin
  insert into public.schema_migrations (version) values ('0027_premium_emoji_live_level')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
