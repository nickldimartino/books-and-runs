import { seededRng } from "@/deck";
import { createGame, PlayerConfig } from "@/gameEngine";
import { CONTRACTS, GameState } from "@/types";
import { DAILY_DEAL_PERSONAS } from "./aiPersonas";
import { YOU_PLAYER_ID } from "./recordGameResult";

const KEY = "booksAndRuns:dailyDeal";
// How many past days' results to keep around — enough for a small "last two
// weeks" glance without the record growing forever in localStorage.
const HISTORY_LIMIT = 30;

export interface DailyDealResult {
  date: string; // "YYYY-MM-DD", local calendar day — see localDateKey
  won: boolean;
  yourScore: number;
}

export interface DailyDealState {
  streak: number;
  bestStreak: number;
  lastPlayedDate: string | null;
  history: DailyDealResult[];
}

const EMPTY_STATE: DailyDealState = { streak: 0, bestStreak: 0, lastPlayedDate: null, history: [] };

/** "YYYY-MM-DD" for the given Date's own local calendar day — deliberately
 * not `toISOString()`, which is UTC-based and would flip to the next day up
 * to several hours early or late depending on the player's timezone. Every
 * "today" in this file (the shuffle seed, the streak, the history) means the
 * same thing: the day it reads as on the player's own device right now. */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateKeyMinusOneDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return localDateKey(date);
}

/** A 32-bit-ish integer seed from a date string — djb2, a plain, well-worn
 * string hash. Doesn't need to be cryptographically anything, just stable:
 * the same "YYYY-MM-DD" must always hash to the same seed, for every player,
 * forever, so today's deal really is the same deal for everyone playing it
 * today. */
export function dateSeed(dateKey: string): number {
  let hash = 5381;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 33) ^ dateKey.charCodeAt(i);
  }
  return hash >>> 0;
}

// Never fewer than 2 opponents (3 players total) — a 2-player game is over
// the instant either side melds their contract, which made a "quick daily
// round" feel more like a coin flip than a real hand of Contract Rummy.
// Anywhere from 2 opponents up through the whole roster is fair game, so
// the table itself varies day to day instead of being permanently fixed at
// the floor. Derived from the same date seed as the shuffle (not a
// separate random pick) so every player sees the same head count today,
// the same way everyone sees the same deal.
const MIN_DAILY_DEAL_OPPONENTS = 2;

function dailyDealOpponentCount(seed: number): number {
  const span = DAILY_DEAL_PERSONAS.length - MIN_DAILY_DEAL_OPPONENTS + 1;
  return MIN_DAILY_DEAL_OPPONENTS + (seed % span);
}

/**
 * Today's fixed challenge: you vs. 2+ Medium AIs (see
 * dailyDealOpponentCount — never fewer than 2, so this is never a 2-player
 * game, but the exact head count varies day to day), single round (the
 * simplest contract, "2 Books" — CONTRACTS[0] — so a Daily Deal is a
 * genuinely quick, few-minutes play), dealt from a shuffle seeded by
 * today's date. The opponents seated are deliberately a fixed *prefix* of
 * DAILY_DEAL_PERSONAS rather than a randomized pick like a normal game's
 * AIs (see pickAiPersonas) — the whole point of a daily challenge is
 * comparing today's result against your own history of playing the same
 * table, not a fresh face every day.
 */
export function createDailyDealGame(): GameState {
  const seed = dateSeed(localDateKey());
  const rng = seededRng(seed);
  const opponents = DAILY_DEAL_PERSONAS.slice(0, dailyDealOpponentCount(seed));
  const configs: PlayerConfig[] = [
    { id: YOU_PLAYER_ID, name: "You", isAI: false },
    ...opponents.map((persona, i) => ({
      id: `daily-deal-ai-${i}`,
      name: `${persona.avatar} ${persona.name}`,
      isAI: true,
      difficulty: "medium" as const,
    })),
  ];
  return createGame(configs, [CONTRACTS[0]], rng);
}

export function loadDailyDealState(): DailyDealState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_STATE;
    return { ...EMPTY_STATE, ...(JSON.parse(raw) as Partial<DailyDealState>) };
  } catch {
    return EMPTY_STATE;
  }
}

function saveDailyDealState(state: DailyDealState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage unavailable/full — the streak just won't persist across visits
  }
}

/** Whether today's deal has already been played (and so recorded) — Home
 * uses this to swap "Play today's deal" for a played/protected state, and
 * GameOverScreen uses it to avoid double-recording a replay of the same
 * day's deal (see recordDailyDealResult). */
export function playedToday(state: DailyDealState = loadDailyDealState()): boolean {
  return state.lastPlayedDate === localDateKey();
}

/**
 * Records today's Daily Deal result and advances the streak — a no-op
 * (returns the state unchanged) if today was already recorded, so replaying
 * a finished deal for fun never re-counts it or lets the streak be gamed by
 * repeated finishes in one day. Entirely local — see the New Game "own
 * streak only" scoping this was built to: it never touches Supabase, never
 * calls recordGameResult, and never appears in real stats, achievements, or
 * the leaderboard.
 */
export function recordDailyDealResult(state: GameState): DailyDealState {
  const current = loadDailyDealState();
  const today = localDateKey();
  if (current.lastPlayedDate === today) return current;

  const you = state.players.find((p) => p.id === YOU_PLAYER_ID);
  const lowest = Math.min(...state.players.map((p) => p.cumulativeScore));
  const won = !!you && you.cumulativeScore === lowest;
  const yourScore = you?.cumulativeScore ?? 0;

  const streak = current.lastPlayedDate === dateKeyMinusOneDay(today) ? current.streak + 1 : 1;
  const next: DailyDealState = {
    streak,
    bestStreak: Math.max(current.bestStreak, streak),
    lastPlayedDate: today,
    history: [{ date: today, won, yourScore }, ...current.history].slice(0, HISTORY_LIMIT),
  };
  saveDailyDealState(next);
  return next;
}
