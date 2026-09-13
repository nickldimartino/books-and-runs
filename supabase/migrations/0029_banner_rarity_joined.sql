-- Books & Runs — profile banner, achievement rarity %, and a "member
-- since" date.
-- Run this once in the Supabase SQL editor, after 0001–0028.

alter table public.leaderboard_entries
  add column if not exists banner text,
  add column if not exists joined_at timestamptz;

-- Keep this list byte-for-byte in sync with BANNER_OPTIONS in
-- app/lib/bannerPresets.ts. Mostly free (a background color choice, same
-- spirit as the avatar's own color) — "grandmaster" is the one gated pick,
-- reusing the same rotating-rainbow motif as the Grandmaster avatar frame
-- and title (migration 0028) for every-category mastery.
alter table public.leaderboard_entries
  drop constraint if exists leaderboard_banner_ok;
alter table public.leaderboard_entries
  add constraint leaderboard_banner_ok check (
    banner is null or banner in (
      'forest', 'sunset', 'ocean', 'ember', 'grape', 'meadow',
      'slate', 'rose', 'gold', 'midnight', 'coral', 'ice',
      'grandmaster'
    )
  );

insert into public.cosmetic_unlocks (cosmetic_type, cosmetic_key, requirement_kind, requirement_value)
values ('banner', 'grandmaster', 'all_categories', null)
on conflict (cosmetic_type, cosmetic_key) do nothing;

-- Extends 0028's single trigger to also cover `banner` — same generic
-- cosmetic_unlocked() check, just one more column in the trigger's column
-- list and body.
drop trigger if exists validate_cosmetic_columns on public.leaderboard_entries;
drop function if exists public.validate_cosmetic_columns();

create or replace function public.validate_cosmetic_columns()
returns trigger
language plpgsql
as $$
begin
  if new.avatar_emoji is not null and not public.cosmetic_unlocked(new.user_id, 'avatar_emoji', new.avatar_emoji) then
    raise exception 'avatar_emoji_locked';
  end if;
  if new.avatar_frame is not null and not public.cosmetic_unlocked(new.user_id, 'avatar_frame', new.avatar_frame) then
    raise exception 'avatar_frame_locked';
  end if;
  if new.title is not null and not public.cosmetic_unlocked(new.user_id, 'title', new.title) then
    raise exception 'title_locked';
  end if;
  if new.banner is not null and not public.cosmetic_unlocked(new.user_id, 'banner', new.banner) then
    raise exception 'banner_locked';
  end if;
  return new;
end;
$$;

create trigger validate_cosmetic_columns
  before insert or update of avatar_emoji, avatar_frame, title, banner on public.leaderboard_entries
  for each row execute function public.validate_cosmetic_columns();

-- ─────────────────────────────────────────────────────────────────────────
-- Achievement rarity — "N% of players have this"
-- ─────────────────────────────────────────────────────────────────────────
--
-- player_stats/achievement_counters are owner-only (any one account can
-- only ever read its own row) — there's no way for a client to compute
-- "how many accounts unlocked family X" itself the way it computes its own
-- achievements. This is a small precomputed summary table instead,
-- refreshed daily by a security-definer function that scans every
-- account's stats just long enough to produce a COUNT (never anyone's
-- individual data), same shape as 0014's mp_housekeeping() cron sweep.

create table if not exists public.achievement_unlock_counts (
  family_id text not null,
  tier text not null,
  unlocked_count integer not null default 0,
  total_accounts integer not null default 0,
  computed_at timestamptz not null default now(),
  primary key (family_id, tier)
);

alter table public.achievement_unlock_counts enable row level security;
drop policy if exists "achievement_unlock_counts: any signed-in read" on public.achievement_unlock_counts;
create policy "achievement_unlock_counts: any signed-in read" on public.achievement_unlock_counts
  for select using (auth.role() = 'authenticated');

create or replace function public.refresh_achievement_rarity()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
  fam record;
  tier_rec record;
  cond text;
  cnt integer;
begin
  -- Same "real activity" population the Leaderboard itself ranks — see
  -- migration 0006/leaderboard/page.tsx's own filter.
  select count(*) into total
  from public.leaderboard_entries
  where games_played > 0 or daily_deal_best_streak > 0;

  for fam in select * from public.achievement_thresholds loop
    for tier_rec in
      select * from (values
        ('beginner', fam.beginner_threshold),
        ('easy', fam.easy_threshold),
        ('medium', fam.medium_threshold),
        ('hard', fam.hard_threshold),
        ('expert', fam.expert_threshold)
      ) as t(name, threshold)
    loop
      cond := case fam.source_kind
        when 'counter' then format(
          'coalesce((ac.counters ->> %L)::numeric, 0) %s %s',
          fam.source_key, case when fam.lower_is_better then '<=' else '>=' end, tier_rec.threshold
        )
        when 'gamesPlayed' then format('coalesce(le.games_played, 0) >= %s', tier_rec.threshold)
        when 'gamesWon' then format('coalesce(le.games_won, 0) >= %s', tier_rec.threshold)
        when 'bestScore' then format(
          'le.games_played >= 5 and ps.best_score is not null and ps.best_score <= %s', tier_rec.threshold
        )
        when 'winRate' then format(
          'le.games_played >= 10 and (100.0 * le.games_won / nullif(le.games_played, 0)) >= %s', tier_rec.threshold
        )
        when 'winsByDifficulty' then format(
          'coalesce((ps.wins_by_difficulty ->> %L)::numeric, 0) >= %s', fam.source_key, tier_rec.threshold
        )
        when 'mpGamesPlayed' then format('coalesce(le.mp_games_played, 0) >= %s', tier_rec.threshold)
        when 'mpGamesWon' then format('coalesce(le.mp_games_won, 0) >= %s', tier_rec.threshold)
        when 'mpBestWinStreak' then format('coalesce(le.mp_best_win_streak, 0) >= %s', tier_rec.threshold)
        when 'mpWinRate' then format(
          'coalesce(le.mp_games_played, 0) >= 6 and (100.0 * coalesce(le.mp_games_won, 0) / nullif(le.mp_games_played, 0)) >= %s',
          tier_rec.threshold
        )
        else 'false'
      end;

      execute format(
        'select count(*) from public.leaderboard_entries le
           left join public.player_stats ps on ps.user_id = le.user_id
           left join public.achievement_counters ac on ac.user_id = le.user_id
         where (le.games_played > 0 or le.daily_deal_best_streak > 0) and (%s)',
        cond
      ) into cnt;

      insert into public.achievement_unlock_counts (family_id, tier, unlocked_count, total_accounts, computed_at)
      values (fam.family_id, tier_rec.name, cnt, total, now())
      on conflict (family_id, tier) do update
        set unlocked_count = excluded.unlocked_count,
            total_accounts = excluded.total_accounts,
            computed_at = excluded.computed_at;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.refresh_achievement_rarity() from anon, public, authenticated;

-- Run once now, so rarity data exists immediately instead of only after
-- tomorrow's cron tick.
select public.refresh_achievement_rarity();

do $$
begin
  perform cron.schedule(
    'achievement-rarity-daily',
    '30 8 * * *',
    $cron$ select public.refresh_achievement_rarity(); $cron$
  );
exception
  when undefined_function or undefined_table or invalid_schema_name then
    raise notice 'pg_cron not enabled — enable it and re-run the cron.schedule block, or call refresh_achievement_rarity() manually to keep rarity %% fresh.';
end;
$$;

do $$ begin
  insert into public.schema_migrations (version) values ('0029_banner_rarity_joined')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
