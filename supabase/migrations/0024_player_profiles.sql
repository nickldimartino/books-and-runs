-- Books & Runs — public player profiles: unique display names + avatars.
-- Run this once in the Supabase SQL editor, after 0001–0023.
--
-- Two things, both on the already-public leaderboard_entries table (see
-- 0006's own header for why that's the right home for anything shown to
-- other signed-in players):
--
-- 1. display_name becomes unique, case-insensitively ("Nick" and "nick"
--    can't both exist) — enforced with a real DB constraint, not just an
--    app-side check, since two clients racing to claim the same name at
--    the same instant can only be resolved at the database. The app
--    checks availability with a plain SELECT before saving (any signed-in
--    account can already read display_name — see 0006), then catches a
--    23505 unique-violation from this constraint as the "someone just took
--    it" case. Existing accounts that already happen to share a name (no
--    uniqueness was ever enforced before this) are resolved automatically
--    below: the earliest-updated row of each colliding group keeps its
--    name as-is, every later one gets a numeric suffix appended — nobody
--    loses their account over this, they just may need to notice and pick
--    a new name afterward.
--
-- 2. Avatar columns: avatar_kind switches between the two, so choosing a
--    photo doesn't discard whatever emoji+color was set before, and vice
--    versa. avatar_emoji/avatar_color are constrained to fixed lists that
--    must match app/lib/avatarPresets.ts exactly (EMOJI_OPTIONS /
--    COLOR_OPTIONS) — update both together. avatar_photo_path is a Storage
--    object path (see the "avatars" bucket below), not a URL: the public
--    URL is derived from it at render time (getPublicUrl), so nothing here
--    goes stale if the project's Storage URL ever changes.

alter table public.leaderboard_entries
  add column if not exists avatar_kind text not null default 'emoji',
  add column if not exists avatar_emoji text,
  add column if not exists avatar_color text,
  add column if not exists avatar_photo_path text;

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_avatar_kind_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_avatar_kind_ok check (avatar_kind in ('emoji', 'photo'));

-- Keep this list byte-for-byte in sync with EMOJI_OPTIONS in
-- app/lib/avatarPresets.ts.
alter table public.leaderboard_entries
  drop constraint if exists leaderboard_avatar_emoji_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_avatar_emoji_ok check (
    avatar_emoji is null or avatar_emoji in (
      '😀','😎','🤠','🥸','🤓','🧐','😺','🐯','🦁','🐵','🐼','🐨',
      '🦊','🐺','🦄','🐲','🐙','🦋','🐝','🌵','🍉','🍕','🎸','🎧',
      '⚽','🏀','🎯','🎲','🚀','⚡','🔥','🌈','🌙','⭐','♠️','♥️',
      '♦️','♣️','🃏','👑','💎','🎭','🍀','⚓','🎨','🥷','🦖','🐉'
    )
  );

-- Keep this list byte-for-byte in sync with COLOR_OPTIONS in
-- app/lib/avatarPresets.ts.
alter table public.leaderboard_entries
  drop constraint if exists leaderboard_avatar_color_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_avatar_color_ok check (
    avatar_color is null or avatar_color in (
      '#EF4444','#F97316','#F59E0B','#EAB308','#84CC16','#22C55E',
      '#10B981','#14B8A6','#06B6D4','#3B82F6','#6366F1','#8B5CF6',
      '#A855F7','#EC4899','#F43F5E','#64748B'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- display_name uniqueness (case-insensitive)
-- ─────────────────────────────────────────────────────────────────────────

-- Resolve any pre-existing collisions before the unique index can go on —
-- nothing enforced uniqueness before this migration, so two accounts may
-- already share a literal (or differently-cased) name. For each colliding
-- group, the earliest-updated row keeps its name; every other row gets the
-- smallest numeric suffix that isn't already taken by anyone.
do $$
declare
  grp text;
  rec record;
  suffix integer;
  candidate text;
begin
  for grp in
    select lower(display_name) as g
    from public.leaderboard_entries
    where display_name is not null
    group by lower(display_name)
    having count(*) > 1
  loop
    for rec in
      select user_id, display_name
      from public.leaderboard_entries
      where lower(display_name) = grp
      order by updated_at asc, user_id asc
      offset 1
    loop
      suffix := 1;
      loop
        -- Capped to 40 chars so an appended suffix can never push the
        -- result past the 48-char CHECK from migration 0013.
        candidate := left(rec.display_name, 40) || suffix::text;
        exit when not exists (
          select 1 from public.leaderboard_entries where lower(display_name) = lower(candidate)
        );
        suffix := suffix + 1;
      end loop;
      update public.leaderboard_entries
        set display_name = candidate
        where user_id = rec.user_id;
    end loop;
  end loop;
end $$;

-- A generated column rather than a functional index directly on
-- lower(display_name): Postgres can't add a plain unique CONSTRAINT on an
-- expression (only a unique INDEX), and a named constraint is what lets a
-- future migration `drop constraint if exists` this cleanly the same way
-- every other constraint in this schema does. Nulls are never considered
-- equal to each other in a unique index/constraint, so any number of
-- accounts that haven't chosen a name yet coexist fine.
alter table public.leaderboard_entries
  add column if not exists display_name_lower text generated always as (lower(display_name)) stored;

alter table public.leaderboard_entries
  drop constraint if exists leaderboard_display_name_unique;
alter table public.leaderboard_entries
  add constraint leaderboard_display_name_unique unique (display_name_lower);

-- ─────────────────────────────────────────────────────────────────────────
-- Storage — the "avatars" bucket for uploaded profile photos
-- ─────────────────────────────────────────────────────────────────────────

-- Public so a photo's URL (from getPublicUrl) works directly in an <img>
-- src for any viewer, signed in or not — same trust level as everything
-- else on leaderboard_entries. file_size_limit is in bytes (5 MB); the app
-- also resizes/compresses client-side before upload, this is just the
-- backstop. allowed_mime_types is enforced by Storage itself on upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects are stored at "<user_id>/avatar.<ext>" — one live file per
-- account (each upload overwrites it via upsert, so nothing orphans in the
-- bucket) — so ownership is just "the first path segment is your own uid".
drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars: owner write" on storage.objects;
create policy "avatars: owner write" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars: owner update" on storage.objects;
create policy "avatars: owner update" on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars: owner delete" on storage.objects;
create policy "avatars: owner delete" on storage.objects
  for delete using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

do $$ begin
  insert into public.schema_migrations (version) values ('0024_player_profiles')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
