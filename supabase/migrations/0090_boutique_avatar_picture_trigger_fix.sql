-- Books & Runs — fixes a real, live gap found re-verifying 0089 against
-- the deployed project (not caught by the scratch-Postgres check that
-- verified 0089 itself, because that check's trigger stub didn't restrict
-- its column list the way the real one — from migration 0031 — does).
--
-- 0089 added an avatar_emoji (profile picture) branch to
-- validate_cosmetic_columns(), but never touched the TRIGGER that calls
-- it. Postgres's `before update of <columns>` restricts which column
-- changes even invoke the trigger function at all — 0031's trigger only
-- watches avatar_frame, title, banner, badge. An UPDATE that sets only
-- avatar_kind/avatar_emoji (exactly what equipping a picture does) never
-- fires the function, so the new check was dead code: any signed-in
-- account could equip any boutique profile picture for free. Confirmed
-- live: after applying 0089 as written, a zero-entitlement throwaway
-- account could set avatar_emoji to an unowned boutique emoji with no
-- error.
--
-- Fix: recreate the trigger with avatar_emoji and avatar_kind added to
-- its watched-column list (avatar_kind too, since switching photo→emoji
-- can set avatar_emoji without avatar_emoji itself being in that same
-- UPDATE's column list on every code path). The function body itself
-- (0089's `create or replace function`) already has the right check and
-- needs no change — only the trigger's column list was ever wrong.
--
-- Verified against a scratch Postgres with a trigger definition that, this
-- time, faithfully matches 0031's actual `of (...)` restriction: the bug
-- reproduces before this file, and is gone after it (unowned picture →
-- rejected, free picture → still allowed, an owned/entitled picture →
-- allowed, badge/title/banner unaffected).
--
-- Run this once, after 0089, in the Supabase SQL editor.

drop trigger if exists validate_cosmetic_columns on public.leaderboard_entries;

create trigger validate_cosmetic_columns
  before insert or update of avatar_frame, title, banner, badge, avatar_emoji, avatar_kind
  on public.leaderboard_entries
  for each row execute function public.validate_cosmetic_columns();

insert into public.schema_migrations (version) values ('0090_boutique_avatar_picture_trigger_fix')
on conflict (version) do nothing;
