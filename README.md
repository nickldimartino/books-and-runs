# Books & Runs

A local pass-and-play card game with five tiers of AI opponents, accounts,
and stats — built on a framework-agnostic TypeScript rules engine, a
Next.js UI, Supabase for auth/stats, and a Capacitor iOS wrapper. Based on
the house rules reference doc and the project design doc's phased roadmap.
All six phases of that roadmap are now built.

## What's here

- `src/types.ts` — card, player, meld, and contract types; the 7-round
  contract table; penalty point values
- `src/deck.ts` — deck construction (scales decks to player count), shuffle, deal
- `src/meld.ts` — book/run detection and validation, including wild-card
  substitution and a backtracking solver that finds a full contract from a
  hand if one exists
- `src/scorer.ts` — penalty scoring per the house rules table
- `src/gameEngine.ts` — turn structure: draw, meld, lay off, discard, round
  advancement, Round 7's no-discard-on-out rule, final scoring
- `src/ai/` — the five difficulty tiers (`beginner.ts` through `expert.ts`),
  a shared strategy interface, and an orchestrator (`index.ts`) that plays a
  full AI turn
- `src/demo.ts` — runs a complete 7-round game between one AI of each
  difficulty and prints the results, proving the engine works end to end
- `app/` — the Next.js UI: Home, New Game setup, Game board (with a
  pass-and-play "pass the device" gate between human turns), Round summary,
  Game over, Sign in, Stats, Achievements, Settings, How to Play, History,
  In-Person Scorecard, Privacy Policy, and Terms of Service screens
  - `scorecard/page.tsx` — a standalone scoring grid for the physical card
    game, independent of the digital rules engine and Supabase entirely:
    unlimited named players, the same round-selection options as New Game,
    and a live per-round/total grid, persisted to its own `localStorage` key
    (`lib/scorecardStore.ts`) so an in-progress paper-replacement scorecard
    survives a reload
  - `GameContext.tsx` wires the screens above to the engine, and persists
    the in-progress game to `localStorage` so Home's "Continue" button can
    resume it (survives a full reload — see `lib/localSave.ts`)
  - `AuthContext.tsx` wraps Supabase Auth (email/password, Google), including
    the native-vs-web OAuth branching Capacitor needs
  - `lib/supabaseClient.ts` — degrades gracefully to a "not configured"
    state when no Supabase project is connected, so local play always works
  - `lib/recordGameResult.ts` — writes stats/history to Supabase when a
    signed-in user finishes a game
  - `lib/settingsStore.ts` — default AI difficulty (synced to Supabase's
    `settings` table when signed in) and sound-effects on/off (local-only,
    like theme), both saved to `localStorage`
  - `lib/sound.ts` — short sound effects for draw/discard/lay-off (a tap),
    sort/drag-reorder (a slide), meld (a tap plus a soft thump), and round/
    game wins (rising chimes), all synthesized on the fly with the Web Audio
    API — no audio files, so nothing to license or fetch. Wired into
    `GameContext.tsx`'s action handlers and `game/page.tsx`'s round/game-over
    transitions
- `supabase/migrations/0001_init.sql` — the `player_stats`, `game_history`,
  and `settings` tables, with row-level security so each user can only ever
  read/write their own rows
- `supabase/migrations/0002_achievements.sql` — the `achievement_counters`
  table backing the Achievements page (`src/achievements.ts` defines the 200
  achievements — 40 families × 5 tiers — as a pure function of these counters
  plus `player_stats`; `app/GameContext.tsx` increments counters only for the
  signed-in seat, `human-0`, and flushes them to Supabase once at game-over)
- `supabase/migrations/0003_worst_score.sql` — adds `worst_score` to
  `player_stats` (highest single-game score, alongside the existing
  `best_score`)
- `src/leveling.ts` — account level/XP, needing no schema of its own: it's a
  pure function of the same `player_stats`/`achievement_counters` data
  achievements already use (finishing/winning games, wins by AI difficulty,
  achievement tiers unlocked). `app/PlayerLevelContext.tsx` fetches it once
  in the root layout so Home and the game screen both show the current level
  without independent fetches; `GameOverScreen` diffs before/after XP to
  show what a finished game earned.
- `ios/` — the native Xcode project Capacitor generates to wrap the static
  export; `capacitor.config.json` points it at `out/`. Ships with a custom
  app icon and launch screen (green felt + a two-card mark) instead of
  Capacitor's placeholder — see `ios/App/App/Assets.xcassets/`
- `src/**/*.test.ts` — Vitest unit tests for the engine (deck, meld/run
  solving, scoring, full turn/round/game-over flow, and the contract-aware
  discard fix below); `src/testHelpers.ts` has shared card/state builders

## Running it

```bash
npm install
npm run dev     # Next.js UI at http://localhost:3000
npm run demo     # headless CLI demo: 5 AIs play a full game, prints results
npm run test     # Vitest unit test suite (engine + AI)
npm run lint     # ESLint (React hooks rules + Next.js checks)
npm run build     # production build (static export, see next.config.ts)
```

`npm run lint` parses `.ts`/`.tsx` with Babel rather than `typescript-eslint`, since
`typescript-eslint` doesn't yet support this project's TypeScript 7 (preview) —
see the comment in `eslint.config.mjs`. That means lint is syntax-only, no
type-aware rules; `npm run test`/`tsc --noEmit` remain the source of truth for
type correctness.

Local pass-and-play and AI opponents work with zero setup — no Supabase
project or iOS toolchain required. Auth/stats and the iOS build are optional
layers on top; see the checklists below to turn them on.

## What's verified

- **140 Vitest unit tests, all passing** (`src/**/*.test.ts`) — deck
  construction/shuffle/deal, book/run solving (including wild substitution
  and insufficient-hand rejection), lay-off validity, scoring, the full
  turn lifecycle (draw/meld/lay-off/discard), Round 7's no-discard-on-out
  rule, game-over winner selection, round advancement, achievements, and
  leveling.
- `npm run lint`, `tsc --noEmit`, and `npm run build` all pass clean, both
  with and without Supabase env vars set (the unconfigured state shows a
  friendly "not set up yet" message on Sign in/Stats instead of crashing).
- Manually exercised end to end in a browser: full pass-and-play turn
  cycles (including 2+ human seats, not just human-then-AI), laying off
  onto existing melds, and Continue (reloading mid-turn and confirming
  hand/draw-pile/drawn-this-turn state comes back intact). No
  console/hydration errors.
- **Verified in the iOS Simulator**: built via `xcodebuild`, launched, and
  played through real touch input — pass-and-play gate, draw/discard, AI
  auto-play, safe-area padding under the notch, and the custom app icon on
  the springboard all confirmed working. This is the native shell, not
  just the browser build.
- **Not manually verified**: playing an entire 7-round game to completion
  through the UI (only via the CLI demo and unit tests) — a melded hand
  only shrinks via lay-offs, so reaching game-over by clicking through the
  browser would take many dozens of turns for marginal extra confidence.

## Turning on accounts + stats

The app runs fine without this — it only unlocks Sign in and Stats.

1. Create a project at [supabase.com](https://supabase.com).
2. In the Supabase SQL editor, run `supabase/migrations/0001_init.sql`, then
   `0002_achievements.sql` (unlocks the Achievements page), then
   `0003_worst_score.sql`.
3. In **Authentication → Providers**, enable Email, and optionally Google
   (needs its own OAuth credentials from Google Cloud Console — entered into
   Supabase's provider settings, not into this codebase).
4. Copy `.env.local.example` to `.env.local` and fill in your project's URL
   and anon key from **Project Settings → API**.
5. `npm run dev` — Sign in and Stats now work.

For the OAuth redirect URLs, add both of these in Supabase's **URL
Configuration**:
- `http://localhost:3000/` (and your real web domain once deployed)
- `com.booksandruns.app://auth-callback` (for the iOS app)

## Running the iOS app

Not currently pursued for App Store distribution, but the native project
builds and runs fine locally for testing. To run it yourself:

```bash
npm run ios:sync   # rebuilds the web app and re-syncs ios/
npm run ios:open   # opens the project in Xcode
```

Pick a Simulator in Xcode and hit Run. A few things need your Apple account
and can't be done for you:

1. For a real device: you'll need an Apple ID signed into Xcode to set up
   signing and provisioning, and to change `com.booksandruns.app` in
   `capacitor.config.json` (and `ios/App/App/Info.plist`'s
   `CFBundleURLTypes`) to a bundle ID registered under your account. An App
   Store submission would additionally need a paid Apple Developer Program
   membership ($99/year) — not currently pursued.
2. If you enable Google sign-in for the iOS build specifically: Google OAuth
   apps require you to register `com.booksandruns.app` as an iOS client.

One nuance worth knowing: Google blocks OAuth from completing inside an
embedded webview, so on native the sign-in button opens the system browser
(`@capacitor/browser`) instead of redirecting in place, then bounces back
into the app via the `com.booksandruns.app://auth-callback` custom URL
scheme registered in `Info.plist`. That handoff is implemented in
`AuthContext.tsx`; the game-board flow was verified live in Simulator, but
the OAuth deep-link round trip specifically hasn't been (it needs a real
Supabase project with providers configured — see "Turning on accounts +
stats" above).

## Contract-aware AI discards

`deadCards()` (`src/ai/strategy.ts`) previously judged a card "dead" purely
by duplicate-rank count in hand — it had no concept of runs at all, so on
run-heavy rounds (3, 5, 7) AIs would routinely discard the only card
building toward a run they badly needed. It's now scoped to
`CONTRACTS[state.round - 1]`: it only checks book candidates when the round
needs books, only checks run candidates (reusing `bookCandidates` /
`runCandidates` from `src/meld.ts`) when the round needs runs, and only
treats a candidate's cards as "live" if it's completable with the wilds
currently in hand.

## Known gaps

- Stats are tracked for the device owner only (the first human player seat,
  "You") — other pass-and-play participants at the table aren't assumed to
  have their own accounts.
- The OAuth deep-link round trip (native Google sign-in bouncing back into
  the app) is implemented but unverified — it needs a real Supabase project
  with providers configured, which needs your accounts.
