-- Books & Runs — reporting an inappropriate profile photo.
-- Run this once in the Supabase SQL editor, after 0001–0024.
--
-- A lightweight flag, not a moderation system: any signed-in account can
-- report another account's current profile photo, and it lands here for
-- manual review (via the Supabase dashboard/service role) — there is no
-- in-app read path for these rows at all (no select policy below is
-- deliberate), since nobody but the developer needs to see who reported
-- what. One report per (reporter, reported) pair — the app inserts with
-- `on conflict do nothing`, so reporting the same account again is a
-- harmless no-op rather than piling up duplicate rows.

create table if not exists public.profile_photo_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_user_id uuid not null references auth.users (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  constraint profile_photo_reports_not_self check (reporter_id <> reported_user_id),
  constraint profile_photo_reports_unique unique (reporter_id, reported_user_id)
);

alter table public.profile_photo_reports
  drop constraint if exists profile_photo_reports_reason_ok;
alter table public.profile_photo_reports
  add constraint profile_photo_reports_reason_ok
  check (reason is null or char_length(reason) <= 280);

alter table public.profile_photo_reports enable row level security;

-- Insert-only from the client, and only as yourself — matches
-- sendFriendRequest/daily_deal_submit's own "self-reported, RLS gates
-- identity" shape. No select/update/delete policy at all: this table is
-- read exclusively via the dashboard or a service-role key, never by a
-- normal signed-in client (not even the reporter re-reading their own
-- report, or the reported account learning they were reported).
create policy "profile_photo_reports: reporter insert" on public.profile_photo_reports
  for insert with check (auth.uid() = reporter_id);

do $$ begin
  insert into public.schema_migrations (version) values ('0025_profile_photo_reports')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
