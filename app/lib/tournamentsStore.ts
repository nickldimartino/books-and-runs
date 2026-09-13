import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Thin wrappers over the tournament RPCs from migration 0041. A tournament
 * is a fixed roster playing a fixed number of ordinary multiplayer games
 * back-to-back (round-robin series, not an elimination bracket — see that
 * migration's own doc for why) — this file never talks to the `mp` Edge
 * Function itself; round 1 and every later round are created the normal
 * way (mpStore.ts's createMpGame/rematchMpGame) and just *linked in* here
 * via tournament_create/tournament_add_round.
 */

export interface TournamentSummary {
  tournamentId: string;
  name: string;
  hostId: string;
  clubId: string | null;
  totalRounds: number;
  roundsPlayed: number;
  cancelled: boolean;
  createdAt: string;
}

interface TournamentRow {
  tournament_id: string;
  name: string;
  host_id: string;
  club_id: string | null;
  total_rounds: number;
  rounds_played: number;
  cancelled: boolean;
  created_at: string;
}

export interface TournamentRound {
  roundNumber: number;
  gameId: string;
  status: "pending" | "active" | "complete" | "cancelled";
}

interface RoundRow {
  round_number: number;
  game_id: string;
  status: string;
}

export interface TournamentStanding {
  userId: string;
  displayName: string | null;
  gamesPlayed: number;
  gamesWon: number;
  totalScore: number;
}

interface StandingRow {
  user_id: string;
  display_name: string | null;
  games_played: number;
  games_won: number;
  total_score: number;
}

/** Links an already-created mp_games row (createMpGame, called first, same
 * as starting any other multiplayer game) as round 1 of a brand-new
 * tournament. Returns the new tournament id. */
export async function createTournament(
  supabase: SupabaseClient,
  args: { name: string; totalRounds: number; contractRounds: number[]; clubId: string | null; gameId: string }
): Promise<string> {
  const { data, error } = await supabase.rpc("tournament_create", {
    p_name: args.name,
    p_total_rounds: args.totalRounds,
    p_contract_rounds: args.contractRounds,
    p_club_id: args.clubId,
    p_game_id: args.gameId,
  });
  if (error) throw error;
  return data as string;
}

/** Links a freshly-rematched mp_games row as the series' next round.
 * Returns the round number it was assigned. */
export async function addTournamentRound(
  supabase: SupabaseClient,
  tournamentId: string,
  gameId: string
): Promise<number> {
  const { data, error } = await supabase.rpc("tournament_add_round", {
    p_tournament_id: tournamentId,
    p_game_id: gameId,
  });
  if (error) throw error;
  return data as number;
}

export async function cancelTournament(supabase: SupabaseClient, tournamentId: string): Promise<void> {
  const { error } = await supabase.rpc("tournament_cancel", { p_tournament_id: tournamentId });
  if (error) throw error;
}

export async function getMyTournaments(supabase: SupabaseClient): Promise<TournamentSummary[]> {
  const { data, error } = await supabase.rpc("tournament_my_list");
  if (error) throw error;
  return ((data as TournamentRow[]) ?? []).map((r) => ({
    tournamentId: r.tournament_id,
    name: r.name,
    hostId: r.host_id,
    clubId: r.club_id,
    totalRounds: r.total_rounds,
    roundsPlayed: r.rounds_played,
    cancelled: r.cancelled,
    createdAt: r.created_at,
  }));
}

/** One tournament's own name/host/club/round-count — tournaments are
 * RLS-readable directly (no RPC needed for a single-row lookup). */
export async function getTournament(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<{ id: string; name: string; hostId: string; clubId: string | null; totalRounds: number; cancelled: boolean } | null> {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, host_id, club_id, total_rounds, cancelled_at")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    hostId: data.host_id,
    clubId: data.club_id,
    totalRounds: data.total_rounds,
    cancelled: data.cancelled_at !== null,
  };
}

export async function getTournamentRounds(supabase: SupabaseClient, tournamentId: string): Promise<TournamentRound[]> {
  const { data, error } = await supabase.rpc("tournament_rounds", { p_tournament_id: tournamentId });
  if (error) throw error;
  return ((data as RoundRow[]) ?? []).map((r) => ({
    roundNumber: r.round_number,
    gameId: r.game_id,
    status: r.status as TournamentRound["status"],
  }));
}

export async function getTournamentStandings(supabase: SupabaseClient, tournamentId: string): Promise<TournamentStanding[]> {
  const { data, error } = await supabase.rpc("tournament_standings", { p_tournament_id: tournamentId });
  if (error) throw error;
  return ((data as StandingRow[]) ?? []).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    gamesPlayed: r.games_played,
    gamesWon: r.games_won,
    totalScore: r.total_score,
  }));
}

/** Which tournament (if any) a given mp_games row belongs to — used by the
 * multiplayer game screen to show "Round N of M · <tournament>" once that
 * game ends. Reads tournament_games directly (RLS: participant read), no
 * RPC needed. */
export async function getTournamentForGame(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ tournamentId: string; roundNumber: number } | null> {
  const { data, error } = await supabase
    .from("tournament_games")
    .select("tournament_id, round_number")
    .eq("game_id", gameId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { tournamentId: data.tournament_id, roundNumber: data.round_number };
}
