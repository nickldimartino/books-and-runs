-- Books & Runs — syncs the game-feel / accessibility settings added in the
-- 2026-09-25 gamefeel_a11y audit pass to the account (app/lib/accountSettingsSync.ts):
-- game speed, in-app reduce motion, the "show legal moves" assist and the
-- "confirm before discarding" toggle. Same nullable-column pattern as every
-- setting since 0022 — null means "this account never set it, keep the
-- device's own default", so clients that predate these columns keep working.

alter table public.settings
  add column if not exists game_speed text,
  add column if not exists reduce_motion text,
  add column if not exists show_legal_moves boolean,
  add column if not exists confirm_discard boolean;

do $$ begin
  insert into public.schema_migrations (version) values ('0073_settings_game_feel')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
