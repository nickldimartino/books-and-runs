-- Books & Runs — sync the ambient music song choice across devices.
-- Run this once in the Supabase SQL editor, after 0001–0022.
--
-- Settings' new "Ambient song" picker (rotate all 3, or pin to one) needs
-- one more column on the same `settings` table 0022 already extended —
-- same owner-only RLS from 0001, nothing new needed there. Null means
-- "this account has never set this, use the local default (rotate)" — see
-- app/lib/accountSettingsSync.ts.

alter table public.settings
  add column if not exists ambient_track text;

do $$ begin
  insert into public.schema_migrations (version) values ('0023_ambient_track')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
