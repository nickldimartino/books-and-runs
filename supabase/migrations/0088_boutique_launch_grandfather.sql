-- Books & Runs — the launch fairness grandfather (see /tmp/wave/store.md's
-- "Fairness" section for the exact product decision this implements):
-- every account that exists in `leaderboard_entries` the moment this
-- migration runs gets a free `entitlements` row (source:
-- 'launch_grandfather') for every sku in the LAUNCH boutique catalog.
-- Only NEW accounts created after launch, and any item added to the store
-- AFTER this launch, ever require a real purchase. Bundle skus
-- (`bundle:*`) are deliberately NOT granted here — a grandfathered account
-- already owns every individual item a bundle would give it, and
-- `isSupporter` is specifically defined (see store.md's "Supporter
-- status") as a `source = 'stripe'` entitlement, so granting
-- `bundle:supporter` for free would be both redundant and misleading (it
-- would not, and should not, make the account a "Supporter").
--
-- ⚠️ RUN THIS LAST, after 0085–0087, and only once the real catalog is
-- final. ⚠️ EDIT BEFORE RUNNING:
--   * badge / avatar_frame / title / banner / avatar_emoji skus are
--     derived automatically from `cosmetic_unlocks` (every row with
--     requirement_kind = 'boutique' IS a launch boutique item for those
--     five categories, by construction — see 0053/0054/0087's own
--     comments) — nothing to edit for these five.
--   * card_face / card_back are deliberately NOT server-enforced (see
--     app/lib/cardCosmeticUnlocks.ts's own doc) and have no
--     cosmetic_unlocks row at all, so this migration cannot see them —
--     fill in CARD_FACE_LAUNCH_IDS / CARD_BACK_LAUNCH_IDS below with every
--     `id` the FINAL app/lib/cardFaceStore.ts / cardBackStore.ts marks
--     `unlock: { kind: "boutique" }` before running. The two arrays below
--     are only this file's pre-expansion snapshot (correct before Agent
--     B's catalog expansion lands) — treat them as a placeholder, not the
--     real launch list.
--
-- Idempotent (ON CONFLICT DO NOTHING) — safe to edit the two arrays and
-- re-run if the catalog changes before this is actually applied, or to
-- re-run after leaderboard_entries gains a row for an account that joined
-- between two runs (though ordinarily this should only run once, right
-- before the store goes live).

do $$
declare
  -- ⚠️ Snapshot of app/lib/cardFaceStore.ts / cardBackStore.ts's own
  -- `source: "boutique"` items as of this migration being written (15
  -- each, matching the full catalog expansion) — re-check against those
  -- two files before running, in case either changed after this was
  -- written.
  card_face_launch_ids text[] := array[
    'outline', 'mono', 'ledger', 'sketch', 'shadow', 'neon', 'ribbon',
    'engraved', 'chalk', 'halo', 'deco', 'blueprint', 'marquee', 'inked', 'royal'
  ];
  card_back_launch_ids text[] := array[
    'static', 'brushed', 'basketweave', 'houndstooth', 'tartan', 'chevron',
    'quilted', 'damask', 'confetti', 'marble', 'starfield', 'filigree',
    'obsidianweave', 'prismveil', 'goldleaf'
  ];
  launch_skus text[];
begin
  launch_skus := array(
    select cosmetic_type || ':' || cosmetic_key
    from public.cosmetic_unlocks
    where requirement_kind = 'boutique'
  );
  launch_skus := launch_skus || array(select 'card_face:' || id from unnest(card_face_launch_ids) as id);
  launch_skus := launch_skus || array(select 'card_back:' || id from unnest(card_back_launch_ids) as id);

  insert into public.entitlements (user_id, sku, source)
  select le.user_id, sku, 'launch_grandfather'
  from public.leaderboard_entries le
  cross join unnest(launch_skus) as sku
  on conflict (user_id, sku) do nothing;
end $$;

insert into public.schema_migrations (version) values ('0088_boutique_launch_grandfather')
on conflict (version) do nothing;
