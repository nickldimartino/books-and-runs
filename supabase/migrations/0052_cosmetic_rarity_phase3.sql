-- Books & Runs — Cosmetic rarity overhaul, phase 3. Run this once in the
-- Supabase SQL editor, after 0001–0051.
--
--   1. Four new requirement_kinds on cosmetic_unlocked() — worst_score_under,
--      average_score_under, games_tied, mp_win_streak — each reading a
--      column that was already server-verified before this migration (see
--      app/lib/cosmeticUnlocks.ts's own doc on each rule for exactly which
--      migration locked that column down). No new tamper-resistant data
--      source needed, unlike a genuinely new streak type would have.
--   2. Two new named rewards (Steady Hand / average_score_under, Hot Streak
--      / mp_win_streak) as badge + frame + title + banner, matching the
--      existing Specialist/Iron Will/etc. "one reward, four cosmetics"
--      shape. Two single badges (🧊 worst_score_under, 🤝 games_tied),
--      matching the existing 🥇/💎 "just a badge" shape.
--   3. 6 new Boutique items across frame/title/banner (badges got theirs in
--      0051) — no cosmetic_unlocks rows at all, already unconditionally
--      free.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. cosmetic_unlocked() — verbatim copy of 0043's body, plus 4 new
--    elsif branches. average_score_under packs two numbers into one
--    `requirement_value` ("score:minGames", split on ':') rather than a
--    schema change to cosmetic_unlocks — same reasoning `complete`
--    already established for a compound condition (it hardcodes its own
--    thresholds in this function body instead of reading them from a row
--    at all). Both new score-based branches coalesce a null score (no
--    scored game finished yet) to `false`, not null — `returns boolean`
--    can't silently return null here the way a bare comparison would.
-- ─────────────────────────────────────────────────────────────────────────

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

  elsif req.requirement_kind = 'supporter_only' then
    return exists(select 1 from public.supporter_payments where user_id = p_user_id);

  elsif req.requirement_kind = 'worst_score_under' then
    return coalesce(
      (select worst_score from public.leaderboard_entries where user_id = p_user_id) < req.requirement_value::numeric,
      false
    );

  elsif req.requirement_kind = 'average_score_under' then
    return coalesce(
      (select average_score from public.leaderboard_entries where user_id = p_user_id)
        < split_part(req.requirement_value, ':', 1)::numeric
      and coalesce((select games_played from public.leaderboard_entries where user_id = p_user_id), 0)
        >= split_part(req.requirement_value, ':', 2)::integer,
      false
    );

  elsif req.requirement_kind = 'games_tied' then
    return coalesce(
      (select games_tied from public.player_stats where user_id = p_user_id), 0
    ) >= req.requirement_value::integer;

  elsif req.requirement_kind = 'mp_win_streak' then
    return coalesce(
      (select mp_best_win_streak from public.leaderboard_entries where user_id = p_user_id), 0
    ) >= req.requirement_value::integer;
  end if;

  return false;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Widen the badge/banner CHECKs (avatar_frame/title have none — see
--    migration 0032/0042's own comments) for the 10 new items across all
--    four categories.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_badge_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_badge_ok check (
    badge is null or badge in (
      '🥉','🥈','🥇','💎',
      '📊','🎖️','🧩','🪄','🔄','🚪','📜','🎪','👑',
      '🧭','🏵️','🌌','⚔️','🏮','🏆','💫',
      '☕',
      '🔰','🛡️','🎯','🕯️',
      '🎩','🕶️',
      '🧊','🤝','⚖️','📈'
    )
  );

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
      'undefeated', 'prismatic', 'dealerstable',
      'steadyhand', 'hotstreak',
      'velvet', 'moonlight'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. cosmetic_unlocks rows for the 6 earned additions only — no rows for
--    the 6 Boutique items (opal/jade frames, night_owl/the_bluffer titles,
--    velvet/moonlight banners), which is what makes them unconditionally
--    free (see cosmetic_unlocked()'s own "if req is null then return true"
--    above).
-- ─────────────────────────────────────────────────────────────────────────

insert into public.cosmetic_unlocks (cosmetic_type, cosmetic_key, requirement_kind, requirement_value) values
  -- Steady Hand — career average under 70 across 15+ games
  ('badge', '⚖️', 'average_score_under', '70:15'),
  ('avatar_frame', 'steadyhand', 'average_score_under', '70:15'),
  ('title', 'steadyhand', 'average_score_under', '70:15'),
  ('banner', 'steadyhand', 'average_score_under', '70:15'),
  -- Hot Streak — an 8-game real multiplayer win streak
  ('badge', '📈', 'mp_win_streak', '8'),
  ('avatar_frame', 'hotstreak', 'mp_win_streak', '8'),
  ('title', 'hotstreak', 'mp_win_streak', '8'),
  ('banner', 'hotstreak', 'mp_win_streak', '8'),
  -- Ice — never finish a game above 80 points (badge only)
  ('badge', '🧊', 'worst_score_under', '80'),
  -- Handshake — 3 tied games (badge only)
  ('badge', '🤝', 'games_tied', '3')
on conflict (cosmetic_type, cosmetic_key) do update
  set requirement_kind = excluded.requirement_kind,
      requirement_value = excluded.requirement_value;

do $$ begin
  insert into public.schema_migrations (version) values ('0052_cosmetic_rarity_phase3')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
