-- Books & Runs — Cosmetic rarity overhaul, phase 2: 4 new badge milestones
-- (stepping-stones on existing requirement_kinds, no SQL-function changes
-- needed — see app/lib/cosmeticRarity.ts's own doc) plus 2 auto-unlocked
-- "Boutique" badges. Run this once in the Supabase SQL editor, after
-- 0001–0050.

-- ─────────────────────────────────────────────────────────────────────────
-- Widen the badge CHECK to admit the 6 new emoji (4 earned + 2 boutique).
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
      '🎩','🕶️'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- The 4 earned milestones — each reuses an existing requirement_kind, so
-- this is the only server-side change they need (see
-- app/lib/avatarPresets.ts's own comment on these entries for why no new
-- rule kind was required). No rows for 🎩/🕶️ (Boutique) — a
-- cosmetic_type/cosmetic_key with no row here is already unconditionally
-- free (cosmetic_unlocked(), 0043_tip_jar.sql:69-71), which is exactly
-- "auto-unlocked while there's no real paywall yet."
-- ─────────────────────────────────────────────────────────────────────────

insert into public.cosmetic_unlocks (cosmetic_type, cosmetic_key, requirement_kind, requirement_value) values
  -- 🔰 — an early on-ramp below the existing Level 10 bronze medal
  ('badge', '🔰', 'level', '5'),
  -- 🛡️ — a gap-filler between Level 100 (💎) and Level 250 (🌌)
  ('badge', '🛡️', 'level', '150'),
  -- 🎯 — a stepping-stone before Specialist (3 categories mastered)
  ('badge', '🎯', 'categories_count', '1'),
  -- 🕯️ — a stepping-stone before Unbroken (30-day Daily Deal streak)
  ('badge', '🕯️', 'daily_deal_streak', '7')
on conflict (cosmetic_type, cosmetic_key) do update
  set requirement_kind = excluded.requirement_kind,
      requirement_value = excluded.requirement_value;

do $$ begin
  insert into public.schema_migrations (version) values ('0051_badge_rarity_milestones')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
