-- Books & Runs — the profile "showcase": a pinned trophy case, and
-- milestone-gated premium avatar emoji.
-- Run this once in the Supabase SQL editor, after 0001–0025.
--
-- Two independent things, both on leaderboard_entries (see 0006's own
-- header for why anything shown to other players lives there):
--
-- 1. `showcase` — up to 6 achievements (as "familyId:tier" strings, e.g.
--    "books_melded:hard") the account has chosen to feature on their
--    profile. Self-reported, same trust model as every other column here
--    (display_name, bio, the stat columns) — the app only ever lets you
--    pick from your own already-unlocked achievements, but nothing here
--    re-derives that server-side. Showing a badge you didn't earn is low-
--    stakes vanity, not meaningfully different from every other self-
--    reported number already on this table.
--
-- 2. Premium avatar emoji — a fixed set of emoji (see
--    app/lib/avatarPresets.ts's PREMIUM_EMOJI_OPTIONS, which this must
--    stay in sync with) that require either a level milestone or fully
--    mastering one of achievements.ts's 9 categories. UNLIKE the showcase
--    above, this one *is* enforced here, by a trigger — see the "premium
--    avatar emoji" section below for why the showcase and this get
--    different treatment despite looking similar.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Trophy case
-- ─────────────────────────────────────────────────────────────────────────

alter table public.leaderboard_entries
  add column if not exists showcase text[] not null default '{}';

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_showcase_size_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_showcase_size_ok
  check (array_length(showcase, 1) is null or array_length(showcase, 1) <= 6);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Premium avatar emoji
-- ─────────────────────────────────────────────────────────────────────────

-- Extends migration 0024's fixed emoji list with the premium set. Keep
-- both the free and premium halves byte-for-byte in sync with
-- EMOJI_OPTIONS / PREMIUM_EMOJI_OPTIONS in app/lib/avatarPresets.ts. Note
-- 👑 and 💎 moved from the free set (0024) into the premium one here —
-- anyone who'd already picked one keeps it (a CHECK only applies to new
-- writes), but re-selecting either now requires actually qualifying.
alter table public.leaderboard_entries
  drop constraint if exists leaderboard_avatar_emoji_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_avatar_emoji_ok check (
    avatar_emoji is null or avatar_emoji in (
      -- free (46)
      '😀','😎','🤠','🥸','🤓','🧐','😺','🐯','🦁','🐵','🐼','🐨',
      '🦊','🐺','🦄','🐲','🐙','🦋','🐝','🌵','🍉','🍕','🎸','🎧',
      '⚽','🏀','🎯','🎲','🚀','⚡','🔥','🌈','🌙','⭐','♠️','♥️',
      '♦️','♣️','🃏','🎭','🍀','⚓','🎨','🥷','🦖','🐉',
      -- premium: level milestones
      '🥉','🥈','🥇','💎',
      -- premium: category mastery
      '📊','🎖️','🧩','🪄','🔄','🚪','📜','🎪','👑'
    )
  );

-- A small, static mirror of src/achievements.ts's per-family EXPERT-tier
-- thresholds — just enough to answer "has this account maxed out every
-- family in category X" server-side, for the category-mastery emoji below.
-- Only the Expert threshold is needed (not all 5 tiers): thresholds are
-- monotonically increasing per family, so meeting Expert already implies
-- every lower tier is met too. THIS TABLE MUST BE UPDATED BY HAND if
-- achievements.ts's ACHIEVEMENT_FAMILIES ever changes (a family added/
-- removed/renamed, its category changed, or its Expert threshold changed)
-- — there's no automatic sync between the TypeScript and this copy.
create table if not exists public.achievement_expert_thresholds (
  family_id text primary key,
  category text not null,
  -- Matches achievements.ts's AchievementSource["kind"].
  source_kind text not null,
  -- The achievement_counters key (source_kind = 'counter') or AI difficulty
  -- (source_kind = 'winsByDifficulty') this family reads; null for every
  -- other source_kind, which reads a fixed player_stats/mp_my_stats() field.
  source_key text,
  expert_threshold numeric not null,
  lower_is_better boolean not null default false
);

truncate public.achievement_expert_thresholds;
insert into public.achievement_expert_thresholds
  (family_id, category, source_kind, source_key, expert_threshold, lower_is_better)
values
  ('games_played', 'accountStats', 'gamesPlayed', null, 1000, false),
  ('games_won', 'accountStats', 'gamesWon', null, 100, false),
  ('best_score', 'accountStats', 'bestScore', null, 0, true),
  ('win_rate', 'accountStats', 'winRate', null, 80, false),
  ('mp_games_played', 'multiplayer', 'mpGamesPlayed', null, 60, false),
  ('mp_games_won', 'multiplayer', 'mpGamesWon', null, 50, false),
  ('mp_win_streak', 'multiplayer', 'mpBestWinStreak', null, 12, false),
  ('mp_win_rate', 'multiplayer', 'mpWinRate', null, 80, false),
  ('wins_vs_beginner', 'aiRivals', 'winsByDifficulty', 'beginner', 100, false),
  ('wins_vs_easy', 'aiRivals', 'winsByDifficulty', 'easy', 100, false),
  ('wins_vs_medium', 'aiRivals', 'winsByDifficulty', 'medium', 100, false),
  ('wins_vs_hard', 'aiRivals', 'winsByDifficulty', 'hard', 100, false),
  ('wins_vs_expert', 'aiRivals', 'winsByDifficulty', 'expert', 100, false),
  ('books_melded', 'melding', 'counter', 'books_melded', 1000, false),
  ('runs_melded', 'melding', 'counter', 'runs_melded', 1000, false),
  ('oversized_books_melded', 'melding', 'counter', 'oversized_books_melded', 100, false),
  ('oversized_runs_melded', 'melding', 'counter', 'oversized_runs_melded', 100, false),
  ('wilds_used_in_melds', 'melding', 'counter', 'wilds_used_in_melds', 500, false),
  ('melds_with_zero_wilds', 'melding', 'counter', 'melds_with_zero_wilds', 500, false),
  ('cards_laid_off', 'layingOff', 'counter', 'cards_laid_off', 1000, false),
  ('wilds_laid_off', 'layingOff', 'counter', 'wilds_laid_off', 400, false),
  ('laid_off_onto_opponent', 'layingOff', 'counter', 'laid_off_onto_opponent', 400, false),
  ('ambiguous_wild_choices_made', 'layingOff', 'counter', 'ambiguous_wild_choices_made', 100, false),
  ('cards_drawn_blind', 'drawDiscard', 'counter', 'cards_drawn_blind', 2000, false),
  ('cards_drawn_from_discard', 'drawDiscard', 'counter', 'cards_drawn_from_discard', 800, false),
  ('wilds_drawn', 'drawDiscard', 'counter', 'wilds_drawn', 400, false),
  ('jokers_drawn', 'drawDiscard', 'counter', 'jokers_drawn', 200, false),
  ('cards_discarded', 'drawDiscard', 'counter', 'cards_discarded', 2000, false),
  ('rounds_won', 'goingOut', 'counter', 'rounds_won', 500, false),
  ('rounds_won_no_discard', 'goingOut', 'counter', 'rounds_won_no_discard', 100, false),
  ('rounds_won_via_discard', 'goingOut', 'counter', 'rounds_won_via_discard', 400, false),
  ('rounds_won_final_round', 'goingOut', 'counter', 'rounds_won_final_round', 50, false),
  ('zero_penalty_games', 'goingOut', 'counter', 'zero_penalty_games', 50, false),
  ('completed_round_1', 'contracts', 'counter', 'completed_round_1', 400, false),
  ('completed_round_2', 'contracts', 'counter', 'completed_round_2', 400, false),
  ('completed_round_3', 'contracts', 'counter', 'completed_round_3', 400, false),
  ('completed_round_4', 'contracts', 'counter', 'completed_round_4', 200, false),
  ('completed_round_5', 'contracts', 'counter', 'completed_round_5', 200, false),
  ('completed_round_6', 'contracts', 'counter', 'completed_round_6', 400, false),
  ('completed_round_7', 'contracts', 'counter', 'completed_round_7', 100, false),
  ('pass_and_play_games', 'tableComposition', 'counter', 'pass_and_play_games', 100, false),
  ('solo_vs_ai_games', 'tableComposition', 'counter', 'solo_vs_ai_games', 400, false),
  ('large_table_games', 'tableComposition', 'counter', 'large_table_games', 100, false),
  ('turns_taken', 'tableComposition', 'counter', 'turns_taken', 5000, false);

alter table public.achievement_expert_thresholds enable row level security;
drop policy if exists "achievement_expert_thresholds: any signed-in read" on public.achievement_expert_thresholds;
create policy "achievement_expert_thresholds: any signed-in read" on public.achievement_expert_thresholds
  for select using (auth.role() = 'authenticated');

-- Whether `p_user_id` has every family in `p_category` at Expert tier —
-- reads the exact same underlying tables achievements.ts's own
-- allAchievements() reads client-side (player_stats, achievement_counters,
-- mp_my_stats()), just re-implemented against the mirror table above.
-- Deliberately NOT security definer: it runs with the caller's own
-- privileges, which is fine (and safer) here since the only real caller is
-- the trigger below, itself only ever firing for a user updating their own
-- leaderboard_entries row — the existing owner-read policies on
-- player_stats/achievement_counters already let that same user read their
-- own data.
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
    select * from public.achievement_expert_thresholds where category = p_category
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

revoke execute on function public.category_mastered(uuid, text) from anon, public;
grant execute on function public.category_mastered(uuid, text) to authenticated;

-- The actual gate: rejects setting avatar_emoji to a premium value the
-- account hasn't earned. Fires only when avatar_emoji is part of the
-- write (see "update of avatar_emoji" below) — a display-name/bio/photo/
-- stats upsert that never touches this column doesn't invoke it at all.
-- Raises a plain, matchable message rather than relying on a generic
-- constraint-violation code, since there's no standard Postgres code for
-- "you haven't earned this yet" — see leaderboardStore.ts's
-- PremiumEmojiLockedError.
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
    if coalesce(new.level, 0) < required_level then
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

drop trigger if exists validate_premium_avatar_emoji on public.leaderboard_entries;
create trigger validate_premium_avatar_emoji
  before insert or update of avatar_emoji on public.leaderboard_entries
  for each row execute function public.validate_premium_avatar_emoji();

do $$ begin
  insert into public.schema_migrations (version) values ('0026_profile_showcase')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
