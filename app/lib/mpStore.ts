import { SupabaseClient } from "@supabase/supabase-js";
import type { MpAction, RedactedView } from "@/mp/types";

/**
 * Client side of multiplayer. The Edge Function (`mp`) is the authority — it
 * runs the real engine, hides the deck and other hands, and validates every
 * move. These helpers just call it with the caller's access token. The
 * read-only lists (mp_my_games / mp_my_history) and the stats RPC
 * (mp_my_stats, migration 0011) are plain Postgres RPCs that touch only
 * public columns.
 */

const FN_BASE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/mp`
    : "";

export class MpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "MpError";
    this.status = status;
  }
}

async function callMp<T>(
  supabase: SupabaseClient,
  path: "create" | "respond" | "state" | "move" | "resign",
  payload: Record<string, unknown>
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new MpError("You're signed out.", 401);

  const res = await fetch(`${FN_BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    /* empty / non-JSON */
  }
  if (!res.ok) {
    throw new MpError(typeof body.error === "string" ? body.error : "Request failed.", res.status);
  }
  return body as T;
}

// ── seat config sent to /create ──────────────────────────────────────────

export type NewGameSeat =
  | { kind: "human"; user_id: string }
  | { kind: "ai"; difficulty: string; name: string };

export interface CreateMpGameInput {
  contractRounds: number[];
  seats: NewGameSeat[]; // everyone except the host — the function seats the host at 0
}

export async function createMpGame(
  supabase: SupabaseClient,
  input: CreateMpGameInput
): Promise<{ game_id: string }> {
  return callMp(supabase, "create", {
    contract_rounds: input.contractRounds,
    seats: input.seats,
  });
}

export async function respondToMpGame(
  supabase: SupabaseClient,
  gameId: string,
  accept: boolean
): Promise<{ status: string; accepted?: boolean }> {
  return callMp(supabase, "respond", { game_id: gameId, accept });
}

export interface MpStateResponse {
  status: "pending" | "active" | "complete" | "cancelled" | "dealing";
  view?: RedactedView;
  /** mp_games.updated_at — present for a dealt game, so the UI can flag one
   * that's had no moves in a long time as possibly abandoned. */
  updated_at?: string;
  // present only when status === "pending"
  seats?: unknown[];
  host_id?: string;
  contract_rounds?: number[];
  participants?: { user_id: string; seat: number; invite_status: string }[];
}

export async function getMpState(supabase: SupabaseClient, gameId: string): Promise<MpStateResponse> {
  return callMp(supabase, "state", { game_id: gameId });
}

export interface MpMoveResponse {
  status: "active" | "complete";
  view: RedactedView;
  drawnCard?: { id: string } | null;
}

export async function submitMpMove(
  supabase: SupabaseClient,
  gameId: string,
  action: MpAction
): Promise<MpMoveResponse> {
  return callMp(supabase, "move", { game_id: gameId, action });
}

export async function resignMpGame(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ status: string; view: RedactedView }> {
  return callMp(supabase, "resign", { game_id: gameId });
}

// ── read-only lists (plain RPCs) ─────────────────────────────────────────

export interface MpGameSummary {
  game_id: string;
  status: "pending" | "active";
  round: number;
  total_rounds: number;
  your_seat: number;
  invite_status: "invited" | "accepted";
  turn_seat: number | null;
  turn_user_id: string | null;
  seats: MpSeatMeta[];
  hand_counts: Record<string, number>;
  cumulative_scores: Record<string, number>;
  host_id: string;
  updated_at: string;
}

export interface MpSeatMeta {
  seat: number;
  kind: "human" | "ai";
  userId?: string;
  name: string;
  difficulty?: string;
}

export async function getMyMpGames(supabase: SupabaseClient): Promise<MpGameSummary[]> {
  const { data, error } = await supabase.rpc("mp_my_games");
  if (error) throw error;
  return (data as MpGameSummary[]) ?? [];
}

export interface MpStats {
  played: number;
  won: number;
  lost: number;
  currentWinStreak: number;
  bestWinStreak: number;
  podiums: number;
  biggestTableBeaten: number;
}

export const EMPTY_MP_STATS: MpStats = {
  played: 0,
  won: 0,
  lost: 0,
  currentWinStreak: 0,
  bestWinStreak: 0,
  podiums: 0,
  biggestTableBeaten: 0,
};

/** Full multiplayer numbers from mp_my_stats() (migration 0011). Needs that
 * migration; callers that can't guarantee it should catch and fall back to
 * EMPTY_MP_STATS. */
export async function getMyMpStats(supabase: SupabaseClient): Promise<MpStats> {
  const { data, error } = await supabase.rpc("mp_my_stats");
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, number> | undefined;
  if (!r) return { ...EMPTY_MP_STATS };
  return {
    played: r.played ?? 0,
    won: r.won ?? 0,
    lost: r.lost ?? 0,
    currentWinStreak: r.current_win_streak ?? 0,
    bestWinStreak: r.best_win_streak ?? 0,
    podiums: r.podiums ?? 0,
    biggestTableBeaten: r.biggest_table_beaten ?? 0,
  };
}

export interface MpHistoryEntry {
  game_id: string;
  seats: MpSeatMeta[];
  cumulative_scores: Record<string, number>;
  winner_user_id: string | null;
  your_outcome: "won" | "lost" | "resigned" | null;
  completed_at: string | null;
}

export async function getMyMpHistory(
  supabase: SupabaseClient,
  limit = 20
): Promise<MpHistoryEntry[]> {
  const { data, error } = await supabase.rpc("mp_my_history", { limit_n: limit });
  if (error) throw error;
  return (data as MpHistoryEntry[]) ?? [];
}
