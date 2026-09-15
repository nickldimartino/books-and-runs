-- Books & Runs — the "Support the developer" tip jar.
-- Run this once in the Supabase SQL editor, after 0001–0042, and after
-- the `stripe-webhook` Edge Function has been deployed (see
-- supabase/functions/README.md) — until then, nothing ever inserts into
-- supporter_payments and the ☕ badge simply stays locked for everyone.
--
-- A one-time, optional tip via a Stripe Payment Link (app/tip/page.tsx) —
-- not a subscription, not a purchasable gameplay advantage. The only
-- ground truth for "did this account actually pay" is this table, written
-- exclusively by the stripe-webhook function's service-role client after
-- Stripe itself confirms a completed checkout — same "zero client-facing
-- RLS on the write side" pattern as daily_deal_completions (0036) and
-- weekly_challenge_completions (0039). No column on leaderboard_entries
-- needed: cosmetic_unlocked() below just checks this table directly.

create table if not exists public.supporter_payments (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Stripe's own checkout.session id — the natural idempotency key, since
  -- Stripe retries a webhook delivery that didn't get a fast 200 back.
  stripe_session_id text primary key,
  amount_cents integer not null,
  currency text not null,
  created_at timestamptz not null default now()
);

alter table public.supporter_payments enable row level security;

drop policy if exists "supporter_payments: owner read" on public.supporter_payments;
create policy "supporter_payments: owner read" on public.supporter_payments
  for select using (auth.uid() = user_id);
-- No insert/update/delete policy — only stripe-webhook's service-role
-- client ever writes this.

-- ─────────────────────────────────────────────────────────────────────────
-- The ☕ "Supporter" badge — earned by having ever tipped, same "creator_
-- only" mechanism (0042) the Dealer's Table frame/banner already use, one
-- new requirement_kind instead of a special-cased column check.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_badge_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_badge_ok check (
    badge is null or badge in (
      '🥉','🥈','🥇','💎',
      '📊','🎖️','🧩','🪄','🔄','🚪','📜','🎪','👑',
      '🧭','🏵️','🌌','⚔️','🏮','🏆','💫',
      '☕'
    )
  );

insert into public.cosmetic_unlocks (cosmetic_type, cosmetic_key, requirement_kind, requirement_value)
values ('badge', '☕', 'supporter_only', null)
on conflict (cosmetic_type, cosmetic_key) do nothing;

-- Verbatim copy of 0042's function, plus one new branch at the end
-- (supporter_only) — every other branch is unchanged.
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
  end if;

  return false;
end;
$$;

do $$ begin
  insert into public.schema_migrations (version) values ('0043_tip_jar')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
