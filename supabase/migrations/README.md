# Database migrations

These `.sql` files are applied **by hand** in the Supabase SQL editor, in
order. There is no CLI workflow. `public.schema_migrations` (created by
`0016_observability.sql`) records what a project has actually run — every
migration from 0016 on ends by inserting its own version row, so:

```sql
select version, applied_at from schema_migrations order by version;
```

tells you a project's real state.

## Applying a migration

1. Open the file, paste the whole thing into the Supabase SQL editor, run it.
2. Migrations are written to be safe to re-run (`create table if not exists`,
   `create or replace function`, `on conflict do nothing`), so a partial
   failure can be fixed and the file re-run.
3. Confirm with the query above.

## The list

| # | What it adds |
|---|---|
| 0001 | accounts, `player_stats`, `game_history` |
| 0002 | `achievement_counters` |
| 0003–0005 | `worst_score`, `games_tied`, `winner_score` columns |
| 0006 | `leaderboard_entries` (public, self-reported) |
| 0007–0008 | Daily Deal streak / last-played, cross-device |
| 0009 | Friends — `profiles` + friend codes, `friendships`, `mp_events`, RPCs |
| 0010 | Multiplayer — `mp_games`, sealed `mp_game_state`, `mp_participants`, RPCs |
| 0011 | MP stats — `mp_my_stats()`, `mp_*` columns on `leaderboard_entries` |
| 0012 | one-tap friend links (`mp_add_friend_by_code`) |
| 0013 | security hardening — `WITH CHECK` policies, name constraint, RPC rate limit |
| 0014 | MP housekeeping — `mp_trim_events`, daily `pg_cron` sweep |
| 0015 | `solo_saves` — sync the in-progress solo/pass-and-play game |
| 0016 | observability — `schema_migrations`, `client_errors`, `app_events` |
| 0017 | `mp_nudge()` — "your turn" reminder, rate-limited |
| 0018 | `daily_deal_scores` — per-deal friend leaderboard (`daily_deal_submit`, `daily_deal_friend_scores`) |
| 0019 | `favorite_game_configs` — sync "my usual" solo/pass-and-play setup across devices |
| 0020 | `push_subscriptions` — Web Push ("your turn" notifications), sent from the `mp` function via VAPID |
| 0021 | `leaderboard_entries.bio` — a short account bio |
| 0022 | Sync every remaining Settings preference to the account |
| 0023 | `ambient_track` column — which ambient song(s) to play |
| 0024 | Public player profiles — unique (case-insensitive) `display_name`, avatar columns, the `avatars` Storage bucket |
| 0025 | `profile_photo_reports` — flag an inappropriate profile photo for manual review |
| 0026 | Profile showcase — pinned trophy case (`leaderboard_entries.showcase`), and milestone-gated premium avatar emoji enforced by a trigger (`achievement_expert_thresholds`, `category_mastered()`) |
| 0027 | Fixes 0026's level gate to compute your level live (`compute_level()`, `compute_total_xp()`) instead of trusting the periodically-synced `leaderboard_entries.level` snapshot, which could lag behind a real level-up. Replaces `achievement_expert_thresholds` with the fuller `achievement_thresholds` (all 5 tiers, not just Expert). |
| 0028 | Avatar frames + nameplate titles (`leaderboard_entries.avatar_frame`/`.title`), a public mirror of your equipped card back/face (`.showcase_card_back`/`.showcase_card_face`), and a data-driven `cosmetic_unlocks` catalog + generic trigger replacing 0026/0027's single-purpose emoji trigger. |
| 0029 | Profile banner (`leaderboard_entries.banner`, one more gated cosmetic), `joined_at` ("member since"), and `achievement_unlock_counts` — a daily `pg_cron`-refreshed summary table powering each trophy's rarity %. |
| 0030 | `leaderboard_entries.is_creator` — a "Creator" badge shown on one account's profile, set once by matching `auth.users.email` (never through a client update function). |
| 0031 | `leaderboard_entries.badge` — moves the 13 milestone/category-mastery emoji off `avatar_emoji` (which now only takes the 46 free ones) onto their own overlay column, so a photo or free emoji and an earned badge can show together instead of one replacing the other. |
| 0032 | Avatar frames become free, purely stylistic picks (bronze/silver/gold/diamond renamed to amber/mist/citrine/sky, their level-gate rows removed from `cosmetic_unlocks`) — only "Grandmaster" stays earned. Also fixes `mp_my_stats()` computing stats for `auth.uid()` instead of the account actually being asked about — harmless from a real client, but broke any admin/migration bulk-update touching a row with a gated title/badge/banner already set. Adds `mp_stats_for(p_user_id)`; `compute_total_xp`/`category_mastered` now use it directly. |
| 0033 | Fixes a mistake in 0032 that broke saving any frame/title/banner/badge: `mp_stats_for()` was locked to internal-only, but its callers (`compute_total_xp`/`category_mastered`) weren't `security definer`, so a real user's nested call to it was denied. Makes both `security definer` so the whole chain runs under one consistent identity. |
| 0034 | Widens `leaderboard_avatar_color_ok`/`leaderboard_banner_ok` for a much larger set of avatar background colors and profile banners (avatar frames need no DB change — no CHECK constraint on that column). |
| 0035 | Closes the solo/pass-and-play stats-cheating hole: drops the owner insert/update policies on `player_stats`/`achievement_counters` (only the new `solo-verify` Edge Function's service-role key can write them now — same idea as `mp_game_state`'s own zero-RLS lockdown for multiplayer), and adds a trigger overwriting `leaderboard_entries`' `level`/`total_xp`/`games_played`/`games_won`/`average_score`/`worst_score` with server-recomputed values on every write, so a client can no longer push fake numbers into those columns either. Run only after `solo-verify` is deployed and confirmed working — the app's old direct-write path stops working the moment this runs. |
| 0036 | Closes the same hole for the Daily Deal streak specifically: adds `daily_deal_completions` (user_id, date — service-role-only writes) and a trigger recomputing `leaderboard_entries`' `daily_deal_streak`/`daily_deal_best_streak`/`daily_deal_last_played` from it on every write, so those three (previously plain client-writable) columns can no longer be pushed directly either. Run only after `solo-verify` is redeployed with Daily Deal support — every account's streak reads as 0 until then, since nothing has inserted a completion row yet. |
| 0037 | `settings.haptics_on` — splits Haptics into its own synced toggle, previously bundled into `sound_on`. |
| 0038 | Schedules the `daily-deal-reminder` Edge Function via `pg_cron`/`pg_net`, once a day, for every account whose Daily Deal streak is at risk of lapsing today. Needs manual one-time setup outside this file (a Vault secret, never committed) — see the file's own header and `supabase/functions/README.md`. |
| 0039 | The Weekly Challenge (Daily Deal's bigger, harder sibling — the full 7-round game vs. 3 Hard AIs, seeded by the week): `weekly_challenge_completions` (user_id, week — service-role-only writes, same shape as 0036's `daily_deal_completions`) and a trigger recomputing `leaderboard_entries`' new `weekly_challenge_streak`/`weekly_challenge_best_streak`/`weekly_challenge_last_played` columns from it. Run only after `solo-verify` is redeployed with Weekly Challenge support. |
| 0040 | Clubs ("a regular table") — `clubs` + `club_members` (owner-curated, only onto an existing friend), RPCs for create/rename/delete/add/remove member, and `club_standings()` — a filtered, re-ranked view of each member's real multiplayer stats (no new stats pipeline). |
| 0041 | Tournaments — a fixed roster playing a fixed number of ordinary multiplayer games back-to-back (round-robin series, deliberately not an elimination bracket — see the file's own doc for why). `tournaments` + `tournament_games` (a thin linking layer; no changes to the `mp` Edge Function or its engine at all), RPCs to create a series from an already-created game, link each later round (a rematch), cancel, and compute live standings from `mp_participants`' own outcome/final_score. |
| 0042 | The Rarity Vault — 3 new cosmetic tiers above Level 100/Grandmaster (Epic: 3-of-9/6-of-9 categories mastered; Mythic: Level 250, 500 solo games played, a 30-day Daily Deal streak, a 12-week Weekly Challenge streak; Prismatic: every condition at once), plus a Creator-exclusive frame + banner (`is_creator`). Extends `cosmetic_unlocked()` with new `requirement_kind`s (`categories_count`/`games_played`/`daily_deal_streak`/`weekly_challenge_streak`/`complete`/`creator_only`), widens `leaderboard_banner_ok`/`leaderboard_badge_ok`, and seeds the new `cosmetic_unlocks` rows. |
| 0043 | The "Support the developer" tip jar — `supporter_payments` (user_id, stripe_session_id — service-role-only writes, populated by the new `stripe-webhook` Edge Function after a completed Stripe Payment Link checkout), a new `supporter_only` `cosmetic_unlocked()` branch, and the ☕ badge. Run only after `stripe-webhook` is deployed and its Payment Links are configured (see `supabase/functions/README.md`) — until then the badge just stays locked for everyone. |
| 0044 | Seasonal (monthly) leaderboard — `season_snapshots` (user_id, season_start, games_played, games_won) and `snapshot_season_start()`, scheduled monthly via `pg_cron` (plus a run-once backfill for the current month). Purely additive: only ever reads `leaderboard_entries`, never writes to it — the app derives "this month" client-side as current cumulative minus the snapshot (see `app/leaderboard/page.tsx`). The existing all-time board is untouched. |
| 0045 | `settings.show_meld_hint` — syncs the "Hint: Auto-meld" button's Settings toggle (off by default) across devices, same nullable pattern as every column since 0022. |
| 0046 | `settings.text_scale` — syncs the "Text size" accessibility control across devices; usable while signed out too, unlike Theme. |
| 0047 | Hide testing accounts from the public leaderboard — `leaderboard_entries.is_test_account` (SQL-editor-only, same pattern as 0030's `is_creator`; never touched by any client-facing function), excluded client-side in `app/leaderboard/page.tsx` and in `refresh_achievement_rarity()`'s own denominator. See the migration's own comment for the exact SQL to flag/unflag an account. |
| 0048 | Security hardening from a full audit — CSP fix, `mp`/`solo-verify` error-message leakage, `daily-deal-reminder`'s cron-secret check made timing-safe, an atomic `solo_verify_upsert_player_stats()` RPC closing a TOCTOU race in the solo-game pacing floor, a trigger locking `leaderboard_entries.is_creator`/`.is_test_account` to their existing value, `avatar_photo_path` ownership CHECK, bounded `client_errors` column lengths, and re-verified grants across every club/tournament RPC. |
| 0049 | Three follow-ups deferred out of 0048: `compute_total_xp()`/`category_mastered()` can now only be asked about yourself (previously any signed-in account could read another account's derived stats/achievement progress); profile photo reports move from a direct client insert to a rate-limited `report_profile_photo()` RPC; `club_create()`/`tournament_create()` get real per-account caps (10 owned clubs, 10 active tournaments hosted at once). |
| 0050 | Cheat-prevention audit findings: `leaderboard_entries.mp_games_played`/`.mp_games_won`/`.mp_best_win_streak` were the one stat family never locked down like the rest — `sync_leaderboard_truth()` (0035) now overwrites these too, from `mp_stats_for()`'s honest server-side numbers, instead of trusting whatever a client pushes. Also drops `game_history`'s leftover client-insert policy from 0001 (the real write, via `solo-verify`'s service-role key, was already unaffected — this just closes an unused direct-insert path). |
| 0051 | Cosmetic rarity overhaul, phase 2 — 4 new badge milestones (🔰 Level 5, 🛡️ Level 150, 🎯 1 category mastered, 🕯️ a 7-day Daily Deal streak), each reusing an existing `requirement_kind` (no SQL-function changes needed), plus widening `leaderboard_badge_ok` for 2 new auto-unlocked "Boutique" badges (🎩🕶️ — no `cosmetic_unlocks` row at all, which is already unconditionally free). See `app/lib/cosmeticRarity.ts` and `plans/quiet-snacking-cloud.md`. |
| 0052 | Cosmetic rarity overhaul, phase 3 — 4 new `requirement_kind`s on `cosmetic_unlocked()` (`worst_score_under`/`average_score_under`/`games_tied`/`mp_win_streak`, each reading an already-server-verified column, no new tamper-resistant data source needed), 2 new named rewards as badge+frame+title+banner (Steady Hand, Hot Streak) plus 2 single badges (🧊🤝), and 6 new auto-unlocked "Boutique" items across frame/title/banner (badges got theirs in 0051). Widens `leaderboard_badge_ok`/`leaderboard_banner_ok`. |
| 0053 | Gates the Boutique track behind a real requirement instead of leaving it unconditionally free — a new `boutique` `requirement_kind` on `cosmetic_unlocked()` (reads `is_creator`, same data as `creator_only` but kept as its own kind so flipping on a real purchase later is a single-branch change, not a data migration) plus `cosmetic_unlocks` rows for the 8 existing badge/frame/title/banner Boutique items. Card face/card back Boutique items stay client-side-only (see `app/lib/cardCosmeticUnlocks.ts`), so they get no row here. |
| 0054 | Expands the Boutique from 2 to 10 items per category (badge/frame/title/banner/card face/card back), every item unique from each other and from every free/earned option. Widens `leaderboard_badge_ok`/`leaderboard_banner_ok` for the 8 new badges/banners (`avatar_frame`/`title` need no CHECK change) and adds `cosmetic_unlocks` rows (`boutique` kind, same as 0053) for the 32 new badge/frame/title/banner items. The 8 new card faces and 8 new card backs stay client-side-only. |

## New migrations

Name `NNNN_short_description.sql`, and end the file with:

```sql
insert into public.schema_migrations (version) values ('NNNN_short_description')
on conflict (version) do nothing;
```
