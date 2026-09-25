-- Books & Runs — syncs the new Language setting (app/lib/localeStore.ts)
-- to the account, same nullable-column pattern as every setting since
-- 0022 — nullable meaning "this account has never set this, use the
-- local default" (see app/lib/accountSettingsSync.ts). Usable while
-- signed out too, same as Text size (0046) — a visitor picks a language
-- before they've ever signed in.

alter table public.settings
  add column if not exists language text;

do $$ begin
  insert into public.schema_migrations (version) values ('0055_settings_language')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
