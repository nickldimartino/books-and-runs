-- Books & Runs — buy a Boutique cosmetic for a friend, not just yourself.
-- Run this once in the Supabase SQL editor, after 0085-0098 (needs
-- entitlements, purchases, and friendships).
--
-- A gift is always exactly one sku, paid for by one account (the payer)
-- and owned by another (the recipient) — never a cart, never self-gifting.
-- The payer must already be an accepted friend of the recipient (checked
-- both here and again, redundantly, in create-checkout-session/index.ts
-- with the caller's own RLS-scoped client — belt and suspenders, since this
-- RPC is the one place that can check ANOTHER account's entitlements at
-- all). `entitlements.source` gets a new 'gift' value so a gifted item is
-- distinguishable from a real self-purchase without being treated any
-- differently by any unlock check (every check already just asks "does a
-- row exist for this sku").

alter table public.entitlements
  drop constraint if exists entitlements_source_check;
alter table public.entitlements
  add constraint entitlements_source_check
  check (source in ('stripe', 'launch_grandfather', 'apple', 'google', 'comp', 'referral', 'community_milestone', 'gift'));

-- The payer's own receipt still shows who a purchase was for. Null for
-- every ordinary (non-gift) purchase. `on delete set null`, not cascade —
-- the recipient's account being deleted later shouldn't erase the payer's
-- own purchase history.
alter table public.purchases
  add column if not exists gift_recipient_id uuid references auth.users (id) on delete set null;

-- Can `auth.uid()` gift `p_sku` to `p_friend` right now? Checked from
-- create-checkout-session (with the payer's own JWT) before ever talking
-- to Stripe. Two things have to be true: the two accounts are actually
-- friends (this function is the only way a client can learn anything at
-- all about another account's entitlements, so it enforces that itself
-- rather than trusting the caller already checked), and the friend doesn't
-- already own the sku — gifting a duplicate would just be a needless
-- charge with nothing to grant. `security definer` is what lets an
-- ordinary signed-in client see into the FRIEND's entitlements row for
-- this one narrow check.
create or replace function public.boutique_can_gift(p_friend uuid, p_sku text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  are_friends boolean;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_friend is null or p_friend = me then raise exception 'invalid recipient'; end if;

  select exists(
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = me and addressee_id = p_friend)
        or (requester_id = p_friend and addressee_id = me))
  ) into are_friends;
  if not are_friends then raise exception 'you can only gift to a friend'; end if;

  return not exists(
    select 1 from public.entitlements where user_id = p_friend and sku = p_sku
  );
end;
$$;

revoke execute on function public.boutique_can_gift(uuid, text) from anon, public;
grant execute on function public.boutique_can_gift(uuid, text) to authenticated;

insert into public.schema_migrations (version) values ('0099_boutique_gifting')
on conflict (version) do nothing;
