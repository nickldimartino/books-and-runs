-- Books & Runs — server-credited bonus XP (Daily Deal / Weekly Challenge
-- completions, streak milestones, quests) and the per-period quest
-- baselines. Run this once in the Supabase SQL editor, after 0001–0055 and
-- BEFORE redeploying `solo-verify` (the function starts writing these
-- tables). Safe to run first: nothing reads the new tables until the
-- redeployed function/app do, and until then nothing changes for anyone.
--
-- Why a ledger: level/XP has always been a pure function of already-
-- verified counters (compute_total_xp(), migration 0027/0049, mirrored by
-- src/leveling.ts) — there is no stored XP total to tamper with. Daily/
-- weekly completions and quests don't map onto a counter, so they get the
-- one thing they need: an append-only, service-role-only ledger whose
-- PRIMARY KEY is the idempotency guarantee. (user_id, ref) — e.g.
-- 'daily:2026-09-25', 'weekly:2026-W39', 'streak:daily:7',
-- 'quest:2026-09-25:d_play' — can exist once, so a replayed/retried request
-- can never pay the same thing twice. compute_total_xp() now adds the sum.
--
-- Quests: progress is "metric now minus metric at the start of the period",
-- computed from already-verified player_stats / achievement_counters. The
-- start-of-period snapshot is a quest_baselines row, written only by the
-- solo-verify service role; the client can read both tables (owner-only)
-- to display progress but can never write either.

create table if not exists public.xp_ledger (
  user_id uuid not null references auth.users (id) on delete cascade,
  ref text not null check (char_length(ref) between 1 and 80),
  kind text not null check (kind in ('daily', 'weekly', 'streak', 'quest')),
  xp integer not null check (xp > 0 and xp <= 1000),
  awarded_at timestamptz not null default now(),
  primary key (user_id, ref)
);

alter table public.xp_ledger enable row level security;

drop policy if exists "xp_ledger: owner read" on public.xp_ledger;
create policy "xp_ledger: owner read" on public.xp_ledger
  for select using (auth.uid() = user_id);
-- No insert/update/delete policy — only solo-verify's service-role client
-- ever writes this table (same "zero client-facing write RLS" idea as
-- player_stats/achievement_counters since 0035).

create table if not exists public.quest_baselines (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- '2026-09-25' (UTC day) or '2026-W39' (ISO week) — src/quests.ts's
  -- currentPeriodKey.
  period_key text not null check (char_length(period_key) between 8 and 12),
  baseline jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, period_key)
);

alter table public.quest_baselines enable row level security;

drop policy if exists "quest_baselines: owner read" on public.quest_baselines;
create policy "quest_baselines: owner read" on public.quest_baselines
  for select using (auth.uid() = user_id);

-- The caller's own ledger total, for the client's level display.
create or replace function public.my_bonus_xp()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(xp), 0)::bigint from public.xp_ledger where user_id = auth.uid();
$$;

revoke execute on function public.my_bonus_xp() from anon, public;
grant execute on function public.my_bonus_xp() to authenticated;

-- Atomic jsonb merge into achievement_counters for solo-verify's Daily/
-- Weekly counters (absolute values recomputed from the completion tables,
-- so a retry re-sets the same numbers). Service-role only — this would let
-- a caller set any counter, so it must NOT be callable by `authenticated`.
create or replace function public.solo_verify_set_counters(p_user_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.achievement_counters (user_id, counters, updated_at)
  values (p_user_id, p_patch, now())
  on conflict (user_id) do update
    set counters = public.achievement_counters.counters || excluded.counters,
        updated_at = now();
end;
$$;

revoke execute on function public.solo_verify_set_counters(uuid, jsonb) from anon, authenticated, public;

-- compute_total_xp(): unchanged (migration 0049 body, self-scope check
-- included) except for the final ledger term.
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

  -- Daily Deal / Weekly Challenge completions, streak milestones, quests.
  xp := xp + coalesce((select sum(l.xp) from public.xp_ledger l where l.user_id = p_user_id), 0);

  return xp;
end;
$$;

revoke execute on function public.compute_total_xp(uuid) from anon, public;
grant execute on function public.compute_total_xp(uuid) to authenticated;

do $$ begin
  insert into public.schema_migrations (version) values ('0056_xp_ledger_quests')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
