-- Books & Runs — a much larger variety of avatar background colors,
-- avatar frames, and profile banners.
-- Run this once in the Supabase SQL editor, after 0001–0033.
--
-- Avatar frames need no constraint change here — avatar_frame has no
-- CHECK (see migration 0032's own doc: it's validated only by
-- cosmetic_unlocked(), which treats any key with no cosmetic_unlocks row
-- as free — exactly what the new frame colors are, same as the existing
-- ones). Only avatar_color and banner have a fixed-list CHECK to widen.
-- Keep both lists here in sync with COLOR_OPTIONS (avatarPresets.ts) and
-- BANNER_OPTIONS (bannerPresets.ts) by hand if either changes again.

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_avatar_color_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_avatar_color_ok check (
    avatar_color is null or avatar_color in (
      '#EF4444','#F97316','#F59E0B','#EAB308','#84CC16','#22C55E',
      '#10B981','#14B8A6','#06B6D4','#3B82F6','#6366F1','#8B5CF6',
      '#A855F7','#EC4899','#F43F5E','#64748B',
      '#0EA5E9','#D946EF','#B91C1C','#166534','#1E3A8A','#334155',
      '#A16207','#6EE7B7'
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
      'grandmaster'
    )
  );

do $$ begin
  insert into public.schema_migrations (version) values ('0034_more_cosmetic_variety')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
