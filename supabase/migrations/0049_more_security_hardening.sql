-- Books & Runs — three follow-ups from the 2026-09 security audit that were
-- deliberately deferred out of 0048 pending a decision, now confirmed.
-- Run this once in the Supabase SQL editor, after 0001–0048.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. compute_total_xp()/category_mastered() can only be asked about
--    yourself. Both are `security definer` and granted to `authenticated`
--    directly (not just reachable through a trigger), so any signed-in
--    account could already call e.g. `select compute_total_xp('<victim>')`
--    or `select category_mastered('<victim>', 'endgame')` straight from
--    the client and read another account's derived stats/achievement
--    progress. Every real caller in this codebase (the cosmetic-unlock
--    trigger chain, `compute_level()`) only ever passes `new.user_id` /
--    its own `p_user_id` through — nothing legitimate needs to ask about
--    someone else — so a self-scope check closes this with no behavior
--    change for any real caller. `compute_level()` is a thin wrapper
--    around `compute_total_xp()`, so it's covered for free.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.category_mastered(p_user_id uuid, p_category text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  fam record;
  stats record;
  counters jsonb;
  mp record;
  val numeric;
begin
  if p_user_id <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select games_played, games_won, best_score, wins_by_difficulty
    into stats
    from public.player_stats where user_id = p_user_id;

  select c.counters into counters
    from public.achievement_counters c where c.user_id = p_user_id;

  select * into mp from public.mp_stats_for(p_user_id);

  for fam in
    select * from public.achievement_thresholds where category = p_category
  loop
    val := case fam.source_kind
      when 'counter' then coalesce((counters ->> fam.source_key)::numeric, 0)
      when 'gamesPlayed' then coalesce(stats.games_played, 0)
      when 'gamesWon' then coalesce(stats.games_won, 0)
      when 'bestScore' then
        case when coalesce(stats.games_played, 0) >= 5 then stats.best_score else null end
      when 'winRate' then
        case when coalesce(stats.games_played, 0) >= 10
          then (100.0 * stats.games_won) / stats.games_played
          else 0 end
      when 'winsByDifficulty' then coalesce((stats.wins_by_difficulty ->> fam.source_key)::numeric, 0)
      when 'mpGamesPlayed' then coalesce(mp.played, 0)
      when 'mpGamesWon' then coalesce(mp.won, 0)
      when 'mpBestWinStreak' then coalesce(mp.best_win_streak, 0)
      when 'mpWinRate' then
        case when coalesce(mp.played, 0) >= 6
          then (100.0 * mp.won) / mp.played
          else 0 end
      else null
    end;

    if fam.lower_is_better then
      if val is null or val > fam.expert_threshold then return false; end if;
    else
      if val is null or val < fam.expert_threshold then return false; end if;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.compute_total_xp(p_user_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  stats record;
  counters jsonb;
  mp record;
  fam record;
  tier record;
  val numeric;
  xp numeric := 0;
begin
  if p_user_id <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select games_played, games_won, best_score, wins_by_difficulty
    into stats
    from public.player_stats where user_id = p_user_id;

  select c.counters into counters
    from public.achievement_counters c where c.user_id = p_user_id;

  select * into mp from public.mp_stats_for(p_user_id);

  xp := xp + coalesce(stats.games_played, 0) * 5;
  xp := xp + coalesce(stats.games_won, 0) * 100;
  xp := xp + coalesce((stats.wins_by_difficulty ->> 'beginner')::numeric, 0) * 10;
  xp := xp + coalesce((stats.wins_by_difficulty ->> 'easy')::numeric, 0) * 20;
  xp := xp + coalesce((stats.wins_by_difficulty ->> 'medium')::numeric, 0) * 35;
  xp := xp + coalesce((stats.wins_by_difficulty ->> 'hard')::numeric, 0) * 55;
  xp := xp + coalesce((stats.wins_by_difficulty ->> 'expert')::numeric, 0) * 80;

  for fam in select * from public.achievement_thresholds loop
    val := case fam.source_kind
      when 'counter' then coalesce((counters ->> fam.source_key)::numeric, 0)
      when 'gamesPlayed' then coalesce(stats.games_played, 0)
      when 'gamesWon' then coalesce(stats.games_won, 0)
      when 'bestScore' then
        case when coalesce(stats.games_played, 0) >= 5 then stats.best_score else null end
      when 'winRate' then
        case when coalesce(stats.games_played, 0) >= 10
          then (100.0 * stats.games_won) / stats.games_played
          else 0 end
      when 'winsByDifficulty' then coalesce((stats.wins_by_difficulty ->> fam.source_key)::numeric, 0)
      when 'mpGamesPlayed' then coalesce(mp.played, 0)
      when 'mpGamesWon' then coalesce(mp.won, 0)
      when 'mpBestWinStreak' then coalesce(mp.best_win_streak, 0)
      when 'mpWinRate' then
        case when coalesce(mp.played, 0) >= 6
          then (100.0 * mp.won) / mp.played
          else 0 end
      else null
    end;

    if val is not null then
      for tier in
        select * from (values
          ('beginner', fam.beginner_threshold, 10::numeric),
          ('easy', fam.easy_threshold, 25::numeric),
          ('medium', fam.medium_threshold, 60::numeric),
          ('hard', fam.hard_threshold, 150::numeric),
          ('expert', fam.expert_threshold, 400::numeric)
        ) as t(name, threshold, tier_xp)
      loop
        if (fam.lower_is_better and val <= tier.threshold) or (not fam.lower_is_better and val >= tier.threshold) then
          xp := xp + tier.tier_xp;
        end if;
      end loop;
    end if;
  end loop;

  return xp;
end;
$$;

revoke execute on function public.category_mastered(uuid, text) from anon, public;
grant execute on function public.category_mastered(uuid, text) to authenticated;
revoke execute on function public.compute_total_xp(uuid) from anon, public;
grant execute on function public.compute_total_xp(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Rate-limit profile photo reports. The unique (reporter_id,
--    reported_user_id) constraint already stops reporting the *same*
--    account more than once, but nothing stopped one account from
--    hammering the insert across many different targets. Moves the write
--    from a direct client insert (RLS: "insert as yourself") to a
--    security-definer RPC that runs it through the same
--    `mp_bump_rate_limit()` primitive every other write-heavy RPC already
--    uses, then revokes direct table insert so the RPC is the only path.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.report_profile_photo(p_reported_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_reported_user_id = me then raise exception 'cannot report yourself'; end if;

  perform public.mp_bump_rate_limit('profile_photo_report', 20);

  insert into public.profile_photo_reports (reporter_id, reported_user_id, reason)
    values (me, p_reported_user_id, p_reason)
    on conflict (reporter_id, reported_user_id) do nothing;
end;
$$;

revoke execute on function public.report_profile_photo(uuid, text) from anon, public;
grant execute on function public.report_profile_photo(uuid, text) to authenticated;

drop policy if exists "profile_photo_reports: reporter insert" on public.profile_photo_reports;
-- No client-facing insert policy anymore — report_profile_photo() (above,
-- security definer) is the only way this table is written from the app.

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Generous per-account caps on club/tournament creation, so an account
--    can't script its way to thousands of rows. `club_create`'s own
--    comment already claimed "a generous cap" existed — it never actually
--    did; this makes that comment true. Tournaments cap on *active* ones
--    (not cancelled, rounds not yet all played) rather than a lifetime
--    total, so a long-time player who's run and finished dozens of series
--    over time never gets penalized for history — only for piling up many
--    unfinished ones at once.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.club_create(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 40 then
    raise exception 'name must be 1-40 characters';
  end if;
  if (select count(*) from public.clubs where owner_id = me) >= 10 then
    raise exception 'you can own at most 10 clubs';
  end if;
  insert into public.clubs (name, owner_id) values (btrim(p_name), me) returning id into new_id;
  insert into public.club_members (club_id, user_id) values (new_id, me);
  return new_id;
end;
$$;

create or replace function public.tournament_create(
  p_name text,
  p_total_rounds int,
  p_contract_rounds int[],
  p_club_id uuid,
  p_game_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
  active_count int;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 40 then
    raise exception 'name must be 1-40 characters';
  end if;
  if not exists (select 1 from public.mp_games where id = p_game_id and host_id = me) then
    raise exception 'not found, or not the host of that game';
  end if;
  if p_club_id is not null and not public.club_is_member(p_club_id) then
    raise exception 'not a member of that club';
  end if;

  select count(*) into active_count
    from public.tournaments t
    where t.host_id = me
      and t.cancelled_at is null
      and (select count(*) from public.tournament_games tg where tg.tournament_id = t.id) < t.total_rounds;
  if active_count >= 10 then
    raise exception 'you can host at most 10 active tournaments at once';
  end if;

  insert into public.tournaments (name, host_id, club_id, total_rounds, contract_rounds)
    values (btrim(p_name), me, p_club_id, p_total_rounds, p_contract_rounds)
    returning id into new_id;
  insert into public.tournament_games (tournament_id, round_number, game_id) values (new_id, 1, p_game_id);
  return new_id;
end;
$$;

revoke execute on function public.club_create(text) from anon, public;
grant execute on function public.club_create(text) to authenticated;
revoke execute on function public.tournament_create(text, int, int[], uuid, uuid) from anon, public;
grant execute on function public.tournament_create(text, int, int[], uuid, uuid) to authenticated;

do $$ begin
  insert into public.schema_migrations (version) values ('0049_more_security_hardening')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
