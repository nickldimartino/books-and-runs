import type { SupabaseClient } from "@supabase/supabase-js";
import { callEdgeFunction } from "./callEdgeFunction";
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
  path: "create" | "respond" | "cancel" | "state" | "move" | "resign" | "nudge" | "friend_push",
  payload: Record<string, unknown>
): Promise<T> {
  return callEdgeFunction<T>(supabase, `${FN_BASE}/${path}`, payload, MpError);
}

// ── seat config sent to /create ──────────────────────────────────────────

export type NewGameSeat =
  | { kind: "human"; user_id: string }
  | { kind: "ai"; difficulty: string; name: string };

export interface CreateMpGameInput {
  contractRounds: number[];
  seats: NewGameSeat[]; // everyone except the host — the function seats the host at 0
  /** Per-turn limit in hours (0 = no limit, 24/48/72). Omit for the server
   * default (72); older servers ignore it. See src/mp/turnTimer.ts. */
  turnLimitHours?: number;
}

export async function createMpGame(
  supabase: SupabaseClient,
  input: CreateMpGameInput
): Promise<{ game_id: string }> {
  return callMp(supabase, "create", {
    contract_rounds: input.contractRounds,
    seats: input.seats,
    ...(input.turnLimitHours !== undefined ? { turn_limit_hours: input.turnLimitHours } : {}),
  });
}

export async function respondToMpGame(
  supabase: SupabaseClient,
  gameId: string,
  accept: boolean
): Promise<{ status: string; accepted?: boolean }> {
  return callMp(supabase, "respond", { game_id: gameId, accept });
}

/** Withdraws a game you're hosting that's still waiting on invitees to
 * accept — the host-side counterpart to respondToMpGame's decline. Only
 * works while the game is still `pending`; once everyone's in and it's
 * dealt, resignMpGame is the way out instead. */
export async function cancelMpGame(supabase: SupabaseClient, gameId: string): Promise<{ status: string }> {
  return callMp(supabase, "cancel", { game_id: gameId });
}

export interface MpStateResponse {
  status: "pending" | "active" | "complete" | "cancelled" | "dealing";
  view?: RedactedView;
  /** mp_games.updated_at — present for a dealt game, so the UI can flag one
   * that's had no moves in a long time as possibly abandoned. */
  updated_at?: string;
  /** Turn clock (migration 0061) — 0/absent means no limit. */
  turn_limit_hours?: number;
  /** When the current turn started (ISO), for the countdown badge. */
  turn_started_at?: string | null;
  /** Consecutive turns the viewer has let expire (1 → the next miss forfeits). */
  your_missed_turns?: number;
  // present only when status === "pending"
  seats?: unknown[];
  host_id?: string;
  contract_rounds?: number[];
  participants?: { user_id: string; seat: number; invite_status: string }[];
}

export async function getMpState(supabase: SupabaseClient, gameId: string): Promise<MpStateResponse> {
  return callMp(supabase, "state", { game_id: gameId });
}

/**
 * Seat → user id for every human seat in a game, queried straight from
 * `mp_participants` (RLS: any participant can read a game's own rows) —
 * unlike MpStateResponse.seats/participants above, this works for an
 * active game too, not just a pending one. Used to look up opponents' bios
 * for OpponentStrip's popover (see leaderboardStore.ts's fetchBiosFor);
 * doesn't go through the `mp` Edge Function at all, so nothing here needed
 * redeploying it.
 */
export async function getMpParticipantUserIds(
  supabase: SupabaseClient,
  gameId: string
): Promise<Record<number, string>> {
  const { data, error } = await supabase.from("mp_participants").select("user_id, seat").eq("game_id", gameId);
  if (error) throw error;
  const bySeat: Record<number, string> = {};
  for (const row of (data ?? []) as { user_id: string; seat: number }[]) {
    bySeat[row.seat] = row.user_id;
  }
  return bySeat;
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

/** Nudges the current-turn player: a badge bump AND a push ("Zara is waiting
 * on your move", in their language — honouring their notification settings).
 * Rate-limited; throws if not allowed. Falls back to the original
 * badge-only RPC (mp_nudge, migration 0017) against a server that predates
 * the `nudge` route. */
export async function nudgeMpGame(supabase: SupabaseClient, gameId: string): Promise<void> {
  try {
    await callMp(supabase, "nudge", { game_id: gameId });
  } catch (err) {
    if (err instanceof MpError && err.status === 404 && /unknown route/i.test(err.message)) {
      const { error } = await supabase.rpc("mp_nudge", { p_game_id: gameId });
      if (error) throw error;
      return;
    }
    throw err;
  }
}

/** Asks the server to push about a friend request / acceptance you just made
 * (those are written by SQL, which can't push). Fire-and-forget. */
export function pushFriendEvent(supabase: SupabaseClient, targetUserId: string): void {
  callMp(supabase, "friend_push", { target_id: targetUserId }).catch(() => {});
}

/** Starts a fresh game with the same line-up as a finished one. `seats` is
 * everyone except `myUserId` (the function seats the host at 0). */
export async function rematchMpGame(
  supabase: SupabaseClient,
  players: { seat: number; isAI: boolean; difficulty?: string; name: string; userId?: string }[],
  myUserId: string,
  contractRounds: number[],
  turnLimitHours?: number
): Promise<{ game_id: string }> {
  const seats: NewGameSeat[] = players
    .filter((p) => !(p.userId && p.userId === myUserId))
    .map((p) =>
      p.isAI
        ? { kind: "ai" as const, difficulty: p.difficulty ?? "medium", name: p.name }
        : { kind: "human" as const, user_id: p.userId! }
    )
    .filter((s) => s.kind === "ai" || !!s.user_id);
  return createMpGame(supabase, { contractRounds, seats, turnLimitHours });
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
  /** Turn clock (migration 0061); absent on an older database. */
  turn_limit_hours?: number;
  turn_started_at?: string | null;
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
