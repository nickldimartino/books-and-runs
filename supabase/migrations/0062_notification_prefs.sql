-- Books & Runs — per-category push preferences + quiet hours (synced to the
-- account like every other Settings preference since 0022).
-- Run once in the Supabase SQL editor, after 0061, then redeploy the `mp`
-- and `daily-deal-reminder` Edge Functions (they read these columns).
--
--   • notify_turns / notify_invites / notify_nudges / notify_streaks — one
--     switch per kind of push: "your turn" (+ time-running-out warnings),
--     game invites & friend requests, nudges & emote reactions, and
--     Daily Deal / Weekly Challenge streak reminders. NULL = never set =
--     on, same "nullable means use the default" convention as the rest of
--     this table.
--   • quiet_hours_start / quiet_hours_end — local hours 0–23 between which
--     no push is sent (may wrap midnight; both NULL or equal = off).
--   • tz_offset_minutes — the device's UTC offset (minutes EAST of UTC, i.e.
--     JS -getTimezoneOffset()), refreshed by the app on each launch so a
--     daylight-saving change is picked up. Quiet hours are meaningless
--     without it, so the server ignores them while it is NULL.
--   The push language comes from settings.language (0055).
--
-- Enforcement is in supabase/functions/_shared/push.ts (shouldPush). The
-- in-app inbox/badge is unaffected: these only silence the push itself.

alter table public.settings
  add column if not exists notify_turns boolean,
  add column if not exists notify_invites boolean,
  add column if not exists notify_nudges boolean,
  add column if not exists notify_streaks boolean,
  add column if not exists quiet_hours_start smallint,
  add column if not exists quiet_hours_end smallint,
  add column if not exists tz_offset_minutes int;

alter table public.settings drop constraint if exists settings_quiet_hours_ok;
alter table public.settings add constraint settings_quiet_hours_ok check (
  (quiet_hours_start is null or quiet_hours_start between 0 and 23)
  and (quiet_hours_end is null or quiet_hours_end between 0 and 23)
);

alter table public.settings drop constraint if exists settings_tz_offset_ok;
alter table public.settings add constraint settings_tz_offset_ok check (
  tz_offset_minutes is null or tz_offset_minutes between -840 and 840
);

do $$ begin
  insert into public.schema_migrations (version) values ('0062_notification_prefs')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
