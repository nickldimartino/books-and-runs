-- Books & Runs — separates the earned "premium emoji" from the profile
-- picture itself, so a photo (or a free emoji) and an earned badge can be
-- shown together instead of one replacing the other.
-- Run this once in the Supabase SQL editor, after 0001–0030.
--
-- Previously, the 13 milestone/category-mastery emoji (avatarPresets.ts's
-- PREMIUM_EMOJI_OPTIONS) were valid `avatar_emoji` values — meaning
-- picking one replaced your whole picture, and using a photo meant giving
-- up ever showing one off. This moves them to a new `badge` column
-- instead: a small overlay shown on top of whatever avatar you actually
-- have (photo or free emoji), not a competing picture. Keep this file's
-- lists in sync with EMOJI_OPTIONS / PREMIUM_EMOJI_OPTIONS by hand if
-- either ever changes.

alter table public.leaderboard_entries
  add column if not exists badge text;

-- Move any account currently using a premium emoji as its whole picture
-- into the new badge column instead, and reset the picture itself to the
-- default free emoji — nobody loses the thing they earned, it just moves
-- to sit alongside their picture rather than being it.
update public.leaderboard_entries
set badge = avatar_emoji
where avatar_kind = 'emoji' and avatar_emoji in (
  '🥉','🥈','🥇','💎','📊','🎖️','🧩','🪄','🔄','🚪','📜','🎪','👑'
);
update public.leaderboard_entries
set avatar_emoji = '😀', avatar_color = coalesce(avatar_color, '#3B82F6')
where avatar_kind = 'emoji' and avatar_emoji in (
  '🥉','🥈','🥇','💎','📊','🎖️','🧩','🪄','🔄','🚪','📜','🎪','👑'
);

-- avatar_emoji is free-picks only now — the premium set moved to `badge`
-- below.
alter table public.leaderboard_entries
  drop constraint if exists leaderboard_avatar_emoji_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_avatar_emoji_ok check (
    avatar_emoji is null or avatar_emoji in (
      '😀','😎','🤠','🥸','🤓','🧐','😺','🐯','🦁','🐵','🐼','🐨',
      '🦊','🐺','🦄','🐲','🐙','🦋','🐝','🌵','🍉','🍕','🎸','🎧',
      '⚽','🏀','🎯','🎲','🚀','⚡','🔥','🌈','🌙','⭐','♠️','♥️',
      '♦️','♣️','🃏','🎭','🍀','⚓','🎨','🥷','🦖','🐉'
    )
  );

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_badge_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_badge_ok check (
    badge is null or badge in (
      '🥉','🥈','🥇','💎',
      '📊','🎖️','🧩','🪄','🔄','🚪','📜','🎪','👑'
    )
  );

-- Same unlock rules that used to gate these as avatar_emoji now gate them
-- as badge instead — renamed in place rather than duplicated.
update public.cosmetic_unlocks set cosmetic_type = 'badge' where cosmetic_type = 'avatar_emoji';

drop trigger if exists validate_cosmetic_columns on public.leaderboard_entries;
drop function if exists public.validate_cosmetic_columns();

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
  return new;
end;
$$;

create trigger validate_cosmetic_columns
  before insert or update of avatar_frame, title, banner, badge on public.leaderboard_entries
  for each row execute function public.validate_cosmetic_columns();

do $$ begin
  insert into public.schema_migrations (version) values ('0031_avatar_badge')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
