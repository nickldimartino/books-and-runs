-- Books & Runs — a way to comp specific accounts the whole Boutique catalog
-- for free (friends, family, testers) without it looking like — or ever
-- counting as — a real purchase. Run this once in the Supabase SQL editor,
-- after 0085–0090.
--
--   1. Widens `entitlements.source`'s CHECK constraint to allow 'comp'
--      alongside the existing 'stripe' | 'launch_grandfather' | 'apple' |
--      'google'. A 'comp' row behaves exactly like a real purchase for
--      every unlock check (they all just ask "is there ANY entitlements
--      row for this sku", regardless of source) — EXCEPT it does NOT
--      count toward Supporter status, which specifically checks the
--      `purchases` table (a real Stripe charge), not `entitlements.source`
--      — see player/page.tsx's own doc on that. A comped account is not
--      marked as having tipped/paid, which is the right call: they didn't.
--   2. `grant_boutique_comp(p_display_names text[])` — a function, not a
--      one-shot INSERT, so it can be reused later for more names without
--      editing this file again. Looks accounts up by display_name (unique,
--      case-insensitive — migration 0024), grants every individually-
--      purchasable item sku that exists RIGHT NOW (never a bundle's own
--      wrapper sku — same "only real items matter" rule the launch
--      grandfather and Everything Bundle both already follow), and reports
--      which names it couldn't find so a typo doesn't fail silently.
--   3. An example call, pre-filled with the 4 names from this
--      conversation — EDIT the array before running if you want different
--      or additional accounts. Idempotent (ON CONFLICT DO NOTHING), so
--      re-running it (e.g. after the catalog grows) safely tops up anyone
--      already comped with whatever's new, without touching what they
--      already have.

alter table public.entitlements
  drop constraint if exists entitlements_source_check;
alter table public.entitlements
  add constraint entitlements_source_check
  check (source in ('stripe', 'launch_grandfather', 'apple', 'google', 'comp'));

create or replace function public.grant_boutique_comp(p_display_names text[])
returns table (display_name text, account_found boolean, skus_granted int)
language plpgsql
as $$
declare
  -- card_face / card_back are deliberately client-side-only (no
  -- cosmetic_unlocks row at all — see cardCosmeticUnlocks.ts), and themes
  -- are ALSO client-side-only (see themeStore.ts) — both have to be
  -- hand-listed here, the same way 0088/0089 already had to for card
  -- face/back and this migration adds for theme. Keep these two arrays in
  -- sync with app/lib/cardFaceStore.ts / cardBackStore.ts / themeStore.ts's
  -- own `source: "boutique"` / paid-theme entries if the catalog changes.
  card_face_ids text[] := array[
    'outline','mono','ledger','sketch','shadow','neon','ribbon',
    'engraved','chalk','halo','deco','blueprint','marquee','inked','royal'
  ];
  card_back_ids text[] := array[
    'static','brushed','basketweave','houndstooth','tartan','chevron',
    'quilted','damask','confetti','marble','starfield','filigree',
    'obsidianweave','prismveil','goldleaf'
  ];
  theme_ids text[] := array[
    'arcade','citrus','frost','meadow','sahara','coralsand','aurora','lilac',
    'jade','champagne','verdigris','alabaster','valentines','sweetheart',
    'stpatricks','cloverfield','springdusk','easter','july4th',
    'starsandstripes','halloween','candycorn','thanksgiving','pumpkinspice',
    'hanukkah','festivaloflights','christmas','candycane','newyears','confetti'
  ];
  all_skus text[];
  name text;
  uid uuid;
  granted int;
begin
  -- badge / avatar_frame / title / banner / avatar_emoji ARE server-
  -- enforced (0053/0054/0089), so their full current list can be read
  -- straight from cosmetic_unlocks instead of hand-typed.
  all_skus := array(
    select cosmetic_type || ':' || cosmetic_key
    from public.cosmetic_unlocks
    where requirement_kind = 'boutique'
  );
  all_skus := all_skus || array(select 'card_face:' || x from unnest(card_face_ids) as x);
  all_skus := all_skus || array(select 'card_back:' || x from unnest(card_back_ids) as x);
  all_skus := all_skus || array(select 'theme:' || x from unnest(theme_ids) as x);

  foreach name in array p_display_names loop
    select le.user_id into uid
    from public.leaderboard_entries le
    join auth.users u on u.id = le.user_id
    where lower(le.display_name) = lower(name)
    limit 1;

    if uid is null then
      display_name := name;
      account_found := false;
      skus_granted := 0;
      return next;
      continue;
    end if;

    insert into public.entitlements (user_id, sku, source)
    select uid, sku, 'comp'
    from unnest(all_skus) as sku
    on conflict (user_id, sku) do nothing;
    get diagnostics granted = row_count;

    display_name := name;
    account_found := true;
    skus_granted := granted;
    return next;
  end loop;
end;
$$;

-- Example call — EDIT this array if the names have changed, then run it.
-- Re-running is safe (idempotent) and will top up anyone already comped
-- with any items the catalog has grown to include since.
select * from public.grant_boutique_comp(array['Babis', 'Big John', 'Elisa', 'Lala']);

insert into public.schema_migrations (version) values ('0091_boutique_comp_grant')
on conflict (version) do nothing;
