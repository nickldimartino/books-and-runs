-- Books & Runs — gate the Boutique track behind a real requirement_kind
-- instead of leaving it unconditionally free. Run this once in the
-- Supabase SQL editor, after 0001–0052.
--
--   1. A new `boutique` requirement_kind on cosmetic_unlocked() — reads
--      exactly like `creator_only` today (is_creator only), but kept as
--      its own kind rather than reusing creator_only outright: creator_only
--      also gates a genuinely permanent creator-exclusive item (Dealer's
--      Table) that should never become purchasable, and conflating the two
--      would mean splitting them back apart later. With its own kind,
--      turning the Boutique into a real purchase later is a single-branch
--      change here (checking a purchases table instead of is_creator) —
--      no cosmetic_unlocks row ever has to move.
--   2. cosmetic_unlocks rows for the 8 existing Boutique items across
--      badge/frame/title/banner (🎩🕶️, opal/jade, night_owl/the_bluffer,
--      velvet/moonlight — all already valid values, no CHECK widening
--      needed). Card face (Outline) and card back (Static) are NOT server-
--      enforced — see app/lib/cardCosmeticUnlocks.ts's own doc on why that
--      whole category is deliberately client-side-only — so they get no
--      row here; app/lib/cardBackStore.ts/cardFaceStore.ts's own `unlock`
--      field plus useCardUnlockContext's is_creator fetch is the entire
--      gate for those two.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. cosmetic_unlocked() — verbatim copy of 0052's body, plus one new
--    elsif branch.
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

  elsif req.requirement_kind = 'boutique' then
    return coalesce(
      (select is_creator from public.leaderboard_entries where user_id = p_user_id), false
    );
  end if;

  return false;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. cosmetic_unlocks rows for the 8 existing Boutique items. Anyone who
--    already has one of these applied (only possible for the creator's own
--    account, or a client that set it before this migration ran) keeps it
--    — this only changes what a *new* pick requires, matching every prior
--    cosmetic_unlocks addition's own behavior.
-- ─────────────────────────────────────────────────────────────────────────

insert into public.cosmetic_unlocks (cosmetic_type, cosmetic_key, requirement_kind, requirement_value) values
  ('badge', '🎩', 'boutique', null),
  ('badge', '🕶️', 'boutique', null),
  ('avatar_frame', 'opal', 'boutique', null),
  ('avatar_frame', 'jade', 'boutique', null),
  ('title', 'night_owl', 'boutique', null),
  ('title', 'the_bluffer', 'boutique', null),
  ('banner', 'velvet', 'boutique', null),
  ('banner', 'moonlight', 'boutique', null)
on conflict (cosmetic_type, cosmetic_key) do update set
  requirement_kind = excluded.requirement_kind,
  requirement_value = excluded.requirement_value;

insert into public.schema_migrations (version) values ('0053_boutique_creator_gate')
on conflict (version) do nothing;
