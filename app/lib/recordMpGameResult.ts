import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameState } from "@/types";
import type { RedactedView } from "@/mp/types";
import { recordGameResult, RoundHistoryEntry, YOU_PLAYER_ID } from "./recordGameResult";
import { syncLeaderboardStats } from "./leaderboardStore";

/**
 * Records a finished multiplayer game against the signed-in account's normal
 * stats — games played / won, best score, win rate, wins-by-difficulty, XP,
 * achievements, and the leaderboard row — exactly like a game vs. AI. (The
 * separate MP win/loss record is stamped server-side by the Edge Function on
 * mp_participants.outcome; this is the "counts like any game" half.)
 *
 * The per-turn achievement *counters* (wilds drawn, lay-offs made, …) don't
 * grow from MP — those are accumulated by the local game loop, which MP
 * doesn't run. The game-outcome achievement families all do.
 *
 * Builds a minimal GameState from the redacted view: the viewer's seat gets
 * the "human-0" id recordGameResult keys on, everyone else keeps their real
 * name / AI difficulty so opponent difficulty still feeds wins-by-difficulty.
 */
export async function recordMpGameResult(
  supabase: SupabaseClient,
  userId: string,
  view: RedactedView,
  mySeat: number
): Promise<void> {
  if (!view.gameOver) return;

  const players = view.players.map((p) => ({
    id: p.seat === mySeat ? YOU_PLAYER_ID : `seat-${p.seat}`,
    name: p.seat === mySeat ? "You" : p.name,
    isAI: p.isAI,
    difficulty: p.difficulty,
    hand: [],
    hasMeldedContract: false,
    cumulativeScore: p.cumulativeScore,
  }));

  const state = {
    round: view.round,
    selectedContracts: [],
    players,
    currentPlayerIndex: 0,
    drawPile: [],
    discardPile: [],
    melds: [],
    discardHistory: [],
    pickupHistory: [],
    roundOver: true,
    gameOver: true,
  } as unknown as GameState;

  const nameForSeat = new Map(players.map((p, i) => [view.players[i].seat, p.name]));
  const roundHistory: RoundHistoryEntry[] = view.roundResults.map((r) => ({
    round: r.round,
    totals: Object.fromEntries(
      r.scores.map((s) => [nameForSeat.get(s.seat) ?? `Seat ${s.seat}`, s.cumulative])
    ),
  }));

  await recordGameResult(supabase, userId, state, roundHistory);
  await syncLeaderboardStats(supabase, userId).catch((err) =>
    console.error("Failed to sync leaderboard after MP game:", err)
  );
}
