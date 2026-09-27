-- Books & Runs — flips the Boutique's server-side gate from "is_creator
-- only" to "is_creator OR a real purchase", exactly as 0053's own comment
-- anticipated ("a single-branch change here — checking a purchases table
-- instead of is_creator"). Run once in the Supabase SQL editor, after
-- 0085_boutique_entitlements_purchases.sql and
-- 0086_my_entitlements_rpc.sql.
--
-- The sku a boutique cosmetic_unlocks row corresponds to is simply
-- `p_cosmetic_type || ':' || p_cosmetic_key` — cosmetic_type already uses
-- exactly the same strings as app/lib/storeSku.ts's category ("badge",
-- "avatar_frame", "title", "banner", "avatar_emoji" — see 0053/0054's own
-- INSERT statements) and cosmetic_key is already the catalog item's own
-- id/emoji, so no new mapping table is needed: the existing
-- (cosmetic_type, cosmetic_key) pair IS the sku's two halves.
--
-- Verbatim copy of 0053's function body, with only the `boutique` branch
-- changed — every other branch is untouched.

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
    ) or exists(
      select 1 from public.entitlements
      where user_id = p_user_id and sku = p_cosmetic_type || ':' || p_cosmetic_key
    );
  end if;

  return false;
end;
$$;

insert into public.schema_migrations (version) values ('0087_boutique_purchase_check')
on conflict (version) do nothing;
