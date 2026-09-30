-- Books & Runs — a rare, site-wide milestone every account contributes to
-- together (Pokémon GO Community Day-style), distinct from a per-account or
-- per-club goal. Run this once, after 0085-0095 (needs entitlements).
--
-- One row per milestone, reached in order. Seed one modest first milestone
-- below — EDIT the target before running if the real completed-Daily-Deal
-- count is already known to be past it (see the SELECT beneath the seed to
-- check first). Add the next milestone by hand once this one is reached;
-- deliberately not auto-generated, so each one can get a real, specific
-- reward chosen on purpose rather than a formula picking one blindly.

create table if not exists public.community_milestones (
  id int primary key generated always as identity,
  metric text not null check (metric in ('daily_deals_completed')),
  target bigint not null check (target > 0),
  reward_sku text not null,
  reached_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.community_milestones enable row level security;

-- Public read — this is a site-wide stat, not account data. No insert/
-- update/delete policy: only check_and_grant_community_milestone() (below,
-- security definer) or a human in the SQL editor ever writes this table.
create policy "community_milestones: anyone read" on public.community_milestones
  for select using (true);

alter table public.entitlements
  drop constraint if exists entitlements_source_check;
alter table public.entitlements
  add constraint entitlements_source_check
  check (source in ('stripe', 'launch_grandfather', 'apple', 'google', 'comp', 'referral', 'community_milestone'));

-- The current (first un-reached) milestone, plus live progress toward it.
-- Public — no auth required to read a site-wide count.
create or replace function public.community_milestone_progress()
returns table (id int, metric text, current_count bigint, target bigint, reward_sku text, reached_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  m record;
begin
  -- Table-qualified: this function's own OUT parameter is also named
  -- `reached_at` (same bug shape as 0091's `found` — a bare column name
  -- that collides with a same-named PL/pgSQL variable silently resolves to
  -- the variable, not the column, here making the filter always true).
  select cm.* into m from public.community_milestones cm where cm.reached_at is null order by cm.id asc limit 1;
  if m.id is null then
    return; -- every milestone seeded so far has been reached
  end if;
  return query select
    m.id,
    m.metric,
    case m.metric
      when 'daily_deals_completed' then (select count(*) from public.daily_deal_completions)
      else 0
    end,
    m.target,
    m.reward_sku,
    m.reached_at;
end;
$$;

revoke all on function public.community_milestone_progress() from public;
grant execute on function public.community_milestone_progress() to authenticated, anon;

-- Checks the current milestone and, if its target is now met, marks it
-- reached and grants every existing account the reward in one pass — same
-- "every account in leaderboard_entries" bulk-insert shape 0088's launch
-- grandfather already used. `for update skip locked` means two overlapping
-- calls (e.g. a retried cron run) can't both grant it: the second finds the
-- row already locked (and by the time it gets it, reached_at is set) or
-- finds nothing left un-reached.
create or replace function public.check_and_grant_community_milestone()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  current_count bigint;
begin
  select * into m from public.community_milestones
    where reached_at is null order by id asc limit 1
    for update skip locked;
  if m.id is null then
    return false;
  end if;

  current_count := case m.metric
    when 'daily_deals_completed' then (select count(*) from public.daily_deal_completions)
    else 0
  end;
  if current_count < m.target then
    return false;
  end if;

  update public.community_milestones set reached_at = now() where id = m.id;
  insert into public.entitlements (user_id, sku, source)
  select user_id, m.reward_sku, 'community_milestone'
  from public.leaderboard_entries
  on conflict (user_id, sku) do nothing;

  return true;
end;
$$;

revoke all on function public.check_and_grant_community_milestone() from public;
-- Called by the daily-deal-reminder Edge Function via the service role, not
-- by any client — no grant to authenticated/anon.

-- Seed the first milestone: 2,000 completed Daily Deals across everyone,
-- rewarding a modest common badge. Adjust `target`/`reward_sku` before
-- running if 2,000 is already behind reality — check with:
--   select count(*) from public.daily_deal_completions;
insert into public.community_milestones (metric, target, reward_sku)
select 'daily_deals_completed', 2000, 'badge:🎻'
where not exists (select 1 from public.community_milestones);

insert into public.schema_migrations (version) values ('0096_community_milestone')
on conflict (version) do nothing;
