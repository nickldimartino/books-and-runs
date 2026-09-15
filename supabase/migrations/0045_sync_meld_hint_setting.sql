-- Books & Runs — sync the "Hint: Auto-meld" button's Settings toggle
-- across devices. Run this once in the Supabase SQL editor, after 0001–0044.
--
-- New Settings preference (see settingsStore.ts's showMeldHint), same
-- pattern as every other Settings toggle added since 0022 (0037 most
-- recently) — nullable, meaning "this account has never set this, use the
-- local default" (see app/lib/accountSettingsSync.ts). The local default is
-- false (off) — see settingsStore.ts's own doc for why this one assist
-- specifically opts in rather than starting on like the others.

alter table public.settings
  add column if not exists show_meld_hint boolean;

do $$ begin
  insert into public.schema_migrations (version) values ('0045_sync_meld_hint_setting')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
