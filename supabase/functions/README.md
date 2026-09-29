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

## `create-checkout-session` — the boutique store

Starts a real-money Stripe Checkout for a cart of boutique cosmetics
(badges, avatar frames, titles, banners, avatar emoji, card faces, card
backs — see migrations 0085–0088 and `src/store/catalog.ts`). Auth
required (a real signed-in user's JWT, not anon). No Stripe SDK — same
"call the REST API directly with the secret key" approach `stripe-webhook`
already uses.

**Request:** `POST /functions/v1/create-checkout-session` with
`Authorization: Bearer <user JWT>` and body `{ "skus": string[] }` (one
item, a bundle sku, or several single items in one cart).

**Response:** `200 { "url": string }` (redirect the browser here — it's the
Stripe Checkout Session URL) or an error body `{ "error": string }` with
`400` (bad request / unknown sku), `401` (not signed in), `409` (a sku in
the cart is already owned), or `500`/`502` (server/Stripe-side failure).

Every price and display name comes from the bundled catalog, never from
the request — see `src/store/checkout.ts` (pure, unit-tested in
`src/store/checkout.test.ts`) for the exact request-building logic, and
that file's own doc for why prices can never be client-submitted.

### Deploy

```bash
node scripts/bundle-checkout-catalog.mjs
npx supabase functions deploy create-checkout-session
npx supabase secrets set STRIPE_SECRET_KEY=sk_live_or_test_...
```

Re-run the bundle step whenever `src/store/catalog.ts` changes — same
reasoning as `mp`'s/`solo-verify`'s own engine bundle (the deploy bundler
doesn't resolve the app's extension-less relative imports).

Requires migrations 0085–0087 to have run first (0088, the launch
grandfather, can run any time after — see the migrations README). The
Stripe Dashboard webhook endpoint doesn't need a new subscription: it's the
same endpoint `stripe-webhook` already uses, already subscribed to
`checkout.session.completed` (just confirm that's still true).

Optional: `SITE_URL` overrides the success/cancel redirect origin
(defaults to the production app — set this for testing against a local dev
server with a Stripe test key). `STRIPE_AUTOMATIC_TAX=1` turns on Stripe
Tax for these sessions — only meaningful once Stripe Tax is configured in
the Stripe Dashboard first.

### Smoke test after deploy

```bash
export $(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | xargs)
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/create-checkout-session" \
  -H "Authorization: Bearer <a real signed-in user's access token>" \
  -H "Content-Type: application/json" \
  -d '{"skus":["badge:🎩"]}'
```

Expect `{"url":"https://checkout.stripe.com/..."}` — open it and confirm
the item/price shown matches the catalog, then complete a test-mode
payment and confirm `stripe-webhook` grants the entitlement (see below).

## `stripe-webhook` — the tip jar AND the boutique store

Shared by both real-money flows: Stripe calls this directly (never the
app's own client) the moment a checkout completes, whether that's a
tip-jar Payment Link (`app/tip/page.tsx`) or a store Checkout Session
(`create-checkout-session` above). It verifies the request really came
from Stripe, then branches on whether `session.metadata.skus` is set (only
a store checkout ever sets it): a store purchase writes `purchases` (the
ORIGINAL requested skus, e.g. one `"bundle:card_back"` — this table is
exposed verbatim via the account data export) + `entitlements` (migrations
0085/0087 — the EXPANDED skus, via `src/store/entitlements.ts`'s
`expandPurchasedSkus`: a bundle sku grants its own sku plus every one of
its real member-item skus, since every unlock check in the app reads a
specific item sku, never a bundle wrapper sku — this is what actually lets
a bundle buyer equip what they paid for); anything else (every tip,
exactly as before) keeps writing `supporter_payments` (migration 0043) —
the ☕ Supporter badge is unaffected by this change. No Stripe SDK:
verifies the `Stripe-Signature` header directly with Deno's Web Crypto
(see the function's own doc for why).

Requires migration 0043 to have run first for the tip jar, and 0085/0087
for the store branch.

### Deploy

```bash
node scripts/bundle-checkout-catalog.mjs
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

The bundle step matters here too, not just for `create-checkout-session`
below — this function now imports `CATALOG_BUNDLES`/`expandPurchasedSkus`
from `./_engine/store/` (same copy-with-`.ts`-extensions bundling), so a
catalog change (a new bundle, a changed member list) needs a re-bundle +
redeploy of BOTH functions to take effect, not just `create-checkout-session`.

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
   `checkout.session.completed` only. This SAME endpoint now also carries
   store purchases — no second endpoint or subscription needed.
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

**`mp`** gained routes: `nudge` (badge + localised push, rate-limited), `friend_push` (push for a friend request just made via SQL), `resign_all` (used by `delete-account`) and `sweep` (cron only). It now also enforces the **turn clock** lazily on every `state`/`move` (a stalled player's first miss auto-plays a safe move, the second in a row forfeits; the stalled player's own read never triggers it) and pushes in each recipient's language, honouring their per-category switches, quiet hours and an hourly cap (`_shared/push.ts`). Redeploy with `node scripts/bundle-mp-engine.mjs && npx supabase functions deploy mp`.

Optional scheduled sweep (forfeits games nobody opens, 75% reminder, expires 7-day-old pending invites): set `CRON_SECRET` (same value as `daily-deal-reminder`) and run the `cron.schedule` block at the end of migration 0061 (needs your project ref + anon key; the secret goes in the `x-cron-secret` header). Without it everything still works lazily.

**`delete-account`** (new): `npx supabase functions deploy delete-account`. Re-verifies the password server-side, calls `mp/resign_all`, `delete_account_prepare()`, removes the avatar object, then `auth.admin.deleteUser`.

**`daily-deal-reminder`** now words each push in the recipient's saved language and skips accounts with streak reminders off / in quiet hours. Redeploy. **`contact`** accepts `type: "privacy"` (redeploy).

## Boutique store (migrations 0085–0088)

`create-checkout-session` (new, see its own section above) and
`stripe-webhook` (extended, not regressed — the tip jar keeps working
exactly as before) implement real-money cosmetic purchases. New tables
`entitlements`/`purchases` (0085), the `my_entitlements()` RPC (0086), and
`cosmetic_unlocked()`'s `boutique` requirement kind now checking
`entitlements` OR `is_creator` (0087, updating 0053). 0088 is the one-time
launch-fairness grandfather — every account already on the leaderboard when
it runs gets every launch-catalog sku for free; run it LAST, by hand, after
confirming the final catalog (see that migration file's own header for what
to edit first). See `app/lib/storeSku.ts` for the sku-naming convention and
`src/store/catalog.ts` for the price/name catalog `create-checkout-session`
bundles in.

Native (iOS/Android) IAP readiness: `entitlements.source` already
anticipates `'apple'`/`'google'` values — a future verify-receipt Edge
Function would insert the same shape of row after validating a receipt
server-side, and nothing else (the unlock check, `my_entitlements()`, the
client) would need to change. See CODEBASE_MAP.md's "Boutique store" /
"Native IAP path" note.
