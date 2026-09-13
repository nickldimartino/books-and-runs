-- Books & Runs — avatar frames, nameplate titles, and a public mirror of
-- your equipped card back/face.
-- Run this once in the Supabase SQL editor, after 0001–0027.
--
-- Two new gated cosmetics, alongside the existing premium avatar emoji
-- (migrations 0026/0027) — an avatar frame (a ring around the whole
-- avatar, separate from the emoji/photo inside it) and a nameplate title
-- shown under your display name. Both unlock the same two ways emoji
-- already do: a level milestone, or mastering an achievement category —
-- plus a new third way, mastering *every* category, for the single
-- "Grandmaster" reward each cosmetic type has at the top.
--
-- Rather than hand-writing a third near-identical CASE-statement trigger,
-- this replaces 0026/0027's validate_premium_avatar_emoji with one data-
-- driven table (cosmetic_unlocks) and one generic trigger covering all
-- three gated columns (avatar_emoji, avatar_frame, title) — adding a
-- future gated cosmetic becomes a data INSERT, not a new function.

alter table public.leaderboard_entries
  add column if not exists avatar_frame text,
  add column if not exists title text,
  -- Public mirror of settings.card_back/card_face (an owner-only table —
  -- see migration 0022) so a profile visitor can see what you've got
  -- equipped without a new read policy on the whole settings table (which
  -- also holds things like sound/ambient volume that have no business
  -- being public). Kept in sync by accountSettingsSync.ts's
  -- pushCardBack/pushCardFace, same moment they sync to settings itself.
  add column if not exists showcase_card_back text,
  add column if not exists showcase_card_face text;

-- ─────────────────────────────────────────────────────────────────────────
-- Cosmetic catalog + generic unlock check
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.cosmetic_unlocks (
  cosmetic_type text not null,
  cosmetic_key text not null,
  -- 'level' (requirement_value is a level number), 'category' (requirement_
  -- value is one of achievements.ts's AchievementCategory strings), or
  -- 'all_categories' (requirement_value unused — every category mastered).
  requirement_kind text not null,
  requirement_value text,
  primary key (cosmetic_type, cosmetic_key)
);

truncate public.cosmetic_unlocks;
insert into public.cosmetic_unlocks (cosmetic_type, cosmetic_key, requirement_kind, requirement_value) values
  -- avatar_emoji — the existing 13 premium emoji (0026), now data-driven.
  ('avatar_emoji', '🥉', 'level', '10'),
  ('avatar_emoji', '🥈', 'level', '25'),
  ('avatar_emoji', '🥇', 'level', '50'),
  ('avatar_emoji', '💎', 'level', '100'),
  ('avatar_emoji', '📊', 'category', 'accountStats'),
  ('avatar_emoji', '🎖️', 'category', 'aiRivals'),
  ('avatar_emoji', '🧩', 'category', 'melding'),
  ('avatar_emoji', '🪄', 'category', 'layingOff'),
  ('avatar_emoji', '🔄', 'category', 'drawDiscard'),
  ('avatar_emoji', '🚪', 'category', 'goingOut'),
  ('avatar_emoji', '📜', 'category', 'contracts'),
  ('avatar_emoji', '🎪', 'category', 'tableComposition'),
  ('avatar_emoji', '👑', 'category', 'multiplayer'),
  -- avatar_frame
  ('avatar_frame', 'bronze', 'level', '10'),
  ('avatar_frame', 'silver', 'level', '25'),
  ('avatar_frame', 'gold', 'level', '50'),
  ('avatar_frame', 'diamond', 'level', '100'),
  ('avatar_frame', 'grandmaster', 'all_categories', null),
  -- title
  ('title', 'rising_star', 'level', '10'),
  ('title', 'card_shark', 'level', '25'),
  ('title', 'high_roller', 'level', '50'),
  ('title', 'living_legend', 'level', '100'),
  ('title', 'statistician', 'category', 'accountStats'),
  ('title', 'ace_hunter', 'category', 'aiRivals'),
  ('title', 'meld_master', 'category', 'melding'),
  ('title', 'the_enabler', 'category', 'layingOff'),
  ('title', 'deck_whisperer', 'category', 'drawDiscard'),
  ('title', 'clean_sweeper', 'category', 'goingOut'),
  ('title', 'contract_killer', 'category', 'contracts'),
  ('title', 'table_captain', 'category', 'tableComposition'),
  ('title', 'multiplayer_monarch', 'category', 'multiplayer'),
  ('title', 'grandmaster', 'all_categories', null);

alter table public.cosmetic_unlocks enable row level security;
drop policy if exists "cosmetic_unlocks: any signed-in read" on public.cosmetic_unlocks;
create policy "cosmetic_unlocks: any signed-in read" on public.cosmetic_unlocks
  for select using (auth.role() = 'authenticated');

-- Whether `p_user_id` currently qualifies for `p_cosmetic_key` of
-- `p_cosmetic_type` — true for anything not in the catalog at all (a free,
-- ungated pick, e.g. any non-premium emoji).
create or replace function public.cosmetic_unlocked(p_user_id uuid, p_cosmetic_type text, p_cosmetic_key text)
returns boolean
language plpgsql
stable
as $$
declare
  req record;
  cat text;
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
  end if;

  return false;
end;
$$;

revoke execute on function public.cosmetic_unlocked(uuid, text, text) from anon, public;
grant execute on function public.cosmetic_unlocked(uuid, text, text) to authenticated;

-- Replaces 0026/0027's validate_premium_avatar_emoji with the general
-- version — one trigger, three gated columns, all checked against the
-- data-driven catalog above instead of a hardcoded CASE per column.
drop trigger if exists validate_premium_avatar_emoji on public.leaderboard_entries;
drop function if exists public.validate_premium_avatar_emoji();

create or replace function public.validate_cosmetic_columns()
returns trigger
language plpgsql
as $$
begin
  if new.avatar_emoji is not null and not public.cosmetic_unlocked(new.user_id, 'avatar_emoji', new.avatar_emoji) then
    raise exception 'avatar_emoji_locked';
  end if;
  if new.avatar_frame is not null and not public.cosmetic_unlocked(new.user_id, 'avatar_frame', new.avatar_frame) then
    raise exception 'avatar_frame_locked';
  end if;
  if new.title is not null and not public.cosmetic_unlocked(new.user_id, 'title', new.title) then
    raise exception 'title_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_cosmetic_columns on public.leaderboard_entries;
create trigger validate_cosmetic_columns
  before insert or update of avatar_emoji, avatar_frame, title on public.leaderboard_entries
  for each row execute function public.validate_cosmetic_columns();

do $$ begin
  insert into public.schema_migrations (version) values ('0028_frames_titles_headtohead')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
