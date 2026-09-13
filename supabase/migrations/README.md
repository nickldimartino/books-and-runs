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

## New migrations

Name `NNNN_short_description.sql`, and end the file with:

```sql
insert into public.schema_migrations (version) values ('NNNN_short_description')
on conflict (version) do nothing;
```
