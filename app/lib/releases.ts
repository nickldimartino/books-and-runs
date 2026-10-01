// The release history behind /releases and the notification bell's "release"
// items — every version shipped on Books & Runs, from launch day to today.
// Title/description are deliberately English-only (not routed through t()):
// same carve-out as AI persona names and cosmetic item names (AGENTS.md
// "Adding user-visible text", item 7) — patch notes stay English even in a
// fully localized app, the same way most translated software ships its
// changelog. The page CHROME around this data (headings, labels, the
// feature/fix badge text) is still fully translated — only the entries
// themselves are English. Because this file is plain data (not JSX), the
// hardcoded-text scanner never sees it either way.
//
// "fix" entries are deliberately generic — see AGENTS.md-adjacent policy
// agreed with the developer: anything that doesn't really pertain to the
// player (backend fixes, cost/pricing corrections, account-admin tooling)
// gets folded into a plain "Bug fixes and improvements" entry rather than
// itemized. "feature" entries get a real title + description.
//
// Ordered oldest-first (chronological). Moving forward: every release on
// this site gets a new entry appended to the end, with a version bumped
// from RELEASES[RELEASES.length - 1].version — minor for something a player
// would notice and care about, patch for a fix/internal change.
//
// This file went completely unmaintained for ~2 days and ~24 real shipped
// changes (2026-09-29 to 2026-10-01) before anyone noticed — see the dense
// run of entries right after "Release notes" below, all backfilled at
// once from git history once that was caught. CI now catches this going
// forward: scripts/check-release-notes.mjs (wired into the `check` job in
// .github/workflows/ci.yml) fails the build if a push/PR touches
// player-facing code (app/, src/, public/, supabase/migrations/,
// supabase/functions/) without also touching this file — add a real entry,
// or, for a change that genuinely isn't player-facing, a commit message
// line reading exactly `Release-note: none` instead.

export type ReleaseKind = "feature" | "fix";

export interface ReleaseEntry {
  /** major.minor.patch — judgment-based, not tied to commit count. */
  version: string;
  /** ISO yyyy-mm-dd. */
  date: string;
  kind: ReleaseKind;
  title: string;
  description: string;
}

const FIX_TITLE = "Bug fixes and improvements";

export const RELEASES: readonly ReleaseEntry[] = [
  { version: "0.1.0", date: "2026-08-10", kind: "feature", title: "Books & Runs launches", description: "Books & Runs is live — a free Contract Rummy card game you can play solo against AI opponents or pass-and-play with friends on one device." },
  { version: "0.2.0", date: "2026-08-10", kind: "feature", title: "Manual melding, drag-and-drop hands, and flexible rounds", description: "Choose exactly which cards go into each book and run yourself, drag your hand into any order you like, and pick how many rounds to play — all seven, a short game, or a custom set. Runs can now go ace-high or ace-low, and 3+ player games can buy the discard." },
  { version: "0.3.0", date: "2026-08-11", kind: "feature", title: "Achievements and account levels", description: "200 achievements across 40 families are now live, along with an open-ended level and XP system that grows with how you play. Both sync to your account when you're signed in." },
  { version: "0.4.0", date: "2026-08-11", kind: "feature", title: "5 selectable themes, a History page, and sound effects", description: "Restyle the whole game with 5 new color themes, learn where Contract Rummy came from on the new History page, and enjoy new sound effects during play. An in-person Scorecard page is also here for tracking a physical card game." },
  { version: "0.4.1", date: "2026-08-11", kind: "fix", title: FIX_TITLE, description: "General polish across the game screen and navigation, plus a rewritten rules guide covering everything added this week." },
  { version: "0.5.0", date: "2026-08-12", kind: "feature", title: "An interactive tutorial", description: "New to Contract Rummy? A guided, interactive tutorial now walks you through your first hand step by step, including wild cards and scoring." },
  { version: "0.6.0", date: "2026-08-12", kind: "feature", title: "Dual-purpose 2s and a smarter AI difficulty curve", description: "2s can now be played as either a wild or their natural rank, your choice. The 5 AI difficulty tiers were also reworked for a more realistic skill curve from Beginner through Expert." },
  { version: "0.6.1", date: "2026-08-12", kind: "fix", title: FIX_TITLE, description: "Assorted fixes to melding, lay-off hints, and the Scorecard page." },
  { version: "0.7.0", date: "2026-08-13", kind: "feature", title: "Offline play", description: "Books & Runs now works offline once installed — keep playing without a connection, with your stats and achievements syncing automatically the moment you're back online." },
  { version: "0.7.1", date: "2026-08-13", kind: "fix", title: FIX_TITLE, description: "Added a forgot-password flow and cleaned up sign-in. General navigation and layout fixes." },
  { version: "0.8.0", date: "2026-08-17", kind: "feature", title: "Turn reminders and a discard confirmation step", description: "A new \"whose turn is it?\" reminder button helps keep pass-and-play moving, and discarding now asks you to confirm before it ends your turn." },
  { version: "0.8.1", date: "2026-08-18", kind: "fix", title: FIX_TITLE, description: "Fixed a couple of small issues with achievement tracking and page navigation after a game ends." },
  { version: "0.9.0", date: "2026-08-19", kind: "feature", title: "5 more themes and a live hand score", description: "10 themes are now available with a more compact picker, and your hand's live score now shows as you play." },
  { version: "0.10.0", date: "2026-08-24", kind: "feature", title: "Choose what a wild represents when melding", description: "When melding a hand with wild cards, you can now choose what each wild stands for, not just when laying off. A few hand-sorting and layout papercuts were also fixed." },
  { version: "0.10.1", date: "2026-08-26", kind: "fix", title: FIX_TITLE, description: "Removed the offline/installable-app feature added a couple weeks ago — it was causing more problems than it solved." },
  { version: "0.11.0", date: "2026-08-27", kind: "feature", title: "Achievement tiers, tie games, and 10 more themes", description: "Achievements now show clear tiers, tied games are properly recorded instead of declaring a false winner, and the theme collection grows to 28 with new light and holiday options." },
  { version: "0.12.0", date: "2026-08-27", kind: "feature", title: "Home and Settings reorganized", description: "The home screen is now grouped into Play, Your progress, and More, and Settings gained collapsible \"what does this do?\" explanations for every toggle. The in-person tracker is renamed Scorekeeper." },
  { version: "0.13.0", date: "2026-08-27", kind: "feature", title: "Visual depth, motion, and accessibility", description: "Cards and panels now have real depth and shadow, small tactile feedback plays as you interact, and a new colorblind-friendly mode makes suits easier to tell apart. Haptic feedback was also added on iOS." },
  { version: "0.13.1", date: "2026-08-27", kind: "fix", title: FIX_TITLE, description: "Achievements are now grouped into 40 expandable families instead of one long list, and a variety of smaller display and sign-up issues were fixed." },
  { version: "0.14.0", date: "2026-08-28", kind: "feature", title: "A global leaderboard and Account page", description: "See how you stack up against every player on the new global leaderboard, and manage your display name, email, and password from a new Account page." },
  { version: "0.14.1", date: "2026-08-28", kind: "fix", title: FIX_TITLE, description: "Fixed a leaderboard scoring mismatch and a sync issue affecting games saved while offline." },
  { version: "0.15.0", date: "2026-08-30", kind: "feature", title: "Every theme gets its own card back, sortable leaderboard", description: "All 38 themes now have their own matching card-back design, and the leaderboard can be sorted by any stat, not just level." },
  { version: "0.15.1", date: "2026-08-30", kind: "fix", title: FIX_TITLE, description: "Smoother animations for dealing, winning, and undo, plus a handful of AI and visual fixes." },
  { version: "0.16.0", date: "2026-08-31", kind: "feature", title: "An expandable hand drawer", description: "On phones, your hand now lives in a pinned, expandable drawer with a fanned preview and a dedicated lay-off button, keeping the table visible while you plan your next move." },
  { version: "0.17.0", date: "2026-08-31", kind: "feature", title: "AI personas and the Daily Deal", description: "Opponents now have distinct personalities and power levels, and a new Daily Deal gives you one fresh hand a day to play. Theme and card-back pickers also moved to their own pages." },
  { version: "0.17.1", date: "2026-08-31", kind: "fix", title: FIX_TITLE, description: "Layout and header fixes in the round summary and settings." },
  { version: "0.18.0", date: "2026-09-01", kind: "feature", title: "Daily Deal sync and AI bios", description: "Your Daily Deal now syncs across every device you're signed into, opponents have short bios, and the hand drawer is now always on." },
  { version: "0.18.1", date: "2026-09-01", kind: "fix", title: FIX_TITLE, description: "Fixed sharing your results on iOS and a couple of layout issues on wide screens." },
  { version: "0.18.2", date: "2026-09-02", kind: "fix", title: FIX_TITLE, description: "Achievement unlocks are now easier to tap for details, and look the same whether they pop up mid-round or at game end." },
  { version: "0.19.0", date: "2026-09-10", kind: "feature", title: "A new look for Home, real card faces, and Profiles", description: "Home now greets you with a dealt-in card fan, playing cards have real printed faces, and a new Profile page gives your progress a home of its own. Results can now be shared as an image." },
  { version: "0.20.0", date: "2026-09-10", kind: "feature", title: "Friends and Multiplayer", description: "Add friends and play real-time multiplayer games against them, complete with its own stats, achievements, and social touches — the biggest addition to Books & Runs yet." },
  { version: "0.21.0", date: "2026-09-10", kind: "feature", title: "Security and reliability improvements", description: "A round of hardening closed several security gaps and added better error recovery and crash reporting behind the scenes, so games are more resilient to bad connections and edge cases." },
  { version: "0.21.1", date: "2026-09-10", kind: "fix", title: FIX_TITLE, description: "Accessibility, sound, and general polish across the game, multiplayer, and Settings." },
  { version: "0.22.0", date: "2026-09-11", kind: "feature", title: "Two-factor authentication", description: "You can now add two-factor authentication to your account for extra login security." },
  { version: "0.23.0", date: "2026-09-11", kind: "feature", title: "Push notifications and ambient music", description: "Get a push notification the moment it's your turn in a multiplayer game, and set the mood with new optional ambient music." },
  { version: "0.24.0", date: "2026-09-11", kind: "feature", title: "Support, data export, and account-wide settings sync", description: "A new Contact & support page makes it easy to reach us, you can export your own data anytime, and every appearance setting — theme, card back, card face, and more — now follows your account across devices." },
  { version: "0.25.0", date: "2026-09-11", kind: "feature", title: "A smarter AI", description: "AI opponents now play noticeably smarter on Medium through Expert — denying you the win when you're close to melding out, and managing wild cards more sensibly." },
  { version: "0.25.1", date: "2026-09-11", kind: "fix", title: FIX_TITLE, description: "A broad round of stability, accessibility, and display-name fixes across the game and multiplayer." },
  { version: "0.26.0", date: "2026-09-12", kind: "feature", title: "Public player profiles", description: "Every player now has a public profile with a unique name and avatar you can share and look up." },
  { version: "0.27.0", date: "2026-09-12", kind: "feature", title: "Profile cosmetics: frames, titles, banners, and a trophy case", description: "Personalize your profile with avatar frames, titles, banners, and a pinned trophy showcase, plus a head-to-head record against other players and a shareable profile card." },
  { version: "0.27.1", date: "2026-09-12", kind: "fix", title: FIX_TITLE, description: "Fixed a theme setting that could drift between devices and an account-switching issue on shared devices, plus general AI and cosmetics polish." },
  { version: "0.28.0", date: "2026-09-13", kind: "feature", title: "Server-verified stats", description: "Solo game results and Daily Deal streaks are now independently verified, so leaderboards and achievements stay fair for everyone." },
  { version: "0.29.0", date: "2026-09-13", kind: "feature", title: "Clubs and Tournaments", description: "Form a Club with friends and compete in round-robin Tournaments, complete with their own standings." },
  { version: "0.30.0", date: "2026-09-13", kind: "feature", title: "Weekly Challenge", description: "A new Weekly Challenge gives everyone a shared goal to chase, with streak reminders to help you keep it going." },
  { version: "0.30.1", date: "2026-09-13", kind: "feature", title: "More cosmetics: colors and a Rarity Vault", description: "Avatar colors and cosmetics got a lot more variety, topped off by a new Rarity Vault tier for the rarest items." },
  { version: "0.30.2", date: "2026-09-13", kind: "fix", title: FIX_TITLE, description: "Layout fixes on iOS, profile-editing polish, and a round of smaller cosmetics and multiplayer fixes." },
  { version: "0.30.3", date: "2026-09-14", kind: "fix", title: FIX_TITLE, description: "Home screen layout fixes and general polish." },
  { version: "0.31.0", date: "2026-09-15", kind: "feature", title: "A hint button, seasonal leaderboard, and a tip jar", description: "An auto-meld hint button can now suggest a move when you're stuck, a seasonal leaderboard resets each month alongside the all-time one, and there's now an optional one-time way to support the developer." },
  { version: "0.31.1", date: "2026-09-15", kind: "fix", title: FIX_TITLE, description: "Accessibility contrast fixes and a stats-tracking bug fix." },
  { version: "0.32.0", date: "2026-09-22", kind: "feature", title: "Multi-card lay-off and a text-size setting", description: "Lay off several cards onto the table in one move, and adjust text size across the app in a new accessibility setting." },
  { version: "0.32.1", date: "2026-09-22", kind: "fix", title: FIX_TITLE, description: "Multiplayer invite handling and a few navigation and copy fixes." },
  { version: "0.33.0", date: "2026-09-23", kind: "feature", title: "Cosmetic rarity and the first Boutique", description: "Cosmetic items now have a clear rarity system, and a first look at the Boutique store arrived behind the scenes." },
  { version: "0.33.1", date: "2026-09-23", kind: "feature", title: "Security hardening", description: "A dedicated security and cheat-prevention pass tightened up how multiplayer stats and game state are protected." },
  { version: "0.33.2", date: "2026-09-23", kind: "fix", title: FIX_TITLE, description: "A wide internal cleanup pass with a handful of small multiplayer and display fixes." },
  { version: "0.33.3", date: "2026-09-24", kind: "fix", title: FIX_TITLE, description: "Fixed multiplayer hand sorting resetting each turn and a mismatched achievement badge caption." },
  { version: "0.34.0", date: "2026-09-25", kind: "feature", title: "Books & Runs speaks 10 languages", description: "The entire site is now available in English, Chinese, Japanese, Korean, German, French, Spanish, Brazilian Portuguese, Russian, and Italian — pick your language from Settings." },
  { version: "0.35.0", date: "2026-09-25", kind: "feature", title: "Quests and streak shields", description: "Daily and weekly quests now reward XP, and a streak shield protects your Daily Deal streak the first time you miss a day." },
  { version: "0.36.0", date: "2026-09-25", kind: "feature", title: "A wider game layout and the notification bell", description: "The game board now makes better use of wide screens, and a new notification bell keeps you posted on your turn, invites, and friend requests." },
  { version: "0.36.1", date: "2026-09-25", kind: "feature", title: "Settings reorganized into tabs", description: "Settings is now organized into General, Display, Audio, Gameplay, and Accessibility tabs, each with its own reset." },
  { version: "0.36.2", date: "2026-09-25", kind: "fix", title: FIX_TITLE, description: "A broad round of multiplayer, profile, and translation fixes." },
  { version: "0.37.0", date: "2026-09-26", kind: "feature", title: "Home reorganized with persistent navigation", description: "The home screen was reorganized around your multiplayer games and quick links, with navigation that stays with you across the site." },
  { version: "0.37.1", date: "2026-09-26", kind: "fix", title: FIX_TITLE, description: "Fixed a brief name/avatar flicker between pages and a few navigation edge cases." },
  { version: "0.38.0", date: "2026-09-27", kind: "feature", title: "The Boutique store opens", description: "The Boutique is open for real — 105 cosmetic items across 7 categories: badges, avatar frames, titles, banners, avatar pictures, card faces, and card backs, all purchasable individually." },
  { version: "0.38.1", date: "2026-09-27", kind: "fix", title: FIX_TITLE, description: "A Boutique purchase-check fix affecting one profile-picture category." },
  { version: "0.39.0", date: "2026-09-28", kind: "feature", title: "Boutique pricing and a Bundles-first layout", description: "Every Boutique item is now a flat $0.99, bundles save 19–24% off buying items individually, and the store leads with bundles for easy browsing. A new top-bar entry point makes the Boutique easier to find." },
  { version: "0.39.1", date: "2026-09-28", kind: "fix", title: FIX_TITLE, description: "New custom artwork for several Boutique items that were sharing generic placeholders, plus multiplayer and Boutique display fixes." },
  { version: "0.40.0", date: "2026-09-29", kind: "feature", title: "Themes join the Boutique, plus an Everything Bundle", description: "30 more table themes are now purchasable in the Boutique (8 stay free forever), and a new Everything Bundle unlocks all 135 items at once." },
  { version: "0.40.1", date: "2026-09-29", kind: "fix", title: FIX_TITLE, description: "Fixed a bundle-purchase issue and a focus-highlight visual glitch." },
  { version: "0.41.0", date: "2026-09-29", kind: "feature", title: "Release notes", description: "You're looking at it — a running history of everything that's shipped on Books & Runs, back to day one. New releases will keep appearing here, and the newest ones will show up in your notification bell too." },
  { version: "0.41.1", date: "2026-09-29", kind: "fix", title: FIX_TITLE, description: "A dialog's focus ring no longer shows up after a mouse click or tap, only real keyboard navigation. Removed the redundant \"Books X of Y ready\" progress line from the game screen. Multiplayer moves now show a clear pending state instead of looking stuck while they're saving." },
  { version: "0.42.0", date: "2026-09-29", kind: "feature", title: "Windows High Contrast support", description: "The game now works correctly under Windows High Contrast and other forced-colors modes — the legal-move highlight and lay-off target ring used to disappear entirely, not just lose their color." },
  { version: "0.42.1", date: "2026-09-29", kind: "feature", title: "Controller rumble", description: "A connected controller now rumbles for the same moments mobile haptics already cover, on browsers and controllers that support it." },
  { version: "0.43.0", date: "2026-09-29", kind: "feature", title: "Pick your name and avatar when you sign up", description: "Signing up now asks for a display name and avatar up front, instead of leaving you with a generic default until you happen to visit your profile." },
  { version: "0.44.0", date: "2026-09-29", kind: "feature", title: "A Boutique wishlist", description: "Star an item in the Boutique to save it for later — a new Wishlist tab collects everything you've starred." },
  { version: "0.45.0", date: "2026-09-29", kind: "feature", title: "A reward for referring a friend", description: "Adding a friend now pays off — both of you get a free Boutique badge the first time a friend request between you is accepted." },
  { version: "0.46.0", date: "2026-09-29", kind: "feature", title: "A weekly goal for your Club", description: "Clubs now have a shared weekly goal — 20 multiplayer games played by anyone in the club — tracked with a progress bar on the club page." },
  { version: "0.47.0", date: "2026-09-29", kind: "feature", title: "A site-wide Community Milestone", description: "A new Community Milestone gives every player the same goal to chase together. Reach it, and everyone gets a free Boutique badge." },
  { version: "0.48.0", date: "2026-09-30", kind: "feature", title: "Marathon mode", description: "A new Marathon mode cycles through all 7 contracts four times in a row — 28 rounds — for anyone who just wants to keep playing." },
  { version: "0.49.0", date: "2026-09-30", kind: "feature", title: "Daily Deal twists", description: "About one day in five, the Daily Deal now comes with a twist — a tougher AI, a full table, or just one opponent — shown as a badge on Home." },
  { version: "0.50.0", date: "2026-09-30", kind: "feature", title: "A skill rating for multiplayer", description: "Multiplayer games against real people now earn you a skill rating, separate from your level. Sort the leaderboard by Rating to see where you stand." },
  { version: "0.51.0", date: "2026-09-30", kind: "feature", title: "Matchmaking", description: "Can't find a friend to play right now? A new matchmaking queue pairs you with another player looking for a game." },
  { version: "0.52.0", date: "2026-09-30", kind: "feature", title: "Gift Boutique items to a friend", description: "Boutique items can now be gifted — buy something for a friend instead of yourself, from the same 🎁 button on each item." },
  { version: "0.52.1", date: "2026-09-30", kind: "fix", title: FIX_TITLE, description: "A round of screen-reader fixes across solo, pass-and-play, and multiplayer: round transitions and game-over now announce themselves properly, whose-turn labeling was corrected, and the discard pile and table melds are now fully described." },
  { version: "0.53.0", date: "2026-09-30", kind: "feature", title: "\"Your Recap\"", description: "A new Your Recap screen adds up everything you've done — games played, win rate, achievements, multiplayer record, a few fun facts, and more — from the Progress hub." },
  { version: "0.53.1", date: "2026-09-30", kind: "fix", title: FIX_TITLE, description: "Fixed a club, tournament, or profile page not updating when you navigated straight from one to another without a full reload, and a back-button loop on a couple of pages." },
  { version: "0.54.0", date: "2026-09-30", kind: "feature", title: "A faster Skip button, and fairer goal rewards", description: "The Skip button between turns now skips straight to your next turn instead of needing one tap per AI opponent. Also, the friend-referral and community-milestone rewards above now pay XP instead of a free Boutique item, so Boutique items stay something you always choose and never just receive." },
  { version: "0.55.0", date: "2026-09-30", kind: "feature", title: "Automated holiday theming", description: "The site now dresses itself up for 9 US holidays — Valentine's Day through New Year's — defaulting everyone to that holiday's theme for the week before and after, with small seasonal touches around the edges. Pick a different theme anytime; it'll stick for the rest of that holiday's week." },
  { version: "0.55.1", date: "2026-09-30", kind: "fix", title: FIX_TITLE, description: "Your Multiplayer stats now also show your skill rating. Fixed a card that could silently fail to select if you held it down slightly longer than a quick tap, and a sign-in page heading that didn't update when you switched to Create Account or Forgot Password." },
];

/** Releases dated/versioned at or after this one show up as bell
 * notifications. Everything before it is history-only — visible on
 * /releases, never surfaced as a fresh "unread" item — so shipping this
 * feature doesn't dump 40+ stale notifications on every existing player. */
export const RELEASE_NOTIFICATIONS_SINCE = "0.41.0";

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function releasesNewestFirst(): ReleaseEntry[] {
  return [...RELEASES].reverse();
}

export function latestRelease(): ReleaseEntry {
  return RELEASES[RELEASES.length - 1];
}

/** Releases eligible to appear as bell notifications (newest first), capped
 * to the most recent `limit` — otherwise the list would grow forever as
 * every future release keeps landing at/after RELEASE_NOTIFICATIONS_SINCE.
 * Matches how a game's own "recent updates" panel behaves: a bounded,
 * rolling window, not an ever-growing unread pile. */
export function notifiableReleases(limit = 5): ReleaseEntry[] {
  return RELEASES.filter((r) => compareVersions(r.version, RELEASE_NOTIFICATIONS_SINCE) >= 0)
    .reverse()
    .slice(0, limit);
}
