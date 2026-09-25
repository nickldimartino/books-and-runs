# Supabase Edge Functions

## `mp` — multiplayer

The authority for multiplayer games: it runs the real `src/` game engine,
keeps the full state + shuffled deck server-side (in the `mp_game_state`
table, which has **no RLS policies** so no client can read it), validates
every move, and returns each player only their own redacted view. It's also
the only writer of `player_stats`/`achievement_counters`/`game_history` for
a multiplayer game (`creditAchievementCounters` after each verified move,
`recordMpGameOutcome` at game-over) — this used to be a separate client-side
write (`recordMpGameResult`, using the player's own RLS-scoped session)
that nothing re-verified against the real server state, closed alongside
the solo-stats hole below.

All the game logic is in [`../../src/mp/adapter.ts`](../../src/mp/adapter.ts)
(pure, unit-tested — `src/mp/adapter.test.ts`). `mp/index.ts` is auth +
database + routing + the stats-crediting logic above.

### Deploy

The Supabase deploy bundler does **not** resolve the app's extension-less
relative imports (`./deck`, `../types`, …). So before every deploy, copy the
engine with explicit `.ts` extensions into `mp/_engine/` (gitignored):

```bash
node scripts/bundle-mp-engine.mjs
npx supabase functions deploy mp
```

Re-run the bundle step whenever anything in `src/` changes. The
`supabase-js` dependency is pulled straight from JSR (`jsr:@supabase/supabase-js@2`)
so it needs no import map.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically. Requires `supabase/migrations/0010_multiplayer.sql`
to have been run first.

### Confirm it's live

```bash
npx supabase functions list        # should list `mp`
```

### Smoke test after deploy

With two signed-in test accounts that are already friends:

1. Account A creates a game inviting B (via the app once Stage 3 lands, or a
   direct `POST /functions/v1/mp/create` with a bearer token).
2. Account B `POST /functions/v1/mp/respond` `{ game_id, accept: true }`.
3. Either account `POST /functions/v1/mp/state` `{ game_id }` — confirm the
   response shows full cards only for that caller's own seat, counts for the
   rest, and no `drawPile` contents anywhere.

## `solo-verify` — server-verified solo/pass-and-play stats

Closes the one gap multiplayer never had: a solo/pass-and-play game runs
entirely in the browser (no server referee, so it works fully offline), and
until this function existed, the client wrote its own final stats straight
into `player_stats`/`achievement_counters`/`game_history` — nothing stopped
someone from calling the Supabase client directly and writing whatever
numbers they wanted. This function is the fix: the client sends the game's
starting seed and its full move log (see `app/GameContext.tsx`'s
`getSeed()`/`getMoveLog()`), and this function independently replays the
exact same game through the real engine
([`../../src/solo/replay.ts`](../../src/solo/replay.ts), pure and
unit-tested — `src/solo/replay.test.ts`) before writing anything. A replay
that doesn't hold up — an illegal move, a seed that deals a different game,
a fabricated extra draw — gets the whole submission rejected, no partial
writes. Final `player_stats`/achievement-counter deltas/`game_history` are
all *derived* from the verified replay, never taken from anything the
client claims.

Also rate-limited: a submission arriving less than `MIN_MS_BETWEEN_GAMES`
(10s — a generous floor, not a real pacing model) after the account's last
*credited* game is rejected outright, no write at all. Replay verification
alone only proves a submission is a *legal* game — the engine is ordinary
client-side JS, so nothing stops a script from generating a valid-looking
move log offline far faster than a human could actually play one through
the UI — this is the backstop for that.

**Daily Deal completions** flow through the same function (`isDailyDeal:
true`, `dailyDealDateKey` — see `verifySoloGame.ts`'s
`buildDailyDealVerifyPayload`) but take a different branch entirely: no
player_stats/achievement_counters/game_history write (Daily Deal has never
counted toward those), just a verified `daily_deal_completions` row after
checking the claimed date both hashes to the submitted seed and is close
enough to the function's own clock to be believable. See migration 0036 —
the trigger that actually makes this matter.

**Weekly Challenge completions** — Daily Deal's bigger, harder sibling (the
full 7-round game vs. 3 Hard AIs, seeded by the week instead of the day) —
flow through the same function the same way (`isWeeklyChallenge: true`,
`weeklyChallengeWeekKey` — see `verifySoloGame.ts`'s
`buildWeeklyChallengeVerifyPayload`), verified into
`weekly_challenge_completions` instead of `daily_deal_completions`. See
migration 0039.

**Bonus XP and quests** (migrations 0056/0057). A verified Daily Deal /
Weekly Challenge completion additionally refreshes the account's daily/weekly
achievement counters and credits fixed XP (25 / 100, plus Daily streak
milestones at 7/30/100 days) through `xp_ledger`, whose `(user_id, ref)`
primary key makes each credit idempotent — a retry or replay pays nothing more
and the response only reports what *that* request newly credited (`xp`,
`streakBonuses`). A regular game first ensures the account has this UTC
day's / ISO week's `quest_baselines` snapshot (before its own deltas land),
then auto-claims completed quests (`quests` in the response). A body of just
`{ "action": "quests" }` does the baseline + auto-claim step alone (Home calls
it on load, which is how multiplayer-earned progress gets paid). The logic
lives in `src/challengeRewards.ts` (bundled into `_engine/`) and is unit-tested
against an in-memory fake. Reward/quest steps are best-effort: they never fail
the game/completion record itself. **Apply migration 0056 before deploying.**

### Deploy

```bash
node scripts/bundle-solo-verify-engine.mjs
npx supabase functions deploy solo-verify
```

Re-run the bundle step whenever anything in `src/` changes — same reasoning
as `mp`'s own bundle step, but with its own `_engine/` copy and a smaller
SKIP list (no `ai/` or `mp/`: solo-verify replays already-concrete logged
moves, never re-runs AI strategy code).

Requires the migration that locks down direct client writes to
`player_stats`/`achievement_counters` (see the migrations README) to have
been run — until then this function and the client's old direct-write path
both work, which is fine during rollout but means the exploit isn't closed
yet.

### Smoke test after deploy

With a signed-in test account, play (and finish) a solo game in the app,
then confirm in the Supabase dashboard that `player_stats.games_played` and
`game_history` both picked up the new game. Then confirm the hole is
actually closed:

```js
// From the browser console, signed in — should now be rejected once the
// RLS-lockdown migration has run:
await window.supabase.from("player_stats").update({ games_won: 999999 }).eq("user_id", (await window.supabase.auth.getUser()).data.user.id);
```

## `daily-deal-reminder` — streak-at-risk push (Daily Deal *and* Weekly Challenge)

Push notifications previously only ever fired for multiplayer events
(`your_turn`/`game_request`/`nudge`, see `mp`'s own `PUSH_COPY`) — this was
the first one for anything else. A `pg_cron` job (see
[`../migrations/0038_daily_deal_reminder_cron.sql`](../migrations/0038_daily_deal_reminder_cron.sql))
calls this once a day; it finds every account whose Daily Deal streak is a
real, server-verified one (migration 0036) but hasn't been extended to today
yet, and sends each a push through the same `push_subscriptions` table and
VAPID keys `mp` uses. Reuses the same **Turn notifications** on/off setting
on the Settings page — there's no separate toggle for this.

Also checks Weekly Challenge streaks (migration 0039) on the same daily
firing, but only actually queries/sends on Saturday and Sunday (UTC) — a
week-long "haven't played this week yet" condition is true for 6 of 7 days,
so it's gated to the 2 days where that's a real warning rather than daily
spam. Still deployed under this function's original name rather than a
second function/cron job/Vault secret for an identical shape — see the
function's own top-of-file comment for the reasoning.

Not user-triggered, so it has no JWT to check — auth is a single shared
secret (`CRON_SECRET`) instead of the per-user pattern every other function
here uses.

### Deploy

```bash
npx supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
npx supabase functions deploy daily-deal-reminder
```

No `_engine/` bundle step — this function never touches the game engine.
Then run `supabase/migrations/0038_daily_deal_reminder_cron.sql`'s setup
(Vault secret + `cron.schedule`) — see that file's own header; it needs the
exact same `CRON_SECRET` value and can't be fully automated from here since
it involves a secret that must never be committed to the repo.

### Smoke test after deploy

```bash
export $(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | xargs)
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/daily-deal-reminder" \
  -H "Authorization: Bearer <your CRON_SECRET>"
```

Expect `{"sent":0}` (or a real count, if some account is genuinely at risk
right now) rather than a 401.

## `contact` — bug reports & feature requests

Takes a submission from the Support page (`app/support/page.tsx`) and emails
it via [Resend](https://resend.com). Exists so the destination address
never has to ship to the client — it lives only in the `SUPPORT_EMAIL`
secret below. Callable while signed out; see the function's own doc for why
that's fine here.

### Deploy

```bash
npx supabase secrets set RESEND_API_KEY=re_xxx SUPPORT_EMAIL=you@example.com
npx supabase functions deploy contact
```

## `stripe-webhook` — the tip jar

Records a completed Stripe Payment Link checkout from the "Support the
developer" page (`app/tip/page.tsx`) into `supporter_payments` (migration
0043) — the ☕ Supporter badge unlocks off that table, never off anything
the client claims. No Stripe SDK: verifies the `Stripe-Signature` header
directly with Deno's Web Crypto (see the function's own doc for why).

Requires migration 0043 to have run first.

### Deploy

```bash
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

`--no-verify-jwt` matters — Stripe's own requests carry no Supabase JWT at
all, so the platform's default auth gate would reject every delivery before
the function's own signature check ever ran.

Then, one-time setup in the Stripe Dashboard:
1. Create a free Stripe account if you don't have one.
2. **Payment Links** → create one per fixed-price tip tier you want
   (Settings' own Help section links to `/tip`, which expects a
   `PAYMENT_LINKS` array — fill in the real URLs in `app/tip/page.tsx`).
3. **Developers → Webhooks → Add endpoint** → paste this function's URL
   (`$SUPABASE_URL/functions/v1/stripe-webhook`) → subscribe to
   `checkout.session.completed` only.
4. Copy the endpoint's own "Signing secret" (starts `whsec_`, different
   from any API key) into `STRIPE_WEBHOOK_SECRET` above.

`RESEND_API_KEY` comes from a (free-tier is plenty) [Resend](https://resend.com)
account. Without a verified custom domain, Resend's shared `onboarding@resend.dev`
sender can only deliver to the email address the Resend account itself was
signed up with — which is exactly what you want here if `SUPPORT_EMAIL` is
that same address, so no domain verification is required to get this
working. Verify a real domain later if you want a nicer `from` address or
need `SUPPORT_EMAIL` to differ from the Resend account's own address.

### Smoke test after deploy

`$SUPABASE_URL`/`$SUPABASE_ANON_KEY` aren't real shell env vars — pull them
from `.env.local` (the app's own `NEXT_PUBLIC_...` copies) instead of typing
them by hand:

```bash
export $(grep -E '^NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)=' .env.local | xargs)
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/contact" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"bug","subject":"test","description":"smoke test"}'
```

Expect `{"ok":true}` and an email at `SUPPORT_EMAIL` within a minute.


## Social / safety additions (migrations 0060–0064)

**`mp`** gained routes: `nudge` (badge + localised push, rate-limited), `emote` (fixed presets, rate-limited, block-aware), `friend_push` (push for a friend request just made via SQL), `resign_all` (used by `delete-account`) and `sweep` (cron only). It now also enforces the **turn clock** lazily on every `state`/`move` (a stalled player's first miss auto-plays a safe move, the second in a row forfeits; the stalled player's own read never triggers it) and pushes in each recipient's language, honouring their per-category switches, quiet hours and an hourly cap (`_shared/push.ts`). Redeploy with `node scripts/bundle-mp-engine.mjs && npx supabase functions deploy mp`.

Optional scheduled sweep (forfeits games nobody opens, 75% reminder, expires 7-day-old pending invites): set `CRON_SECRET` (same value as `daily-deal-reminder`) and run the `cron.schedule` block at the end of migration 0061 (needs your project ref + anon key; the secret goes in the `x-cron-secret` header). Without it everything still works lazily.

**`delete-account`** (new): `npx supabase functions deploy delete-account`. Re-verifies the password server-side, calls `mp/resign_all`, `delete_account_prepare()`, removes the avatar object, then `auth.admin.deleteUser`.

**`daily-deal-reminder`** now words each push in the recipient's saved language and skips accounts with streak reminders off / in quiet hours. Redeploy. **`contact`** accepts `type: "privacy"` (redeploy).
