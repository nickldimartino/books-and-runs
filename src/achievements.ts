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

export type AchievementSource =
  | { kind: "counter"; key: string }
  | { kind: "gamesPlayed" }
  | { kind: "gamesWon" }
  | { kind: "bestScore" } // lower is better; null until a game's been recorded
  | { kind: "winRate" } // gamesWon / gamesPlayed, gated by a minimum sample size
  | { kind: "winsByDifficulty"; difficulty: string };

export interface AchievementFamily {
  id: string;
  title: string;
  /** How progress reads, e.g. "42 / 75 books melded". */
  unit: string;
  source: AchievementSource;
  thresholds: Record<AchievementTier, number>;
  /** True for families where a *lower* value is the achievement (best score). */
  lowerIsBetter?: boolean;
}

/** Everything needed to evaluate every family's current value. */
export interface AchievementProgressState {
  counters: Record<string, number>;
  gamesPlayed: number;
  gamesWon: number;
  bestScore: number | null;
  winsByDifficulty: Record<string, number>;
}

export const EMPTY_PROGRESS_STATE: AchievementProgressState = {
  counters: {},
  gamesPlayed: 0,
  gamesWon: 0,
  bestScore: null,
  winsByDifficulty: {},
};

// A win-rate achievement with only 1-2 games played is meaningless (100%
// off a single lucky game) — require a minimum sample before it counts.
const WIN_RATE_MIN_GAMES = 10;

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
    title: "Tablehand",
    unit: "games played",
    source: { kind: "gamesPlayed" },
    thresholds: tierThresholds([10, 50, 150, 400, 1000]),
  },
  {
    id: "games_won",
    title: "Champion",
    unit: "games won",
    source: { kind: "gamesWon" },
    thresholds: tierThresholds([5, 15, 35, 65, 100]),
  },
  {
    id: "best_score",
    title: "Sharpshooter",
    unit: `final score in a single game (min. ${BEST_SCORE_MIN_GAMES} games played)`,
    source: { kind: "bestScore" },
    lowerIsBetter: true,
    thresholds: tierThresholds([70, 50, 30, 15, 0]),
  },
  {
    id: "win_rate",
    title: "Consistent",
    unit: `% win rate (min. ${WIN_RATE_MIN_GAMES} games)`,
    source: { kind: "winRate" },
    thresholds: tierThresholds([10, 25, 40, 60, 80]),
  },

  // --- One per AI difficulty, from wins_by_difficulty ---
  {
    id: "wins_vs_beginner",
    title: "Rival: Beginner AI",
    unit: "wins with a Beginner AI at the table",
    source: { kind: "winsByDifficulty", difficulty: "beginner" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "wins_vs_easy",
    title: "Rival: Easy AI",
    unit: "wins with an Easy AI at the table",
    source: { kind: "winsByDifficulty", difficulty: "easy" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "wins_vs_medium",
    title: "Rival: Medium AI",
    unit: "wins with a Medium AI at the table",
    source: { kind: "winsByDifficulty", difficulty: "medium" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "wins_vs_hard",
    title: "Rival: Hard AI",
    unit: "wins with a Hard AI at the table",
    source: { kind: "winsByDifficulty", difficulty: "hard" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "wins_vs_expert",
    title: "Rival: Expert AI",
    unit: "wins with an Expert AI at the table",
    source: { kind: "winsByDifficulty", difficulty: "expert" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },

  // --- Melding ---
  {
    id: "books_melded",
    title: "Bookworm",
    unit: "books melded",
    source: { kind: "counter", key: "books_melded" },
    thresholds: tierThresholds([5, 25, 75, 300, 1000]),
  },
  {
    id: "runs_melded",
    title: "Runner",
    unit: "runs melded",
    source: { kind: "counter", key: "runs_melded" },
    thresholds: tierThresholds([5, 25, 75, 300, 1000]),
  },
  {
    id: "oversized_books_melded",
    title: "Overstuffed",
    unit: "oversized books melded (bigger than the minimum)",
    source: { kind: "counter", key: "oversized_books_melded" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "oversized_runs_melded",
    title: "Long Haul",
    unit: "oversized runs melded (longer than the minimum)",
    source: { kind: "counter", key: "oversized_runs_melded" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "wilds_used_in_melds",
    title: "Wild Card",
    unit: "wilds used in melds",
    source: { kind: "counter", key: "wilds_used_in_melds" },
    thresholds: tierThresholds([5, 25, 75, 200, 500]),
  },
  {
    id: "melds_with_zero_wilds",
    title: "Purist",
    unit: "all-natural melds (no wilds)",
    source: { kind: "counter", key: "melds_with_zero_wilds" },
    thresholds: tierThresholds([5, 25, 75, 200, 500]),
  },

  // --- Laying off ---
  {
    id: "cards_laid_off",
    title: "Offloader",
    unit: "cards laid off",
    source: { kind: "counter", key: "cards_laid_off" },
    thresholds: tierThresholds([10, 50, 150, 400, 1000]),
  },
  {
    id: "wilds_laid_off",
    title: "Generous",
    unit: "wilds laid off",
    source: { kind: "counter", key: "wilds_laid_off" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "laid_off_onto_opponent",
    title: "Team Player",
    unit: "cards laid onto an opponent's meld",
    source: { kind: "counter", key: "laid_off_onto_opponent" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "ambiguous_wild_choices_made",
    title: "Decisive",
    unit: "ambiguous wild placements resolved",
    source: { kind: "counter", key: "ambiguous_wild_choices_made" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },

  // --- Draw / discard economy ---
  {
    id: "cards_drawn_blind",
    title: "Gambler",
    unit: "cards drawn blind from the pile",
    source: { kind: "counter", key: "cards_drawn_blind" },
    thresholds: tierThresholds([25, 100, 300, 750, 2000]),
  },
  {
    id: "cards_drawn_from_discard",
    title: "Scavenger",
    unit: "cards taken from the discard pile",
    source: { kind: "counter", key: "cards_drawn_from_discard" },
    thresholds: tierThresholds([10, 40, 120, 300, 800]),
  },
  {
    id: "wilds_drawn",
    title: "Lucky Draw",
    unit: "wilds drawn",
    source: { kind: "counter", key: "wilds_drawn" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "jokers_drawn",
    title: "Joker's Wild",
    unit: "jokers drawn",
    source: { kind: "counter", key: "jokers_drawn" },
    thresholds: tierThresholds([3, 10, 30, 75, 200]),
  },
  {
    id: "cards_discarded",
    title: "Declutterer",
    unit: "cards discarded",
    source: { kind: "counter", key: "cards_discarded" },
    thresholds: tierThresholds([25, 100, 300, 750, 2000]),
  },

  // --- Going out ---
  {
    id: "rounds_won",
    title: "Round Winner",
    unit: "rounds won",
    source: { kind: "counter", key: "rounds_won" },
    thresholds: tierThresholds([5, 25, 75, 200, 500]),
  },
  {
    id: "rounds_won_no_discard",
    title: "Clean Sweep",
    unit: "rounds won by going out with no discard needed (outside the final round)",
    source: { kind: "counter", key: "rounds_won_no_discard" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "rounds_won_via_discard",
    title: "Just in Time",
    unit: "rounds won by discarding your last card",
    source: { kind: "counter", key: "rounds_won_via_discard" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "rounds_won_final_round",
    title: "No Rummy",
    unit: "final (3 Runs) rounds won",
    source: { kind: "counter", key: "rounds_won_final_round" },
    thresholds: tierThresholds([1, 3, 8, 20, 50]),
  },
  {
    id: "zero_penalty_games",
    title: "Flawless",
    unit: "games finished with a final score of 0",
    source: { kind: "counter", key: "zero_penalty_games" },
    thresholds: tierThresholds([1, 3, 8, 20, 50]),
  },

  // --- Per-contract completion (by the contract's own round number, so a
  // Custom or Short game still credits the right family regardless of
  // where in the sequence that round actually falls) ---
  {
    id: "completed_round_1",
    title: "2 Books Regular",
    unit: "times melded 2 Books",
    source: { kind: "counter", key: "completed_round_1" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "completed_round_2",
    title: "Mixed Bag",
    unit: "times melded 1 Book + 1 Run",
    source: { kind: "counter", key: "completed_round_2" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "completed_round_3",
    title: "Straight Runner",
    unit: "times melded 2 Runs",
    source: { kind: "counter", key: "completed_round_3" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "completed_round_4",
    title: "Heavy Lifter",
    unit: "times melded 2 Books + 1 Run",
    source: { kind: "counter", key: "completed_round_4" },
    thresholds: tierThresholds([3, 10, 30, 75, 200]),
  },
  {
    id: "completed_round_5",
    title: "Triple Threat",
    unit: "times melded 1 Book + 2 Runs",
    source: { kind: "counter", key: "completed_round_5" },
    thresholds: tierThresholds([3, 10, 30, 75, 200]),
  },
  {
    id: "completed_round_6",
    title: "Trilogy",
    unit: "times melded 3 Books",
    source: { kind: "counter", key: "completed_round_6" },
    thresholds: tierThresholds([5, 20, 60, 150, 400]),
  },
  {
    id: "completed_round_7",
    title: "The Hardest Round",
    unit: "times melded 3 Runs (the whole hand at once)",
    source: { kind: "counter", key: "completed_round_7" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },

  // --- Table composition ---
  {
    id: "pass_and_play_games",
    title: "Around the Table",
    unit: "games with 2+ human players",
    source: { kind: "counter", key: "pass_and_play_games" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "solo_vs_ai_games",
    title: "Solo Act",
    unit: "games playing alone against AI",
    source: { kind: "counter", key: "solo_vs_ai_games" },
    thresholds: tierThresholds([3, 15, 50, 150, 400]),
  },
  {
    id: "large_table_games",
    title: "Full House",
    unit: "games with 6 or more players",
    source: { kind: "counter", key: "large_table_games" },
    thresholds: tierThresholds([1, 5, 15, 40, 100]),
  },
  {
    id: "turns_taken",
    title: "Marathoner",
    unit: "turns taken",
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
  }
}

export interface AchievementInstance {
  familyId: string;
  familyTitle: string;
  tier: AchievementTier;
  unit: string;
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
        familyTitle: family.title,
        tier,
        unit: family.unit,
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
