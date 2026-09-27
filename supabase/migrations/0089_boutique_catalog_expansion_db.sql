-- Books & Runs — closes a real gap found while reconciling the Boutique
-- store wave (0085–0088) against the final, expanded catalog
-- (app/lib/avatarPresets.ts / profileCosmetics.ts / bannerPresets.ts, 15
-- items per category, 2/3/4/3/2/1 rarity spread — see /tmp/wave/store.md).
-- Run this once, after 0085–0088, in the Supabase SQL editor.
--
-- What was missing:
--   1. The catalog expansion added 5 new items each to badge/avatar_frame/
--      title/banner (on top of the 10 each from 0053/0054) — but only
--      those original 10/category ever got a `cosmetic_unlocks` row or a
--      spot in `leaderboard_badge_ok`/`leaderboard_banner_ok`'s allow-list
--      (avatar_frame/title have no CHECK constraint at all — see 0054's own
--      comment — so they only ever needed the cosmetic_unlocks row). The 5
--      new items per category had neither: equipping one would either be
--      rejected outright (badge/banner: the CHECK constraint doesn't allow
--      the new value yet) or — worse — succeed for free for anyone,
--      because `cosmetic_unlocked()` returns TRUE when no `cosmetic_unlocks`
--      row exists at all for a given (type, key) (frame/title: no CHECK
--      constraint means nothing would have stopped this).
--   2. A brand-new category, `avatar_emoji` (the profile PICTURE — the DB
--      column is `leaderboard_entries.avatar_emoji`, whose 46 free values
--      are exactly what `leaderboard_avatar_emoji_ok` already allows — see
--      0031's own comment, "avatar_emoji is free-picks only now"; distinct
--      from `badge`, the small glyph next to your name, which is an
--      unrelated column/cosmetic_type). This category never had ANY
--      entitlement-aware server enforcement: `validate_cosmetic_columns()`
--      (0031) checks avatar_frame/title/banner/badge but never
--      avatar_emoji, so the picture column's only gate today is that
--      static CHECK allow-list. This migration adds the 15 new purchasable
--      picture emoji to that allow-list AND, for the first time, makes
--      picking one of them a real server-checked entitlement — everything
--      else about the column (the free 46) is completely unchanged.
--
--      Reuses cosmetic_type = 'avatar_emoji' for these new rows (not a new
--      type name) so cosmetic_unlocked()'s existing, unmodified sku
--      derivation (`cosmetic_type || ':' || cosmetic_key`, the same
--      mechanism every other boutique category already relies on) lines up
--      exactly with app/lib/storeSku.ts's client-side convention
--      ("avatar_emoji:<emoji>") with no special-casing anywhere. This is
--      safe to reuse: 0031 already moved every *old* 'avatar_emoji' row
--      (the level-medal badges) to cosmetic_type = 'badge', so no row under
--      'avatar_emoji' exists before this migration — nothing to collide
--      with.
--
-- Card face/back need nothing here — they're deliberately client-side-only
-- (see app/lib/cardCosmeticUnlocks.ts's own doc), unaffected by this file.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Widen leaderboard_badge_ok for the 5 new boutique badges.
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
      '🎻','🧨','🔮','🛸','🧿','🗝️','🎆','🏹',
      '🥃','🦉','🎰','🀄','🎴'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Widen leaderboard_banner_ok for the 5 new boutique banners.
-- ─────────────────────────────────────────────────────────────────────────

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
      'velvet', 'moonlight', 'champagne', 'smokedquartz', 'rosewood',
      'sapphirevein', 'amberglass', 'charcoalbloom', 'peacock', 'cassis',
      'obsidiantide', 'wildberry', 'goldenhour', 'glacialrift', 'solarflare'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Widen leaderboard_avatar_emoji_ok for the 15 new boutique PICTURE
--    emoji, on top of the 46 free ones (unchanged).
-- ─────────────────────────────────────────────────────────────────────────

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_avatar_emoji_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_avatar_emoji_ok check (
    avatar_emoji is null or avatar_emoji in (
      '😀','😎','🤠','🥸','🤓','🧐','😺','🐯','🦁','🐵','🐼','🐨',
      '🦊','🐺','🦄','🐲','🐙','🦋','🐝','🌵','🍉','🍕','🎸','🎧',
      '⚽','🏀','🎯','🎲','🚀','⚡','🔥','🌈','🌙','⭐','♠️','♥️',
      '♦️','♣️','🃏','🎭','🍀','⚓','🎨','🥷','🦖','🐉',
      '🐢','🐌','🦥','🦔','🐿️','🦦','🦫','🦭','🦜','🦩','🐊','🐳','🦈','🦑','🦅'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Make the avatar_emoji (picture) column entitlement-aware for the new
--    boutique values — the first real server-side gate this column has
--    ever had. cosmetic_unlocked() already returns true for any value with
--    no matching cosmetic_unlocks row — exactly right for the 46 free
--    emoji above, which get no row here at all (see the file header for
--    why cosmetic_type = 'avatar_emoji' is safe and correct to reuse here).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.validate_cosmetic_columns()
returns trigger
language plpgsql
as $$
begin
  if new.avatar_frame is not null and not public.cosmetic_unlocked(new.user_id, 'avatar_frame', new.avatar_frame) then
    raise exception 'avatar_frame_locked';
  end if;
  if new.title is not null and not public.cosmetic_unlocked(new.user_id, 'title', new.title) then
    raise exception 'title_locked';
  end if;
  if new.banner is not null and not public.cosmetic_unlocked(new.user_id, 'banner', new.banner) then
    raise exception 'banner_locked';
  end if;
  if new.badge is not null and not public.cosmetic_unlocked(new.user_id, 'badge', new.badge) then
    raise exception 'badge_locked';
  end if;
  if new.avatar_kind = 'emoji' and new.avatar_emoji is not null
     and not public.cosmetic_unlocked(new.user_id, 'avatar_emoji', new.avatar_emoji) then
    raise exception 'avatar_picture_locked';
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. cosmetic_unlocks rows: the 5 new badge/avatar_frame/title/banner
--    items each, plus all 15 avatar_emoji (picture) items (a brand-new
--    category). requirement_kind = 'boutique', same as every existing
--    Boutique row — 0087 already made that branch check entitlements OR
--    is_creator.
-- ─────────────────────────────────────────────────────────────────────────

insert into public.cosmetic_unlocks (cosmetic_type, cosmetic_key, requirement_kind, requirement_value) values
  ('badge', '🥃', 'boutique', null),
  ('badge', '🦉', 'boutique', null),
  ('badge', '🎰', 'boutique', null),
  ('badge', '🀄', 'boutique', null),
  ('badge', '🎴', 'boutique', null),
  ('avatar_frame', 'garnetvein', 'boutique', null),
  ('avatar_frame', 'stormpewter', 'boutique', null),
  ('avatar_frame', 'verdigris', 'boutique', null),
  ('avatar_frame', 'amethystfrost', 'boutique', null),
  ('avatar_frame', 'voidhalo', 'boutique', null),
  ('title', 'the_sharp', 'boutique', null),
  ('title', 'last_call', 'boutique', null),
  ('title', 'quiet_storm', 'boutique', null),
  ('title', 'smoke_and_mirrors', 'boutique', null),
  ('title', 'table_legend', 'boutique', null),
  ('banner', 'obsidiantide', 'boutique', null),
  ('banner', 'wildberry', 'boutique', null),
  ('banner', 'goldenhour', 'boutique', null),
  ('banner', 'glacialrift', 'boutique', null),
  ('banner', 'solarflare', 'boutique', null),
  ('avatar_emoji', '🐢', 'boutique', null),
  ('avatar_emoji', '🐌', 'boutique', null),
  ('avatar_emoji', '🦥', 'boutique', null),
  ('avatar_emoji', '🦔', 'boutique', null),
  ('avatar_emoji', '🐿️', 'boutique', null),
  ('avatar_emoji', '🦦', 'boutique', null),
  ('avatar_emoji', '🦫', 'boutique', null),
  ('avatar_emoji', '🦭', 'boutique', null),
  ('avatar_emoji', '🦜', 'boutique', null),
  ('avatar_emoji', '🦩', 'boutique', null),
  ('avatar_emoji', '🐊', 'boutique', null),
  ('avatar_emoji', '🐳', 'boutique', null),
  ('avatar_emoji', '🦈', 'boutique', null),
  ('avatar_emoji', '🦑', 'boutique', null),
  ('avatar_emoji', '🦅', 'boutique', null)
on conflict (cosmetic_type, cosmetic_key) do update set
  requirement_kind = excluded.requirement_kind,
  requirement_value = excluded.requirement_value;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Grandfather these 40 newly-gated skus for every existing account —
--    same fairness rule as 0088 ("every account that exists gets the whole
--    LAUNCH catalog free"), extended to cover the items 0088 couldn't have
--    known about yet (it ran before this file added them). Idempotent.
--    Sku format matches app/lib/storeSku.ts: "<category>:<id>" — and
--    matches cosmetic_unlocks.cosmetic_type here 1:1 for every category,
--    avatar_emoji included, since step 4 reuses that same type name.
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare
  new_skus text[] := array[
    'badge:🥃', 'badge:🦉', 'badge:🎰', 'badge:🀄', 'badge:🎴',
    'avatar_frame:garnetvein', 'avatar_frame:stormpewter', 'avatar_frame:verdigris',
    'avatar_frame:amethystfrost', 'avatar_frame:voidhalo',
    'title:the_sharp', 'title:last_call', 'title:quiet_storm',
    'title:smoke_and_mirrors', 'title:table_legend',
    'banner:obsidiantide', 'banner:wildberry', 'banner:goldenhour',
    'banner:glacialrift', 'banner:solarflare',
    'avatar_emoji:🐢', 'avatar_emoji:🐌', 'avatar_emoji:🦥', 'avatar_emoji:🦔', 'avatar_emoji:🐿️',
    'avatar_emoji:🦦', 'avatar_emoji:🦫', 'avatar_emoji:🦭', 'avatar_emoji:🦜', 'avatar_emoji:🦩',
    'avatar_emoji:🐊', 'avatar_emoji:🐳', 'avatar_emoji:🦈', 'avatar_emoji:🦑', 'avatar_emoji:🦅'
  ];
begin
  insert into public.entitlements (user_id, sku, source)
  select le.user_id, sku, 'launch_grandfather'
  from public.leaderboard_entries le
  cross join unnest(new_skus) as sku
  on conflict (user_id, sku) do nothing;
end $$;

insert into public.schema_migrations (version) values ('0089_boutique_catalog_expansion_db')
on conflict (version) do nothing;
