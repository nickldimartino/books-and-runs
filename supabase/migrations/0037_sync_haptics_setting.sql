-- Books & Runs — sync the new independent Haptics setting across devices.
-- Run this once in the Supabase SQL editor, after 0001–0036.
--
-- "Sound effects" and "Haptics" used to be one combined toggle (sound_on);
-- splitting them (see settingsStore.ts's hapticsEnabled) needs its own
-- synced column, same pattern as every other Settings preference added in
-- 0022 — nullable, meaning "this account has never set this, use the local
-- default" (see app/lib/accountSettingsSync.ts).

alter table public.settings
  add column if not exists haptics_on boolean;

do $$ begin
  insert into public.schema_migrations (version) values ('0037_sync_haptics_setting')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
