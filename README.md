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
  Game over, Sign in, Stats, Settings, Privacy Policy, and Terms of Service
  screens
  - `GameContext.tsx` wires the screens above to the engine, and persists
    the in-progress game to `localStorage` so Home's "Continue" button can
    resume it (survives a full reload — see `lib/localSave.ts`)
  - `AuthContext.tsx` wraps Supabase Auth (email/password, Google, Apple),
    including the native-vs-web OAuth branching Capacitor needs
  - `lib/supabaseClient.ts` — degrades gracefully to a "not configured"
    state when no Supabase project is connected, so local play always works
  - `lib/recordGameResult.ts` — writes stats/history to Supabase when a
    signed-in user finishes a game
  - `lib/settingsStore.ts` — house-rule preferences (wild-card limit,
    default AI difficulty, sound), saved to `localStorage` always and
    synced to Supabase's `settings` table when signed in
- `supabase/migrations/0001_init.sql` — the `player_stats`, `game_history`,
  and `settings` tables, with row-level security so each user can only ever
  read/write their own rows
- `supabase/migrations/0002_achievements.sql` — the `achievement_counters`
  table backing the Achievements page (`src/achievements.ts` defines the 200
  achievements — 40 families × 5 tiers — as a pure function of these counters
  plus `player_stats`; `app/GameContext.tsx` increments counters only for the
  signed-in seat, `human-0`, and flushes them to Supabase once at game-over)
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
npm run build     # production build (static export, see next.config.ts)
```

Local pass-and-play and AI opponents work with zero setup — no Supabase
project or iOS toolchain required. Auth/stats and the iOS build are optional
layers on top; see the checklists below to turn them on.

## What's verified

- **48 Vitest unit tests, all passing** — deck construction/shuffle/deal,
  book/run solving including wild substitution and insufficient-hand
  rejection, lay-off validity, scoring, the full turn lifecycle
  (draw/meld/lay-off/discard), Round 7's no-discard-on-out rule, game-over
  winner selection, round advancement, and the contract-aware discard fix
  (regression coverage so it can't silently regress).
- The CLI demo completes full 7-round, 5-AI games in ~350 turns (under 0.1s).
- The Next.js UI has been manually exercised end to end in a browser,
  including: Home → New Game setup → pass-and-play gate → draw/meld/discard
  → AI auto-play; a 3-player game (2 humans + 1 AI) confirming pass-and-play
  correctly rotates between multiple human seats, not just human-then-AI;
  laying a card off onto an existing meld (own and AI's); and Continue —
  reloading mid-turn and confirming the exact hand, draw pile count, and
  drawn-this-turn state come back intact. No console/hydration errors in
  any of it.
- `npm run build` passes cleanly both with and without Supabase env vars set
  (the unconfigured state was specifically tested — Sign in and Stats show a
  friendly "not set up yet" message instead of crashing).
- The Capacitor iOS project was generated and synced successfully
  (`npx cap add ios`, `npx cap sync ios`) with the static export bundled in.
- **Verified in the iOS Simulator** (iPhone 17, iOS 26.5): built via
  `xcodebuild`, launched, and played a full turn end to end through real
  touch input — Home → New Game setup → pass-and-play gate → game board →
  draw → select → discard → AI opponent auto-played its turn → pass gate
  reappeared for the next human turn. Safe-area padding rendered correctly
  under the notch/status bar, and the custom app icon renders correctly on
  the springboard. This confirms the native shell, not just the browser
  build, actually works.
- **Not manually verified**: playing an entire 7-round game to completion
  through the UI (only through the CLI demo and unit tests) — a melded
  hand only shrinks via lay-offs, so reaching round-end/game-over by
  clicking through the browser would take many dozens of turns for
  marginal extra confidence over what's already covered above.
- The Settings screen was exercised live: changing the default AI
  difficulty and saving persists it to `localStorage`, and the New Game
  screen picks that value up as the starting difficulty for newly-added AI
  opponents. Privacy Policy and Terms pages render correctly and
  cross-link to each other.

## Turning on accounts + stats (Phase 5)

The app runs fine without this — it only unlocks Sign in and Stats.

1. Create a project at [supabase.com](https://supabase.com).
2. In the Supabase SQL editor, run `supabase/migrations/0001_init.sql`, then
   `0002_achievements.sql` (the latter also unlocks the Achievements page).
3. In **Authentication → Providers**, enable Email, and optionally Google
   and Apple (each needs its own OAuth credentials from Google
   Cloud Console / the Apple Developer portal — entered into Supabase's
   provider settings, not into this codebase).
4. Copy `.env.local.example` to `.env.local` and fill in your project's URL
   and anon key from **Project Settings → API**.
5. `npm run dev` — Sign in and Stats now work.

For the OAuth redirect URLs, add both of these in Supabase's **URL
Configuration**:
- `http://localhost:3000/` (and your real web domain once deployed)
- `com.booksandruns.app://auth-callback` (for the iOS app)

## Running the iOS app (Phase 6)

The native project is already generated, synced, and confirmed working in
the Simulator (see above). To run it yourself:

```bash
npm run ios:sync   # rebuilds the web app and re-syncs ios/
npm run ios:open   # opens the project in Xcode
```

Pick a Simulator in Xcode and hit Run. A few things need your Apple account
and can't be done for you:

1. For a real device or App Store submission: you'll need an Apple Developer
   Program membership ($99/year) to set up signing and provisioning in
   Xcode, and to change `com.booksandruns.app` in `capacitor.config.json`
   (and `ios/App/App/Info.plist`'s `CFBundleURLTypes`) to a bundle ID
   registered under your account.
2. If you enable Google/Apple sign-in for the iOS build specifically: Google
   OAuth apps require you to register `com.booksandruns.app` as an iOS
   client, and Apple's "Sign in with Apple" requires enabling the capability
   in Xcode's Signing & Capabilities tab.

One nuance worth knowing: Google and Apple both block OAuth from completing
inside an embedded webview, so on native the sign-in buttons open the
system browser (`@capacitor/browser`) instead of redirecting in place, then
bounce back into the app via the `com.booksandruns.app://auth-callback`
custom URL scheme registered in `Info.plist`. That handoff is implemented in
`AuthContext.tsx`; the game-board flow was verified live in Simulator, but
the OAuth deep-link round trip specifically hasn't been (it needs a real
Supabase project with providers configured — see Phase 5 above).

## Fixed: contract-aware discards

`deadCards()` (`src/ai/strategy.ts`) previously judged a card "dead" purely
by duplicate-rank count in hand — it had no concept of runs at all, so on
run-heavy rounds (3, 5, 7) AIs would routinely discard the only card
building toward a run they badly needed. It's now scoped to
`CONTRACTS[state.round - 1]`: it only checks book candidates when the round
needs books, only checks run candidates (reusing `bookCandidates` /
`runCandidates` from `src/meld.ts`) when the round needs runs, and only
treats a candidate's cards as "live" if it's completable with the wilds
currently in hand.

## Before you submit to the App Store

`app/privacy/page.tsx` and `app/terms/page.tsx` both have a placeholder
`[your contact email here]` — Apple and Google both expect a working
contact route in these documents, so replace that with a real address (or
support page URL) before pointing App Store Connect or a Google OAuth
consent screen at these pages. Everything else in them is accurate to what
the app actually does today; update the "what we collect" section if you
add anything new later.

## Known gaps

- Stats are tracked for the device owner only (the first human player seat,
  "You") — other pass-and-play participants at the table aren't assumed to
  have their own accounts.
- The OAuth deep-link round trip (native Google/Apple sign-in bouncing back
  into the app) is implemented but unverified — it needs a real Supabase
  project with providers configured, which needs your accounts.
- Settings' wild-card limit and sound toggle are saved (and synced to your
  account when signed in) but not yet enforced/used anywhere in gameplay —
  the game engine doesn't check the limit when melding, and there are no
  sound effects in the app yet. The Settings screen says as much rather
  than implying they work. Default AI difficulty is the one setting that's
  actually wired in (New Game picks it up automatically).
