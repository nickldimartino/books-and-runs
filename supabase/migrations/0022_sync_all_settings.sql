-- Books & Runs — sync every Settings preference across devices.
-- Run this once in the Supabase SQL editor, after 0001–0021.
--
-- `settings` (migration 0001) already existed for exactly this shape of
-- data (one row per account, owner-only RLS already in place — nothing new
-- needed there) but only ever held `preferred_ai_difficulty_default`, and
-- even that stopped being written to for a while. This adds the rest of
-- what Settings, Theme, Card back, and Card face actually hold, so signing
-- in on a new device (or a fresh "Add to Home Screen" install, which gets
-- its own separate local storage on iOS) pulls down the same look and
-- preferences instead of starting from scratch.
--
-- Every column is nullable (aside from the pre-existing sound_on, which
-- already defaults true) — null means "this account has never set this,
-- use the local default" — see app/lib/accountSettingsSync.ts.

alter table public.settings
  add column if not exists theme text,
  add column if not exists card_back text,
  add column if not exists card_face text,
  add column if not exists colorblind_mode text,
  add column if not exists meld_hints boolean,
  add column if not exists highlight_layoffs boolean,
  add column if not exists show_whose_turn boolean,
  add column if not exists sound_volume numeric,
  add column if not exists ambient_music_enabled boolean,
  add column if not exists ambient_volume numeric,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  insert into public.schema_migrations (version) values ('0022_sync_all_settings')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
