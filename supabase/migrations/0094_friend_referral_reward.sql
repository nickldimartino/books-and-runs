-- Books & Runs — a small thank-you for actually using the friends system:
-- the first time an account's friend request is ever accepted (either
-- direction — whoever sent it and whoever accepted it), both get a free
-- Boutique badge. Run this once, after 0085-0093 (needs the entitlements
-- table).
--
-- Hooks the existing mp_respond_friend_request() RPC (0009) rather than
-- adding a new route — accepting is already the one place a friendship
-- actually becomes real, and it's already `security definer` so it can
-- write to `entitlements` the same way the checkout webhook does.
--
-- Deliberately NOT gated on "this is your first-ever accepted friendship"
-- at the *pair* level — it's gated at the *entitlement* level instead
-- (`on conflict do nothing` on `(user_id, sku)`), so unfriending and
-- re-adding the same person, or being on both sides of several requests,
-- can never grant it twice to the same account. A flat "you've connected
-- with a friend at all" reward, not an airtight one-referral-only ledger —
-- proportionate for a free cosmetic with zero competitive stakes.

alter table public.entitlements
  drop constraint if exists entitlements_source_check;
alter table public.entitlements
  add constraint entitlements_source_check
  check (source in ('stripe', 'launch_grandfather', 'apple', 'google', 'comp', 'referral'));

-- The shared reward sku — an existing Boutique badge, not a new one, so no
-- new art/catalog entry is needed. Picked for no reason beyond being a
-- pleasant common-tier badge; change this constant if the catalog changes.
create or replace function public.friend_referral_reward_sku()
returns text
language sql
immutable
as $$ select 'badge:🗝️'::text $$;

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

    insert into public.entitlements (user_id, sku, source)
    values
      (r.requester_id, public.friend_referral_reward_sku(), 'referral'),
      (me, public.friend_referral_reward_sku(), 'referral')
    on conflict (user_id, sku) do nothing;

    return r;
  end if;

  delete from public.friendships where id = request_id;
  return null;
end;
$$;

insert into public.schema_migrations (version) values ('0094_friend_referral_reward')
on conflict (version) do nothing;
