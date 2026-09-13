-- Books & Runs — a "Creator" badge on the developer's own profile.
-- Run this once in the Supabase SQL editor, after 0001–0029.
--
-- A single boolean, true for exactly one account, set here by matching
-- auth.users.email (not readable from any client query) rather than
-- through any client-facing update function — nothing in leaderboardStore
-- ever writes this column, so there's no path for another account to set
-- it on itself. Purely a profile-page badge, not a permission of any kind.

alter table public.leaderboard_entries
  add column if not exists is_creator boolean not null default false;

update public.leaderboard_entries le
set is_creator = true
from auth.users u
where u.id = le.user_id
  and lower(u.email) = lower('nick.l.dimartino@gmail.com');

do $$ begin
  insert into public.schema_migrations (version) values ('0030_creator_badge')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
