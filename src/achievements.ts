// Achievement definitions and the pure logic for turning raw progress data
// into unlocked/locked achievement instances. Deliberately has zero
// dependency on Supabase or React — it's a pure function of whatever
// progress data the caller loaded, so it's easy to unit test and reuse
// between the Achievements page and anywhere else that might want it.
//
// Every achievement belongs to a "family" (e.g. "books melded") with 5
// tiers reusing the same beginner→expert language already used for AI
// difficulty elsewhere in the app. A family's *value* comes from one of:
//   - a counter tracked incrementally during play (see GameContext.tsx),
//     only ever incremented for the signed-in seat ("human-0" — see
//     recordGameResult.ts for why that's the convention this app uses for
//     "which seat is actually you" in pass-and-play), or
//   - existing account-level stats (games played/won, best score, wins by
//     AI difficulty faced) that player_stats already tracks.
// Unlock state is always just "current value crosses the tier's
// threshold" — there's no separate "unlocked" flag to persist or desync.

export type AchievementTier = "beginner" | "easy" | "medium" | "hard" | "expert";

export const ACHIEVEMENT_TIERS: AchievementTier[] = ["beginner", "easy", "medium", "hard", "expert"];

/** 1-5 (beginner=1 .. expert=5) — every family defines all 5 tiers, so a
 * bare family title alone (e.g. in a short game-over summary line) can't
 * tell you which one just unlocked without this. */
export function tierNumber(tier: AchievementTier): number {
  return ACHIEVEMENT_TIERS.indexOf(tier) + 1;
}

type AchievementSource =
  | { kind: "counter"; key: string }
  | { kind: "gamesPlayed" }
  | { kind: "gamesWon" }
  | { kind: "bestScore" } // lower is better; null until a game's been recorded
  | { kind: "winRate" } // gamesWon / gamesPlayed, gated by a minimum sample size
  | { kind: "winsByDifficulty"; difficulty: string }
  // Multiplayer, from mp_my_stats() — see app/lib/mpStore.ts. MP games also
  // feed gamesPlayed / gamesWon / winsByDifficulty above; these are the
  // "vs. real people only" cut.
  | { kind: "mpGamesPlayed" }
  | { kind: "mpGamesWon" }
  | { kind: "mpBestWinStreak" }
  | { kind: "mpWinRate" };

// One of 8 broad groupings, matching the section comments below — used only
// to pick which of the 8 hand-drawn icons (see AchievementIcon in
// app/components/AchievementIcons.tsx) a family's achievements show. Kept
// coarser than one icon per family (40 families) deliberately: distinct
// bespoke art for every family would be a much bigger asset-design effort
// than 8 categories reused within each, for the same practical benefit —
// scanning the Achievements list quickly by kind of accomplishment.
export type AchievementCategory =
  | "accountStats"
  | "aiRivals"
  | "melding"
  | "layingOff"
  | "drawDiscard"
  | "goingOut"
  | "contracts"
  | "tableComposition"
  | "multiplayer";

interface AchievementFamily {
  id: string;
  /** A translation key (app/lib/i18n/dictionaries/en.ts's "achievementFamily.*"
   * namespace) rather than literal text — this file stays free of any
   * framework/UI dependency (see the top-of-file note), so it deals only in
   * key strings; the app layer resolves them with its own t() at render
   * time (cast `as TranslationKey` there). */
  titleKey: string;
  /** Key for how progress reads, e.g. "{value} / {threshold} books melded". */
  unitKey: string;
  source: AchievementSource;
  thresholds: Record<AchievementTier, number>;
  /** True for families where a *lower* value is the achievement (best score). */
  lowerIsBetter?: boolean;
  category: AchievementCategory;
}

/** Everything needed to evaluate every family's current value. */
export interface AchievementProgressState {
  counters: Record<string, number>;
  gamesPlayed: number;
  gamesWon: number;
  bestScore: number | null;
  winsByDifficulty: Record<string, number>;
  mpGamesPlayed: number;
  mpGamesWon: number;
  mpBestWinStreak: number;
}

export const EMPTY_PROGRESS_STATE: AchievementProgressState = {
  counters: {},
  gamesPlayed: 0,
  gamesWon: 0,
  bestScore: null,
  winsByDifficulty: {},
  mpGamesPlayed: 0,
  mpGamesWon: 0,
  mpBestWinStreak: 0,
};

// A win-rate achievement with only 1-2 games played is meaningless (100%
// off a single lucky game) — require a minimum sample before it counts.
// Exported so anything else showing a win-rate stat (e.g. the leaderboard)
// can apply the exact same "too small a sample to mean anything" floor
// instead of picking its own number.
export const WIN_RATE_MIN_GAMES = 10;

// Multiplayer games are rarer than solo ones, so the "enough of a sample to
// mean something" floor for the MP win-rate family is lower.
export const MP_WIN_RATE_MIN_GAMES = 6;

// Unlike a counter that climbs gradually, "best score" is a personal record
// that can hit its theoretical floor (0) in a single short or lucky game —
// without a floor on games played, a brand-new account could unlock every
// Sharpshooter tier, including Expert, off game #1. This doesn't make the
// tiers unlock gradually (a personal best is still an all-at-once thing),
// but it at least means it takes a few real games before it can happen.
const BEST_SCORE_MIN_GAMES = 5;

function tierThresholds(values: [number, number, number, number, number]): Record<AchievementTier, number> {
  const [beginner, easy, medium, hard, expert] = values;
  return { beginner, easy, medium, hard, expert };
}

export const ACHIEVEMENT_FAMILIES: AchievementFamily[] = [
  // --- Derived from account-level stats already tracked in player_stats ---
  {
    id: "games_played",
    category: "accountStats",
    titleKey: "achievementFamily.gamesPlayed.title",
    unitKey: "achievementFamily.gamesPlayed.unit",
    source: { kind: "gamesPlayed" },
    thresholds: tierThresholds([10, 50, 150, 400, 1000]),
  },
  {
    id: "games_won",
    category: "accountStats",
    titleKey: "achievementFamily.gamesWon.title",
    unitKey: "achievementFamily.gamesWon.unit",
    source: { kind: "gamesWon" },
    thresholds: tierThresholds([5, 15, 35, 65, 100]),
  },
  {
    id: "best_score",
    category: "accountStats",
    titleKey: "achievementFamily.bestScore.title",
    unitKey: "achievementFamily.bestScore.unit",
    source: { kind: "bestScore" },
    lowerIsBetter: true,
    thresholds: tierThresholds([70, 50, 30, 15, 0]),
  },
  {
    id: "win_rate",
    category: "accountStats",
    titleKey: "achievementFamily.winRate.title",
    unitKey: "achievementFamily.winRate.unit",
    source: { kind: "winRate" },
    thresholds: tierThresholds([10, 25, 40, 60, 80]),
  },

  // --- Multiplayer (vs. real people), from mp_my_stats() ---
  {
    id: "mp_games_played",
    category: "multiplayer",
    titleKey: "achievementFamily.mpGamesPlayed.title",
    unitKey: "achievementFamily.mpGamesPlayed.unit",
    source: { kind: "mpGamesPlayed" },
    thresholds: tierThresholds([1, 5, 15, 30, 60]),
  },
  {
    id: "mp_games_won",
    category: "multiplayer",
    titleKey: "achievementFamily.mpGamesWon.title",
    unitKey: "achievementFamily.mpGamesWon.unit",
    source: { kind: "mpGamesWon" },
    thresholds: tierThresholds([1, 3, 10, 25, 50]),
  },
  {
    id: "mp_win_streak",
    category: "multiplayer",
    titleKey: "achievementFamily.mpWinStreak.title",
    unitKey: "achievementFamily.mpWinStreak.unit",
    source: { kind: "mpBestWinStreak" },
    thresholds: tierThresholds([2, 3, 5, 8, 12]),
  },
  {
    id: "mp_win_rate",
    category: "multiplayer",
    titleKey: "achievementFamily.mpWinRate.title",
    unitKey: "achievementFamily.mpWinRate.unit",
    source: { kind: "mpWinRate" },
    thresholds: tierThresholds([20, 35, 50, 65, 80]),
  },

  // --- One per AI difficulty, from wins_by_difficulty ---
  {
    id: "wins_vs_beginner",
    category: "aiRivals",
    titleKey: "achievementFamily.winsVsBeginner.title",
    unitKey: "achievementFamily.winsVsBeginner.unit",
    source: { kind: "winsByDifficulty", difficulty: "beginner" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "wins_vs_easy",
    category: "aiRivals",
    titleKey: "achievementFamily.winsVsEasy.title",
    unitKey: "achievementFamily.winsVsEasy.unit",
    source: { kind: "winsByDifficulty", difficulty: "easy" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "wins_vs_medium",
    category: "aiRivals",
    titleKey: "achievementFamily.winsVsMedium.title",
    unitKey: "achievementFamily.winsVsMedium.unit",
    source: { kind: "winsByDifficulty", difficulty: "medium" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "wins_vs_hard",
    category: "aiRivals",
    titleKey: "achievementFamily.winsVsHard.title",
    unitKey: "achievementFamily.winsVsHard.unit",
    source: { kind: "winsByDifficulty", difficulty: "hard" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "wins_vs_expert",
    category: "aiRivals",
    titleKey: "achievementFamily.winsVsExpert.title",
    unitKey: "achievementFamily.winsVsExpert.unit",
    source: { kind: "winsByDifficulty", difficulty: "expert" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },

  // --- Melding ---
  {
    id: "books_melded",
    category: "melding",
    titleKey: "achievementFamily.booksMelded.title",
    unitKey: "achievementFamily.booksMelded.unit",
    source: { kind: "counter", key: "books_melded" },
    thresholds: tierThresholds([5, 25, 75, 300, 1000]),
  },
  {
    id: "runs_melded",
    category: "melding",
    titleKey: "achievementFamily.runsMelded.title",
    unitKey: "achievementFamily.runsMelded.unit",
    source: { kind: "counter", key: "runs_melded" },
    thresholds: tierThresholds([5, 25, 75, 300, 1000]),
  },
  {
    id: "oversized_books_melded",
    category: "melding",
    titleKey: "achievementFamily.oversizedBooksMelded.title",
    unitKey: "achievementFamily.oversizedBooksMelded.unit",
    source: { kind: "counter", key: "oversized_books_melded" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "oversized_runs_melded",
    category: "melding",
    titleKey: "achievementFamily.oversizedRunsMelded.title",
    unitKey: "achievementFamily.oversizedRunsMelded.unit",
    source: { kind: "counter", key: "oversized_runs_melded" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "wilds_used_in_melds",
    category: "melding",
    titleKey: "achievementFamily.wildsUsedInMelds.title",
    unitKey: "achievementFamily.wildsUsedInMelds.unit",
    source: { kind: "counter", key: "wilds_used_in_melds" },
    thresholds: tierThresholds([5, 25, 75, 200, 500]),
  },
  {
    id: "melds_with_zero_wilds",
    category: "melding",
    titleKey: "achievementFamily.meldsWithZeroWilds.title",
    unitKey: "achievementFamily.meldsWithZeroWilds.unit",
    source: { kind: "counter", key: "melds_with_zero_wilds" },
    thresholds: tierThresholds([5, 25, 75, 200, 500]),
  },

  // --- Laying off ---
  {
    id: "cards_laid_off",
    category: "layingOff",
    titleKey: "achievementFamily.cardsLaidOff.title",
    unitKey: "achievementFamily.cardsLaidOff.unit",
    source: { kind: "counter", key: "cards_laid_off" },
    thresholds: tierThresholds([10, 50, 150, 400, 1000]),
  },
  {
    id: "wilds_laid_off",
    category: "layingOff",
    titleKey: "achievementFamily.wildsLaidOff.title",
    unitKey: "achievementFamily.wildsLaidOff.unit",
    source: { kind: "counter", key: "wilds_laid_off" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "laid_off_onto_opponent",
    category: "layingOff",
    titleKey: "achievementFamily.laidOffOntoOpponent.title",
    unitKey: "achievementFamily.laidOffOntoOpponent.unit",
    source: { kind: "counter", key: "laid_off_onto_opponent" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "ambiguous_wild_choices_made",
    category: "layingOff",
    titleKey: "achievementFamily.ambiguousWildChoicesMade.title",
    unitKey: "achievementFamily.ambiguousWildChoicesMade.unit",
    source: { kind: "counter", key: "ambiguous_wild_choices_made" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },

  // --- Draw / discard economy ---
  {
    id: "cards_drawn_blind",
    category: "drawDiscard",
    titleKey: "achievementFamily.cardsDrawnBlind.title",
    unitKey: "achievementFamily.cardsDrawnBlind.unit",
    source: { kind: "counter", key: "cards_drawn_blind" },
    thresholds: tierThresholds([25, 100, 300, 750, 2000]),
  },
  {
    id: "cards_drawn_from_discard",
    category: "drawDiscard",
    titleKey: "achievementFamily.cardsDrawnFromDiscard.title",
    unitKey: "achievementFamily.cardsDrawnFromDiscard.unit",
    source: { kind: "counter", key: "cards_drawn_from_discard" },
    thresholds: tierThresholds([10, 40, 120, 300, 800]),
  },
  {
    id: "wilds_drawn",
    category: "drawDiscard",
    titleKey: "achievementFamily.wildsDrawn.title",
    unitKey: "achievementFamily.wildsDrawn.unit",
    source: { kind: "counter", key: "wilds_drawn" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "jokers_drawn",
    category: "drawDiscard",
    titleKey: "achievementFamily.jokersDrawn.title",
    unitKey: "achievementFamily.jokersDrawn.unit",
    source: { kind: "counter", key: "jokers_drawn" },
    thresholds: tierThresholds([3, 10, 30, 75, 200]),
  },
  {
    id: "cards_discarded",
    category: "drawDiscard",
    titleKey: "achievementFamily.cardsDiscarded.title",
    unitKey: "achievementFamily.cardsDiscarded.unit",
    source: { kind: "counter", key: "cards_discarded" },
    thresholds: tierThresholds([25, 100, 300, 750, 2000]),
  },

  // --- Going out ---
  {
    id: "rounds_won",
    category: "goingOut",
    titleKey: "achievementFamily.roundsWon.title",
    unitKey: "achievementFamily.roundsWon.unit",
    source: { kind: "counter", key: "rounds_won" },
    thresholds: tierThresholds([5, 25, 75, 200, 500]),
  },
  {
    id: "rounds_won_no_discard",
    category: "goingOut",
    titleKey: "achievementFamily.roundsWonNoDiscard.title",
    unitKey: "achievementFamily.roundsWonNoDiscard.unit",
    source: { kind: "counter", key: "rounds_won_no_discard" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "rounds_won_via_discard",
    category: "goingOut",
    titleKey: "achievementFamily.roundsWonViaDiscard.title",
    unitKey: "achievementFamily.roundsWonViaDiscard.unit",
    source: { kind: "counter", key: "rounds_won_via_discard" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "rounds_won_final_round",
    category: "goingOut",
    titleKey: "achievementFamily.roundsWonFinalRound.title",
    unitKey: "achievementFamily.roundsWonFinalRound.unit",
    source: { kind: "counter", key: "rounds_won_final_round" },
    thresholds: tierThresholds([1, 3, 8, 20, 50]),
  },
  {
    id: "zero_penalty_games",
    category: "goingOut",
    titleKey: "achievementFamily.zeroPenaltyGames.title",
    unitKey: "achievementFamily.zeroPenaltyGames.unit",
    source: { kind: "counter", key: "zero_penalty_games" },
    thresholds: tierThresholds([1, 3, 8, 20, 50]),
  },

  // --- Per-contract completion (by the contract's own round number, so a
  // Custom or Short game still credits the right family regardless of
  // where in the sequence that round actually falls) ---
  {
    id: "completed_round_1",
    category: "contracts",
    titleKey: "achievementFamily.completedRound1.title",
    unitKey: "achievementFamily.completedRound1.unit",
    source: { kind: "counter", key: "completed_round_1" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "completed_round_2",
    category: "contracts",
    titleKey: "achievementFamily.completedRound2.title",
    unitKey: "achievementFamily.completedRound2.unit",
    source: { kind: "counter", key: "completed_round_2" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "completed_round_3",
    category: "contracts",
    titleKey: "achievementFamily.completedRound3.title",
    unitKey: "achievementFamily.completedRound3.unit",
    source: { kind: "counter", key: "completed_round_3" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "completed_round_4",
    category: "contracts",
    titleKey: "achievementFamily.completedRound4.title",
    unitKey: "achievementFamily.completedRound4.unit",
    source: { kind: "counter", key: "completed_round_4" },
    thresholds: tierThresholds([3, 10, 30, 75, 200]),
  },
  {
    id: "completed_round_5",
    category: "contracts",
    titleKey: "achievementFamily.completedRound5.title",
    unitKey: "achievementFamily.completedRound5.unit",
    source: { kind: "counter", key: "completed_round_5" },
    thresholds: tierThresholds([3, 10, 30, 75, 200]),
  },
  {
    id: "completed_round_6",
    category: "contracts",
    titleKey: "achievementFamily.completedRound6.title",
    unitKey: "achievementFamily.completedRound6.unit",
    source: { kind: "counter", key: "completed_round_6" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "completed_round_7",
    category: "contracts",
    titleKey: "achievementFamily.completedRound7.title",
    unitKey: "achievementFamily.completedRound7.unit",
    source: { kind: "counter", key: "completed_round_7" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },

  // --- Table composition ---
  {
    id: "pass_and_play_games",
    category: "tableComposition",
    titleKey: "achievementFamily.passAndPlayGames.title",
    unitKey: "achievementFamily.passAndPlayGames.unit",
    source: { kind: "counter", key: "pass_and_play_games" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "solo_vs_ai_games",
    category: "tableComposition",
    titleKey: "achievementFamily.soloVsAiGames.title",
    unitKey: "achievementFamily.soloVsAiGames.unit",
    source: { kind: "counter", key: "solo_vs_ai_games" },
    thresholds: tierThresholds([3, 15, 50, 150, 400]),
  },
  {
    id: "large_table_games",
    category: "tableComposition",
    titleKey: "achievementFamily.largeTableGames.title",
    unitKey: "achievementFamily.largeTableGames.unit",
    source: { kind: "counter", key: "large_table_games" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "turns_taken",
    category: "tableComposition",
    titleKey: "achievementFamily.turnsTaken.title",
    unitKey: "achievementFamily.turnsTaken.unit",
    source: { kind: "counter", key: "turns_taken" },
    thresholds: tierThresholds([50, 250, 750, 2000, 5000]),
  },
];

function winsByDifficultyValue(state: AchievementProgressState, difficulty: string): number {
  return state.winsByDifficulty[difficulty] ?? 0;
}

/** The family's current numeric value, or null if it isn't meaningful yet
 * (e.g. best score before any game has been recorded). */
export function achievementValue(family: AchievementFamily, state: AchievementProgressState): number | null {
  switch (family.source.kind) {
    case "counter":
      return state.counters[family.source.key] ?? 0;
    case "gamesPlayed":
      return state.gamesPlayed;
    case "gamesWon":
      return state.gamesWon;
    case "bestScore":
      return state.gamesPlayed >= BEST_SCORE_MIN_GAMES ? state.bestScore : null;
    case "winRate":
      return state.gamesPlayed >= WIN_RATE_MIN_GAMES ? (100 * state.gamesWon) / state.gamesPlayed : 0;
    case "winsByDifficulty":
      return winsByDifficultyValue(state, family.source.difficulty);
    case "mpGamesPlayed":
      return state.mpGamesPlayed;
    case "mpGamesWon":
      return state.mpGamesWon;
    case "mpBestWinStreak":
      return state.mpBestWinStreak;
    case "mpWinRate":
      return state.mpGamesPlayed >= MP_WIN_RATE_MIN_GAMES
        ? (100 * state.mpGamesWon) / state.mpGamesPlayed
        : 0;
  }
}

export interface AchievementInstance {
  familyId: string;
  /** Translation key, not literal text — see AchievementFamily.titleKey. */
  familyTitleKey: string;
  category: AchievementCategory;
  tier: AchievementTier;
  /** Translation key, not literal text — see AchievementFamily.unitKey. */
  unitKey: string;
  threshold: number;
  /** Current value, or null if not yet meaningful (see achievementValue). */
  value: number | null;
  unlocked: boolean;
  /** 0-1, clamped — how close this specific tier is to unlocking. */
  progressFraction: number;
  /** True for families like best score, where smaller beats the threshold
   * — callers need this to phrase "value / threshold" sensibly. */
  lowerIsBetter: boolean;
}

function isUnlocked(family: AchievementFamily, value: number | null, threshold: number): boolean {
  if (value === null) return false;
  return family.lowerIsBetter ? value <= threshold : value >= threshold;
}

function progressFraction(family: AchievementFamily, value: number | null, threshold: number): number {
  if (value === null) return 0;
  if (family.lowerIsBetter) {
    // Lower-is-better has no natural "0" floor to measure progress from
    // (a score of 500 isn't "0% of the way" to a threshold of 0 in the way
    // a counter climbing from 0 is) — treat "any recorded game" as a
    // reasonable starting point and scale from there.
    if (threshold >= value) return 1;
    const floor = Math.max(threshold * 4, threshold + 40); // a generous, arbitrary "far away" anchor
    return Math.max(0, Math.min(1, (floor - value) / (floor - threshold)));
  }
  return Math.max(0, Math.min(1, value / threshold));
}

/** Every achievement (family × tier), each independently unlocked or not. */
export function allAchievements(state: AchievementProgressState): AchievementInstance[] {
  const out: AchievementInstance[] = [];
  for (const family of ACHIEVEMENT_FAMILIES) {
    const value = achievementValue(family, state);
    for (const tier of ACHIEVEMENT_TIERS) {
      const threshold = family.thresholds[tier];
      out.push({
        familyId: family.id,
        familyTitleKey: family.titleKey,
        category: family.category,
        tier,
        unitKey: family.unitKey,
        threshold,
        value,
        unlocked: isUnlocked(family, value, threshold),
        progressFraction: progressFraction(family, value, threshold),
        lowerIsBetter: !!family.lowerIsBetter,
      });
    }
  }
  return out;
}
