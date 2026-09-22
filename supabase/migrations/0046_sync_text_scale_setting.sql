-- Books & Runs — sync the Settings → "Text size" accessibility control
-- across devices. Run this once in the Supabase SQL editor, after 0001–0045.
--
-- New Settings preference (see app/lib/textScaleStore.ts), same pattern as
-- every other Settings/Theme/Colorblind-mode preference added since 0022
-- (0045 most recently) — nullable, meaning "this account has never set
-- this, use the local default" (see app/lib/accountSettingsSync.ts). Unlike
-- Theme (which is now sign-in-only, see settings/theme/page.tsx), Text size
-- stays usable while signed out too — it's an accessibility need, not a
-- look worth gating behind an account — this column only matters once
-- someone *is* signed in and wants it to follow them to another device.

alter table public.settings
  add column if not exists text_scale text;

do $$ begin
  insert into public.schema_migrations (version) values ('0046_sync_text_scale_setting')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
