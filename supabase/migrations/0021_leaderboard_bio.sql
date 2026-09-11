-- Books & Runs — a short account bio.
-- Run this once in the Supabase SQL editor, after 0001–0020.
--
-- One new column on leaderboard_entries (already the one publicly-readable,
-- self-reported profile table — see 0006's own header for why) rather than
-- a new table: same "any signed-in account can read, only the owner can
-- write" shape display_name already has, and it's shown alongside a
-- player's name in exactly the same places. Shown in OpponentStrip's player
-- popover during a multiplayer game — set on the Account page.

alter table public.leaderboard_entries
  add column if not exists bio text;

-- Same shape as 0013's display_name constraint: length + no control
-- characters, enforced at the DB rather than only the Account page's
-- <textarea maxLength>.
update public.leaderboard_entries
  set bio = null
  where bio is not null
    and (char_length(bio) > 140 or bio ~ '[[:cntrl:]]');

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_bio_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_bio_ok
  check (
    bio is null
    or (char_length(bio) between 1 and 140 and bio !~ '[[:cntrl:]]')
  );

do $$ begin
  insert into public.schema_migrations (version) values ('0021_leaderboard_bio')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
