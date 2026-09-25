import type { SupabaseClient } from "@supabase/supabase-js";
import { MoveLogEntry } from "@/moveLog";
import { ContractRequirement, GameState } from "@/types";
import { callEdgeFunction } from "./callEdgeFunction";
import { RoundHistoryEntry } from "./recordGameResult";

/**
 * Client side of the solo/pass-and-play "record what happened locally, then
 * verify the whole game once it's over" flow — see
 * supabase/functions/solo-verify/index.ts, the actual authority. Same
 * fetch-with-bearer-token shape as mpStore.ts's callMp, rather than
 * supabase.functions.invoke, so a rejected replay's own error message
 * (never a generic "Edge Function returned a non-2xx status code") reaches
 * the caller. player_stats/achievement_counters no longer accept direct
 * client writes at all (migration 0035) — this is the only way either
 * table changes for a solo/pass-and-play game now.
 */

const FN_BASE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/solo-verify`
    : "";

export class SoloVerifyError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SoloVerifyError";
    this.status = status;
  }
}

export interface SoloVerifyPayload {
  seed: number;
  seats: { id: string; name: string; isAI: boolean; difficulty?: string }[];
  selectedContracts: ContractRequirement[];
  moveLog: MoveLogEntry[];
  trackStats: boolean;
  roundHistory: RoundHistoryEntry[];
  /** Set only for a Daily Deal game — see buildDailyDealVerifyPayload. When
   * true, the server skips player_stats/achievement_counters/game_history
   * entirely (Daily Deal has never counted toward those — see
   * dailyDealStore.ts's own doc) and instead records a verified completion
   * for `dailyDealDateKey` toward the account's streak. */
  isDailyDeal?: boolean;
  dailyDealDateKey?: string;
  /** Same idea as isDailyDeal/dailyDealDateKey, for a Weekly Challenge
   * completion — see buildWeeklyChallengeVerifyPayload. Mutually exclusive
   * with isDailyDeal (a game is never both). */
  isWeeklyChallenge?: boolean;
  weeklyChallengeWeekKey?: string;
}

interface SoloVerifyResult {
  ok: boolean;
  tracked?: boolean;
  won?: boolean;
  tied?: boolean;
  dailyDeal?: boolean;
  weeklyChallenge?: boolean;
}

export async function verifySoloGame(supabase: SupabaseClient, payload: SoloVerifyPayload): Promise<SoloVerifyResult> {
  return callEdgeFunction<SoloVerifyResult>(supabase, FN_BASE, payload, SoloVerifyError, {
    fallbackMessage: "Verification failed.",
    isOk: (body) => body.ok === true,
  });
}

/** Builds the payload from a finished game's state + GameContext's own
 * seed/move log — the same shape solo-verify expects. `null` if this game
 * can't be verified at all (no seed — a tutorial, or a save from before
 * this shipped); callers should fall back to treating the game as untracked
 * rather than attempting a write of any kind. */
export function buildSoloVerifyPayload(
  state: GameState,
  seed: number | null,
  moveLog: MoveLogEntry[],
  trackStats: boolean,
  roundHistory: RoundHistoryEntry[]
): SoloVerifyPayload | null {
  if (seed == null || moveLog.length === 0) return null;
  return {
    seed,
    seats: state.players.map((p) => ({ id: p.id, name: p.name, isAI: p.isAI, difficulty: p.difficulty })),
    selectedContracts: state.selectedContracts,
    moveLog,
    trackStats,
    roundHistory,
  };
}

/** Same shape, for a Daily Deal completion specifically — `dailyDealDateKey`
 * is the local date (dailyDealStore.ts's localDateKey) the deal was seeded
 * from, so the server can check it hashes to the same seed and is close
 * enough to its own clock to be believable (see solo-verify/index.ts).
 * `null` under the same conditions as buildSoloVerifyPayload — callers
 * should just skip the call, same as any other unverifiable game. */
export function buildDailyDealVerifyPayload(
  state: GameState,
  seed: number | null,
  moveLog: MoveLogEntry[],
  dailyDealDateKey: string
): SoloVerifyPayload | null {
  const base = buildSoloVerifyPayload(state, seed, moveLog, true, []);
  if (!base) return null;
  return { ...base, isDailyDeal: true, dailyDealDateKey };
}

/** Same shape, for a Weekly Challenge completion — `weeklyChallengeWeekKey`
 * is the local ISO week (weeklyChallengeStore.ts's isoWeekKey) the
 * challenge was seeded from, so the server can check it hashes to the same
 * seed and is close enough to its own clock to be believable (see
 * solo-verify/index.ts). Same `null` conditions as buildSoloVerifyPayload. */
export function buildWeeklyChallengeVerifyPayload(
  state: GameState,
  seed: number | null,
  moveLog: MoveLogEntry[],
  weeklyChallengeWeekKey: string
): SoloVerifyPayload | null {
  const base = buildSoloVerifyPayload(state, seed, moveLog, true, []);
  if (!base) return null;
  return { ...base, isWeeklyChallenge: true, weeklyChallengeWeekKey };
}
