-- Books & Runs — Daily Deal per-deal friend leaderboard.
-- Run this once in the Supabase SQL editor, after 0001–0017.
--
-- Daily Deal (app/lib/dailyDealStore.ts) stays local for streak *logic* —
-- this adds one thing on top: once signed in, your score on a given day's
-- deal is recorded here so you can see how your friends did on the *same*
-- deal. Same "self-reported snapshot, trust the signed-in client, gate with
-- RLS" model as leaderboard_entries (0006). One row per (account, day); the
-- first finish of the day is canonical (matches recordDailyDealResult's own
-- idempotency — a replay never re-counts), enforced by the RPC's
-- `on conflict do nothing`.

create table if not exists public.daily_deal_scores (
  user_id    uuid not null references auth.users (id) on delete cascade,
  deal_date  text not null check (deal_date ~ '^\d{4}-\d{2}-\d{2}$'),
  score      integer not null check (score between -500 and 5000),
  won        boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, deal_date)
);

-- Friend-scores lookups filter by date across many accounts.
create index if not exists daily_deal_scores_by_date
  on public.daily_deal_scores (deal_date);

alter table public.daily_deal_scores enable row level security;

-- Owner-only direct access. Cross-account reads (a friend's score on the
-- same deal) go through daily_deal_friend_scores() below, never a broad
-- SELECT policy — a client can only ever read its own rows directly.
create policy "daily_deal_scores: owner read" on public.daily_deal_scores
  for select using (auth.uid() = user_id);
create policy "daily_deal_scores: owner insert" on public.daily_deal_scores
  for insert with check (auth.uid() = user_id);
create policy "daily_deal_scores: owner delete" on public.daily_deal_scores
  for delete using (auth.uid() = user_id);
-- Deliberately no UPDATE policy: the first result of the day is final.

-- ─────────────────────────────────────────────────────────────────────────
-- RPCs
-- ─────────────────────────────────────────────────────────────────────────

-- Record the caller's score for a deal. First write per day wins — a later
-- call (a replay) is a silent no-op, so this mirrors exactly how the local
-- streak/history treats a replay.
create or replace function public.daily_deal_submit(p_date text, p_score integer, p_won boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad date'; end if;
  -- Only today's or yesterday's deal — a client shouldn't be backfilling
  -- arbitrary history, and clock skew across devices is at most a day.
  if p_date < to_char((now() at time zone 'UTC')::date - 2, 'YYYY-MM-DD')
     or p_date > to_char((now() at time zone 'UTC')::date + 1, 'YYYY-MM-DD') then
    raise exception 'date out of range';
  end if;

  insert into public.daily_deal_scores (user_id, deal_date, score, won)
    values (me, p_date, greatest(-500, least(5000, p_score)), coalesce(p_won, false))
    on conflict (user_id, deal_date) do nothing;
end;
$$;

-- The caller's own score plus every accepted friend's score for one deal,
-- lowest (best) first. display_name comes from leaderboard_entries, same as
-- every other friend-facing lookup (mp_my_friends etc.).
create or replace function public.daily_deal_friend_scores(p_date text)
returns table (user_id uuid, display_name text, score integer, won boolean, is_me boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
    select d.user_id, le.display_name, d.score, d.won, (d.user_id = me) as is_me
    from public.daily_deal_scores d
    left join public.leaderboard_entries le on le.user_id = d.user_id
    where d.deal_date = p_date
      and (
        d.user_id = me
        or exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and (
              (f.requester_id = me and f.addressee_id = d.user_id)
              or (f.addressee_id = me and f.requester_id = d.user_id)
            )
        )
      )
    order by d.score asc, d.won desc, le.display_name nulls last;
end;
$$;

revoke execute on function
  public.daily_deal_submit(text, integer, boolean),
  public.daily_deal_friend_scores(text)
from anon, public;

grant execute on function
  public.daily_deal_submit(text, integer, boolean),
  public.daily_deal_friend_scores(text)
to authenticated;

do $$ begin
  insert into public.schema_migrations (version) values ('0018_daily_deal_scores')
    on conflict (version) do nothing;
exception when undefined_table then null;
end $$;
