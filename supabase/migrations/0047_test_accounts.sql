-- Books & Runs — hide testing accounts from the public leaderboard.
-- Run this once in the Supabase SQL editor, after 0001–0046.
--
-- A single boolean, false by default and never touched by any client-facing
-- update function (syncLeaderboardStats' own upsert never includes this
-- column, so a normal stats sync can't reset it) — same "set only by hand
-- in the SQL editor, matching auth.users.email" pattern as 0030's
-- is_creator. The one difference: is_creator is a permanent identity badge
-- for exactly one account; this is meant to be set (and later unset, or
-- left set) for however many throwaway accounts you create while testing
-- multiplayer/Clubs/Tournaments, so it's not baked into this migration as
-- a fixed update — see the example below.
--
-- A brand new account has no leaderboard_entries row at all until it first
-- syncs (signs in once and lands on a page that calls syncLeaderboardStats
-- — Home, Leaderboard, and Account all do), so sign the test account in
-- once before running the update.
--
-- To flag an account as a test account (excluded from the public
-- leaderboard and from achievement-rarity's own denominator — see
-- refresh_achievement_rarity() below), run this once per account, filling
-- in the real email:
--
--   update public.leaderboard_entries le
--   set is_test_account = true
--   from auth.users u
--   where u.id = le.user_id
--     and lower(u.email) = lower('you+test1@example.com');
--
-- To un-flag one later (e.g. you want to keep using it as a real account):
--
--   update public.leaderboard_entries set is_test_account = false
--   where user_id = (select id from auth.users where lower(email) = lower('you+test1@example.com'));

alter table public.leaderboard_entries
  add column if not exists is_test_account boolean not null default false;

-- Same function as 0029/0042, extended with one more exclusion in its own
-- WHERE clause — everything else about it (the per-tier loop, the SQL it
-- builds per requirement kind) is unchanged. Verbatim copy of 0042's
-- version otherwise.
create or replace function public.refresh_achievement_rarity()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fam record;
  tier_rec record;
  cond text;
  cnt bigint;
  total bigint;
begin
  select count(*) into total
  from public.leaderboard_entries
  where (games_played > 0 or daily_deal_best_streak > 0)
    and not is_test_account;

  for fam in select * from public.achievement_families loop
    for tier_rec in select * from public.achievement_thresholds where family_id = fam.family_id loop
      cond := case fam.source_kind
        when 'counter' then format('coalesce((ac.counters ->> %L)::numeric, 0) >= %s', fam.source_key, tier_rec.threshold)
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
         where (le.games_played > 0 or le.daily_deal_best_streak > 0) and not le.is_test_account and (%s)',
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

-- Refresh once now with the new exclusion applied, rather than waiting for
-- tomorrow's cron tick.
select public.refresh_achievement_rarity();

do $$ begin
  insert into public.schema_migrations (version) values ('0047_test_accounts')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
