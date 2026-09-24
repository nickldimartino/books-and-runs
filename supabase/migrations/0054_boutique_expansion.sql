-- Books & Runs — Boutique expansion: 2 → 10 items per category (badge,
-- frame, title, banner, card face, card back), every item unique from each
-- other and from every free/earned option. Run this once in the Supabase
-- SQL editor, after 0001–0053.
--
--   1. Widens leaderboard_badge_ok/leaderboard_banner_ok for the 8 new
--      badges (🎻🧨🔮🛸🧿🗝️🎆🏹) and 8 new banners (champagne,
--      smokedquartz, rosewood, sapphirevein, amberglass, charcoalbloom,
--      peacock, cassis). avatar_frame/title have no CHECK constraint (see
--      0032/0042's own comments), so the 8 new frames and 8 new titles need
--      no schema change.
--   2. cosmetic_unlocks rows (requirement_kind = 'boutique', same as 0053)
--      for all 32 new badge/frame/title/banner items. Card face (8 new
--      styles) and card back (8 new patterns) stay client-side-only — see
--      app/lib/cardCosmeticUnlocks.ts's own doc — so they get no row here.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Widen the badge/banner CHECKs.
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
      '🧊','🤝','⚖️','📈',
      '🎻','🧨','🔮','🛸','🧿','🗝️','🎆','🏹'
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
      'velvet', 'moonlight',
      'champagne', 'smokedquartz', 'rosewood', 'sapphirevein',
      'amberglass', 'charcoalbloom', 'peacock', 'cassis'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 2. cosmetic_unlocks rows for the 32 new badge/frame/title/banner items.
-- ─────────────────────────────────────────────────────────────────────────

insert into public.cosmetic_unlocks (cosmetic_type, cosmetic_key, requirement_kind, requirement_value) values
  ('badge', '🎻', 'boutique', null),
  ('badge', '🧨', 'boutique', null),
  ('badge', '🔮', 'boutique', null),
  ('badge', '🛸', 'boutique', null),
  ('badge', '🧿', 'boutique', null),
  ('badge', '🗝️', 'boutique', null),
  ('badge', '🎆', 'boutique', null),
  ('badge', '🏹', 'boutique', null),
  ('avatar_frame', 'aurumveil', 'boutique', null),
  ('avatar_frame', 'obsidianrim', 'boutique', null),
  ('avatar_frame', 'seaglass', 'boutique', null),
  ('avatar_frame', 'copperline', 'boutique', null),
  ('avatar_frame', 'duskgrove', 'boutique', null),
  ('avatar_frame', 'ashwood', 'boutique', null),
  ('avatar_frame', 'cinderglow', 'boutique', null),
  ('avatar_frame', 'winterpearl', 'boutique', null),
  ('title', 'velvet_hand', 'boutique', null),
  ('title', 'silk_road', 'boutique', null),
  ('title', 'midnight_dealer', 'boutique', null),
  ('title', 'the_collector', 'boutique', null),
  ('title', 'gilded_tongue', 'boutique', null),
  ('title', 'backroom_regular', 'boutique', null),
  ('title', 'the_fixer', 'boutique', null),
  ('title', 'diamond_cut', 'boutique', null),
  ('banner', 'champagne', 'boutique', null),
  ('banner', 'smokedquartz', 'boutique', null),
  ('banner', 'rosewood', 'boutique', null),
  ('banner', 'sapphirevein', 'boutique', null),
  ('banner', 'amberglass', 'boutique', null),
  ('banner', 'charcoalbloom', 'boutique', null),
  ('banner', 'peacock', 'boutique', null),
  ('banner', 'cassis', 'boutique', null)
on conflict (cosmetic_type, cosmetic_key) do update set
  requirement_kind = excluded.requirement_kind,
  requirement_value = excluded.requirement_value;

insert into public.schema_migrations (version) values ('0054_boutique_expansion')
on conflict (version) do nothing;
