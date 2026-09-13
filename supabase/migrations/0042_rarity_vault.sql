-- Books & Runs — the Rarity Vault: Epic/Mythic/Prismatic cosmetics, plus a
-- Creator-exclusive frame + banner.
-- Run this once in the Supabase SQL editor, after 0001–0041.
--
-- Adds 3 tiers above what already existed (Level 100 / all-9-categories
-- Grandmaster):
--   Epic        — 3 of 9 / 6 of 9 achievement categories mastered
--   Mythic      — Level 250, 500 solo games played, a 30-day Daily Deal
--                 streak, a 12-week Weekly Challenge streak
--   Prismatic   — the single apex reward: every category mastered AND
--                 Level 250 AND a 30-day Daily Deal streak, all at once
-- plus a Creator-only frame + banner (leaderboard_entries.is_creator).
--
-- Each reward is one badge + avatar frame + title + banner sharing a name
-- (see app/lib/cosmeticUnlocks.ts's own doc for the client-side mirror of
-- everything below) — except the Creator reward, which is frame + banner
-- only (the existing "Creator" pill already covers the same ground a
-- badge/title would).
--
-- Deliberately gates "games played" on leaderboard_entries.games_played
-- alone, not + mp_games_played — the MP count isn't protected by the same
-- server-side trigger the solo one is (migration 0035), so including it
-- would reopen a self-reported-stats hole for this one new reward.

-- ── widen the two CHECK-constrained columns ────────────────────────────
-- (avatar_frame and title have no CHECK at all — see migration 0032/0034's
-- own notes — so those two need no constraint change, only new
-- cosmetic_unlocks rows below.)

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_banner_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_banner_ok check (
    banner is null or banner in (
      'forest', 'sunset', 'ocean', 'ember', 'grape', 'meadow',
      'slate', 'rose', 'gold', 'midnight', 'coral', 'ice',
      'aurora', 'blossom', 'storm', 'lagoon', 'wildfire', 'twilight',
      'denim', 'plum', 'mint', 'cottonCandy',
      'grandmaster',
      'specialist', 'virtuoso', 'ascendant', 'ironwill', 'unbroken',
      'undefeated', 'prismatic', 'dealerstable'
    )
  );

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_badge_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_badge_ok check (
    badge is null or badge in (
      '🥉','🥈','🥇','💎',
      '📊','🎖️','🧩','🪄','🔄','🚪','📜','🎪','👑',
      '🧭','🏵️','🌌','⚔️','🏮','🏆','💫'
    )
  );

-- ── extend the requirement checker with the new rule kinds ─────────────

create or replace function public.cosmetic_unlocked(p_user_id uuid, p_cosmetic_type text, p_cosmetic_key text)
returns boolean
language plpgsql
stable
as $$
declare
  req record;
  cat text;
  mastered_count int;
  total_categories int;
begin
  select * into req from public.cosmetic_unlocks
    where cosmetic_type = p_cosmetic_type and cosmetic_key = p_cosmetic_key;
  if req is null then
    return true;
  end if;

  if req.requirement_kind = 'level' then
    return public.compute_level(p_user_id) >= req.requirement_value::integer;

  elsif req.requirement_kind = 'category' then
    return public.category_mastered(p_user_id, req.requirement_value);

  elsif req.requirement_kind = 'all_categories' then
    for cat in select distinct category from public.achievement_thresholds loop
      if not public.category_mastered(p_user_id, cat) then
        return false;
      end if;
    end loop;
    return true;

  elsif req.requirement_kind = 'categories_count' then
    mastered_count := 0;
    for cat in select distinct category from public.achievement_thresholds loop
      if public.category_mastered(p_user_id, cat) then
        mastered_count := mastered_count + 1;
      end if;
    end loop;
    return mastered_count >= req.requirement_value::integer;

  elsif req.requirement_kind = 'games_played' then
    return coalesce(
      (select games_played from public.leaderboard_entries where user_id = p_user_id), 0
    ) >= req.requirement_value::integer;

  elsif req.requirement_kind = 'daily_deal_streak' then
    return coalesce(
      (select daily_deal_best_streak from public.leaderboard_entries where user_id = p_user_id), 0
    ) >= req.requirement_value::integer;

  elsif req.requirement_kind = 'weekly_challenge_streak' then
    return coalesce(
      (select weekly_challenge_best_streak from public.leaderboard_entries where user_id = p_user_id), 0
    ) >= req.requirement_value::integer;

  elsif req.requirement_kind = 'complete' then
    if public.compute_level(p_user_id) < 250 then
      return false;
    end if;
    if coalesce(
      (select daily_deal_best_streak from public.leaderboard_entries where user_id = p_user_id), 0
    ) < 30 then
      return false;
    end if;
    total_categories := 0;
    for cat in select distinct category from public.achievement_thresholds loop
      total_categories := total_categories + 1;
      if not public.category_mastered(p_user_id, cat) then
        return false;
      end if;
    end loop;
    return total_categories > 0;

  elsif req.requirement_kind = 'creator_only' then
    return coalesce(
      (select is_creator from public.leaderboard_entries where user_id = p_user_id), false
    );
  end if;

  return false;
end;
$$;

-- ── the new catalog rows ─────────────────────────────────────────────────
-- Upsert, not truncate-and-reseed (unlike 0028's initial seed) — this runs
-- against a live catalog with 0026-0034's existing rows already in it.

insert into public.cosmetic_unlocks (cosmetic_type, cosmetic_key, requirement_kind, requirement_value) values
  -- Specialist — 3 of 9 categories mastered
  ('badge', '🧭', 'categories_count', '3'),
  ('avatar_frame', 'specialist', 'categories_count', '3'),
  ('title', 'specialist', 'categories_count', '3'),
  ('banner', 'specialist', 'categories_count', '3'),
  -- Virtuoso — 6 of 9 categories mastered
  ('badge', '🏵️', 'categories_count', '6'),
  ('avatar_frame', 'virtuoso', 'categories_count', '6'),
  ('title', 'virtuoso', 'categories_count', '6'),
  ('banner', 'virtuoso', 'categories_count', '6'),
  -- Ascendant — Level 250
  ('badge', '🌌', 'level', '250'),
  ('avatar_frame', 'ascendant', 'level', '250'),
  ('title', 'ascendant', 'level', '250'),
  ('banner', 'ascendant', 'level', '250'),
  -- Iron Will — 500 solo/pass-and-play games played
  ('badge', '⚔️', 'games_played', '500'),
  ('avatar_frame', 'ironwill', 'games_played', '500'),
  ('title', 'ironwill', 'games_played', '500'),
  ('banner', 'ironwill', 'games_played', '500'),
  -- Unbroken — 30-day Daily Deal best streak
  ('badge', '🏮', 'daily_deal_streak', '30'),
  ('avatar_frame', 'unbroken', 'daily_deal_streak', '30'),
  ('title', 'unbroken', 'daily_deal_streak', '30'),
  ('banner', 'unbroken', 'daily_deal_streak', '30'),
  -- Undefeated — 12-week Weekly Challenge best streak
  ('badge', '🏆', 'weekly_challenge_streak', '12'),
  ('avatar_frame', 'undefeated', 'weekly_challenge_streak', '12'),
  ('title', 'undefeated', 'weekly_challenge_streak', '12'),
  ('banner', 'undefeated', 'weekly_challenge_streak', '12'),
  -- Complete (Prismatic) — every category mastered + Level 250 + 30-day streak
  ('badge', '💫', 'complete', null),
  ('avatar_frame', 'prismatic', 'complete', null),
  ('title', 'prismatic', 'complete', null),
  ('banner', 'prismatic', 'complete', null),
  -- Dealer's Table — exclusive to the creator; frame + banner only
  ('avatar_frame', 'dealerstable', 'creator_only', null),
  ('banner', 'dealerstable', 'creator_only', null)
on conflict (cosmetic_type, cosmetic_key) do update
  set requirement_kind = excluded.requirement_kind,
      requirement_value = excluded.requirement_value;

do $$ begin
  insert into public.schema_migrations (version) values ('0042_rarity_vault')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
