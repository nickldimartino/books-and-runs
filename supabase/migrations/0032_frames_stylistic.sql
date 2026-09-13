-- Books & Runs — avatar frames become purely stylistic, free picks.
-- Run this once in the Supabase SQL editor, after 0001–0031.
--
-- Bronze/Silver/Gold/Diamond frames used to require the exact same level
-- milestones (10/25/50/100) as the badge's own 🥉🥈🥇💎 — two gated systems
-- saying the same thing about a person's level, plus the (now-removed)
-- win-rate rank badge as a third. The badge is the one place level shows
-- up now; frames are just a color to pick, no requirement at all — only
-- "Grandmaster" (every achievement category mastered) stays earned, since
-- that's a different kind of flex than a level number.
--
-- Renamed rather than added alongside, so nobody ends up with two frames
-- for the same ring color: bronze->amber, silver->mist, gold->citrine,
-- diamond->sky. Keep AVATAR_FRAME_OPTIONS in app/lib/profileCosmetics.ts
-- in sync with these ids by hand if they ever change again.

update public.leaderboard_entries set avatar_frame = 'amber' where avatar_frame = 'bronze';
update public.leaderboard_entries set avatar_frame = 'mist' where avatar_frame = 'silver';
update public.leaderboard_entries set avatar_frame = 'citrine' where avatar_frame = 'gold';
update public.leaderboard_entries set avatar_frame = 'sky' where avatar_frame = 'diamond';

-- No unlock requirement for any of the four color frames anymore —
-- cosmetic_unlocked() already treats a (cosmetic_type, cosmetic_key) with
-- no catalog row as free, so removing these rows is the whole fix.
-- "grandmaster" is untouched — still gated on all_categories.
delete from public.cosmetic_unlocks
where cosmetic_type = 'avatar_frame' and cosmetic_key in ('bronze', 'silver', 'gold', 'diamond');

do $$ begin
  insert into public.schema_migrations (version) values ('0032_frames_stylistic')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
