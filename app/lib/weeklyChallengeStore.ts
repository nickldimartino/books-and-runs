import { seededRng, shuffle } from "@/deck";
import { createGame, PlayerConfig } from "@/gameEngine";
import { CONTRACTS, GameState } from "@/types";
import { AI_PERSONAS } from "./aiPersonas";
import { dateSeed } from "./dailyDealStore";
import { YOU_PLAYER_ID } from "./recordGameResult";
import { stepShieldStreak, weekIndex, WEEKLY_SHIELD_CONFIG } from "@/streakShield";

// The Weekly Challenge — Daily Deal's bigger, harder sibling (audit item:
// "no rotating challenge beyond Daily Deal"). Where Daily Deal is a quick
// single round against 2-3 Medium AIs, this is the full standard 7-round
// game against 3 Hard AIs, seeded by the week instead of the day, so it's
// the same fixed table and deal for everyone playing it this week — a
// once-a-week event worth sitting down for, not a few-minutes filler.
// Deliberately its own separate store/save-slot/streak rather than a
// generalized "challenge kind" — same reasoning dailyDealStore.ts's own
// history shows for this codebase: a dedicated, explicit module per feature
// over one parameterized abstraction.

const KEY = "booksAndRuns:weeklyChallenge";
const HISTORY_LIMIT = 12; // ~3 months of weeks — plenty for a small glance

interface WeeklyChallengeResult {
  week: string; // "YYYY-Www", ISO week — see isoWeekKey
  won: boolean;
  yourScore: number;
}

export interface WeeklyChallengeState {
  streak: number;
  bestStreak: number;
  lastPlayedWeek: string | null;
  history: WeeklyChallengeResult[];
  // The weekly streak shield (src/streakShield.ts, WEEKLY_SHIELD_CONFIG):
  // one, earned at every 4-week streak, covers one missed week. Cached copy
  // of the account's cloud record plus a local estimate.
  /** Shields currently held (0-1). */
  shields: number;
  /** Lifetime shields granted. */
  shieldsEarned: number;
  /** Week keys a shield covered (newest 30). */
  coveredWeeks: string[];
  /** Completion week on which the latest shield was earned. */
  lastShieldEarnedOn: string | null;
}

const EMPTY_STATE: WeeklyChallengeState = {
  streak: 0,
  bestStreak: 0,
  lastPlayedWeek: null,
  history: [],
  shields: 0,
  shieldsEarned: 0,
  coveredWeeks: [],
  lastShieldEarnedOn: null,
};

/** "YYYY-Www" (ISO 8601 week) for the given Date's own local calendar day —
 * same local-not-UTC reasoning as dailyDealStore.ts's localDateKey: every
 * "this week" in this file means the week it reads as on the player's own
 * device right now. ISO weeks start Monday and belong to whichever year
 * holds their Thursday, which is what the getUTCDay-on-a-local-midnight
 * dance below computes (the standard ISO week algorithm, done on a local
 * date instead of the real UTC one). */
export function isoWeekKey(d: Date = new Date()): string {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Shift to the Thursday of this ISO week: ISO's Monday=1..Sunday=7.
  const isoDay = local.getDay() === 0 ? 7 : local.getDay();
  local.setDate(local.getDate() + (4 - isoDay));
  const isoYear = local.getFullYear();
  const yearStart = new Date(isoYear, 0, 1);
  const week = Math.ceil(((local.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** Exported only for its own test — every real call site just needs
 * isoWeekKey and recordWeeklyChallengeResult's streak logic, which calls
 * this internally. */
export function weekKeyMinusOneWeek(key: string): string {
  const [y, w] = key.split("-W").map(Number);
  // Reconstruct a date inside week `w` of year `y` (its Thursday, via the
  // same anchor isoWeekKey uses), then step back 7 days and re-derive the
  // key — simplest way to get "the previous ISO week" right across a
  // year boundary without hand-rolling ISO week arithmetic twice.
  const jan4 = new Date(y, 0, 4);
  const jan4IsoDay = jan4.getDay() === 0 ? 7 : jan4.getDay();
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - (jan4IsoDay - 1));
  const thisWeekMonday = new Date(week1Monday);
  thisWeekMonday.setDate(week1Monday.getDate() + (w - 1) * 7);
  thisWeekMonday.setDate(thisWeekMonday.getDate() - 7);
  return isoWeekKey(thisWeekMonday);
}

/** Same djb2 string hash dailyDealStore.ts's dateSeed already is — reused
 * directly rather than duplicated, since it only ever hashes a string and
 * never actually inspects it as a date. */
export function weekSeed(weekKey: string): number {
  return dateSeed(weekKey);
}

const WEEKLY_CHALLENGE_OPPONENTS = 3;

/**
 * This week's fixed challenge: you vs. 3 Hard AIs, the full standard 7-round
 * game, dealt from a shuffle seeded by this week's key — the same table and
 * deal for everyone playing it this week. Which Hard personas fill those
 * seats is a seeded shuffle of the whole Hard pool, fixed for the entire
 * week (same idea as Daily Deal's own persona pick).
 */
export function createWeeklyChallengeGame(): GameState {
  const seed = weekSeed(isoWeekKey());
  const rng = seededRng(seed);
  const opponents = shuffle(AI_PERSONAS.hard, rng).slice(0, WEEKLY_CHALLENGE_OPPONENTS);
  const configs: PlayerConfig[] = [
    { id: YOU_PLAYER_ID, name: "You", isAI: false },
    ...opponents.map((persona, i) => ({
      id: `weekly-challenge-ai-${i}`,
      name: `${persona.avatar} ${persona.name}`,
      isAI: true,
      difficulty: "hard" as const,
    })),
  ];
  return createGame(configs, CONTRACTS, rng);
}

export function loadWeeklyChallengeState(): WeeklyChallengeState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_STATE;
    return { ...EMPTY_STATE, ...(JSON.parse(raw) as Partial<WeeklyChallengeState>) };
  } catch {
    return EMPTY_STATE;
  }
}

function saveWeeklyChallengeState(state: WeeklyChallengeState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage unavailable/full — the streak just won't persist across visits
  }
}

/** Same reasoning/use as dailyDealStore.ts's resetDailyDealLocal — clears
 * this device's local state when a different account signs in. */
export function resetWeeklyChallengeLocal(): void {
  saveWeeklyChallengeState(EMPTY_STATE);
}

/** Whether this week's challenge has already been played — Home uses this
 * to swap "Play this week's challenge" for a played/protected state. */
export function playedThisWeek(state: WeeklyChallengeState = loadWeeklyChallengeState()): boolean {
  return state.lastPlayedWeek === isoWeekKey();
}

/** Same cloud-reconciliation shape as dailyDealStore.ts's
 * mergeCloudDailyDealState — see that function's own doc for the full
 * reasoning, identical here with weeks in place of days. */
export function mergeCloudWeeklyChallengeState(cloud: {
  streak: number;
  bestStreak: number;
  lastPlayedWeek: string | null;
  shields?: number;
  shieldsEarned?: number;
  covered?: string[];
  lastShieldEarnedOn?: string | null;
}): WeeklyChallengeState {
  const local = loadWeeklyChallengeState();
  const localIsNewer =
    local.lastPlayedWeek !== null && (cloud.lastPlayedWeek === null || local.lastPlayedWeek > cloud.lastPlayedWeek);
  const next: WeeklyChallengeState = localIsNewer
    ? { ...local, bestStreak: Math.max(local.bestStreak, cloud.bestStreak) }
    : {
        streak: cloud.streak,
        bestStreak: Math.max(cloud.bestStreak, local.bestStreak),
        lastPlayedWeek: cloud.lastPlayedWeek,
        history: local.history,
        shields: cloud.shields ?? 0,
        shieldsEarned: cloud.shieldsEarned ?? 0,
        coveredWeeks: cloud.covered ?? [],
        lastShieldEarnedOn: cloud.lastShieldEarnedOn ?? null,
      };
  saveWeeklyChallengeState(next);
  return next;
}

/** Same reasoning/shape as dailyDealStore.ts's recordDailyDealResult — a
 * no-op if this week was already recorded, entirely local/self-contained,
 * streak counts consecutive weeks *played* (finished), not won. */
export function recordWeeklyChallengeResult(state: GameState): WeeklyChallengeState {
  const current = loadWeeklyChallengeState();
  const thisWeek = isoWeekKey();
  if (current.lastPlayedWeek === thisWeek) return current;

  const you = state.players.find((p) => p.id === YOU_PLAYER_ID);
  const lowest = Math.min(...state.players.map((p) => p.cumulativeScore));
  const won = !!you && you.cumulativeScore === lowest;
  const yourScore = you?.cumulativeScore ?? 0;

  // Same rule as migration 0081 (src/streakShield.ts): consecutive week -> +1;
  // exactly one missed week with the shield held -> covered, streak continues;
  // anything else restarts at 1.
  const step = stepShieldStreak(
    {
      current: current.streak,
      best: current.bestStreak,
      shields: current.shields,
      earned: current.shieldsEarned,
      used: 0,
      lastEarnedIndex: null,
    },
    current.lastPlayedWeek ? weekIndex(current.lastPlayedWeek) : null,
    weekIndex(thisWeek),
    WEEKLY_SHIELD_CONFIG
  );
  const streak = step.current;
  const next: WeeklyChallengeState = {
    streak,
    bestStreak: Math.max(current.bestStreak, streak),
    lastPlayedWeek: thisWeek,
    history: [{ week: thisWeek, won, yourScore }, ...current.history].slice(0, HISTORY_LIMIT),
    shields: step.shields,
    shieldsEarned: step.earned,
    coveredWeeks:
      step.covered !== null ? [...current.coveredWeeks, weekKeyMinusOneWeek(thisWeek)].slice(-30) : current.coveredWeeks,
    lastShieldEarnedOn: step.earned > current.shieldsEarned ? thisWeek : current.lastShieldEarnedOn,
  };
  saveWeeklyChallengeState(next);
  return next;
}
