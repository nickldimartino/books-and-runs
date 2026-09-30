-- Books & Runs — goal/community rewards pay XP, never a free Boutique item.
-- Run this once, after 0085-0099 (needs xp_ledger from 0056, entitlements
-- from 0085, and the friend-referral/community-milestone functions from
-- 0094/0096 this replaces).
--
-- Boutique items are a real purchase (or, for the 8 always-free classic
-- themes, just... free forever) — they were never meant to be something a
-- goal hands out. 0094's friend-referral reward and 0096's community
-- milestone both granted a Boutique badge for free; this switches both to
-- XP instead, through the exact same xp_ledger + my_bonus_xp() mechanism
-- Daily/Weekly completions and quests already use (0056) — an append-only,
-- service-role-only ledger whose (user_id, ref) primary key is the
-- idempotency guarantee, same as everywhere else it's used.
--
-- Deliberately NOT retroactive: anyone who already holds a 🗝️ or 🎻 badge
-- from before this migration keeps it — this only changes what happens on
-- the NEXT referral accept / the next (not-yet-reached) milestone, not what
-- already happened. entitlements.source keeps 'referral'/'community_milestone'
-- as valid values so those historical rows stay meaningful; nothing new
-- will be written with them going forward.

alter table public.xp_ledger
  drop constraint if exists xp_ledger_kind_check;
alter table public.xp_ledger
  add constraint xp_ledger_kind_check
  check (kind in ('daily', 'weekly', 'streak', 'quest', 'referral', 'community_milestone'));

-- ── Friend referral: 50 XP to both parties, once ever per account ──────────
-- Same "first ever, not per-pair" gating the original had (see 0094's own
-- doc on why) — a fixed ref, not one keyed to which friend it was, so
-- accepting a second/third friend request never pays out again.
create or replace function public.mp_respond_friend_request(request_id uuid, accept boolean)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r public.friendships;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into r from public.friendships where id = request_id;
  if r.id is null then raise exception 'no such request'; end if;
  if r.addressee_id <> me then raise exception 'not your request'; end if;
  if r.status <> 'pending' then return r; end if;

  if accept then
    update public.friendships set status = 'accepted', responded_at = now()
      where id = request_id returning * into r;
    insert into public.mp_events (user_id, kind, actor_id)
      values (r.requester_id, 'friend_accepted', me);

    insert into public.xp_ledger (user_id, ref, kind, xp)
    values
      (r.requester_id, 'referral:first', 'referral', 50),
      (me, 'referral:first', 'referral', 50)
    on conflict (user_id, ref) do nothing;

    return r;
  end if;

  delete from public.friendships where id = request_id;
  return null;
end;
$$;

-- No longer called by anything (the badge-sku reward it named is gone) —
-- safe to drop outright rather than leave an unused function behind.
drop function if exists public.friend_referral_reward_sku();

-- ── Community milestone: XP for every account instead of a badge ──────────
alter table public.community_milestones
  add column if not exists reward_xp integer;
update public.community_milestones set reward_xp = 150 where reward_xp is null;
alter table public.community_milestones
  alter column reward_xp set not null;
alter table public.community_milestones
  add constraint community_milestones_reward_xp_check check (reward_xp > 0 and reward_xp <= 1000);
alter table public.community_milestones
  drop column if exists reward_sku;

-- create or replace can't change a function's OUT-parameter row shape
-- (0096 defined this returning ..., reward_sku text, ...) — has to be
-- dropped first.
drop function if exists public.community_milestone_progress();

create function public.community_milestone_progress()
returns table (id int, metric text, current_count bigint, target bigint, reward_xp integer, reached_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  m record;
begin
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
    m.reward_xp,
    m.reached_at;
end;
$$;

revoke all on function public.community_milestone_progress() from public;
grant execute on function public.community_milestone_progress() to authenticated, anon;

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
  insert into public.xp_ledger (user_id, ref, kind, xp)
  select user_id, 'community_milestone:' || m.id, 'community_milestone', m.reward_xp
  from public.leaderboard_entries
  on conflict (user_id, ref) do nothing;

  return true;
end;
$$;

revoke all on function public.check_and_grant_community_milestone() from public;
-- Called by the daily-deal-reminder Edge Function via the service role, not
-- by any client — no grant to authenticated/anon.

insert into public.schema_migrations (version) values ('0100_goal_rewards_xp_not_boutique')
on conflict (version) do nothing;
