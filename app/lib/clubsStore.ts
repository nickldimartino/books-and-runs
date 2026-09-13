import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Thin wrappers over the club RPCs from migration 0040, same shape as
 * friendsStore.ts/leaderboardStore.ts — every call takes the supabase
 * client + relies on the signed-in session for identity; the RPCs
 * themselves enforce who may do what (owner-only membership changes, only
 * onto an existing friend, a 24-member cap).
 */

export interface ClubSummary {
  clubId: string;
  name: string;
  ownerId: string;
  memberCount: number;
  createdAt: string;
}

interface ClubRow {
  club_id: string;
  name: string;
  owner_id: string;
  member_count: number;
  created_at: string;
}

export interface ClubStanding {
  userId: string;
  displayName: string | null;
  gamesPlayed: number;
  gamesWon: number;
  bestWinStreak: number;
}

interface StandingRow {
  user_id: string;
  display_name: string | null;
  games_played: number;
  games_won: number;
  best_win_streak: number;
}

export async function createClub(supabase: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await supabase.rpc("club_create", { p_name: name });
  if (error) throw error;
  return data as string;
}

export async function renameClub(supabase: SupabaseClient, clubId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc("club_rename", { p_club_id: clubId, p_name: name });
  if (error) throw error;
}

export async function deleteClub(supabase: SupabaseClient, clubId: string): Promise<void> {
  const { error } = await supabase.rpc("club_delete", { p_club_id: clubId });
  if (error) throw error;
}

export async function addClubMember(supabase: SupabaseClient, clubId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("club_add_member", { p_club_id: clubId, p_user_id: userId });
  if (error) throw error;
}

/** Also how a non-owner leaves — pass their own user id. */
export async function removeClubMember(supabase: SupabaseClient, clubId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("club_remove_member", { p_club_id: clubId, p_user_id: userId });
  if (error) throw error;
}

export async function getMyClubs(supabase: SupabaseClient): Promise<ClubSummary[]> {
  const { data, error } = await supabase.rpc("club_my_clubs");
  if (error) throw error;
  return ((data as ClubRow[]) ?? []).map((r) => ({
    clubId: r.club_id,
    name: r.name,
    ownerId: r.owner_id,
    memberCount: r.member_count,
    createdAt: r.created_at,
  }));
}

/** One club's own name/owner — clubs are RLS-readable directly (no RPC
 * needed for a single-row lookup, unlike the writes above). */
export async function getClub(
  supabase: SupabaseClient,
  clubId: string
): Promise<{ id: string; name: string; ownerId: string } | null> {
  const { data, error } = await supabase.from("clubs").select("id, name, owner_id").eq("id", clubId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, name: data.name, ownerId: data.owner_id };
}

export async function getClubMemberIds(supabase: SupabaseClient, clubId: string): Promise<string[]> {
  const { data, error } = await supabase.from("club_members").select("user_id").eq("club_id", clubId);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id as string);
}

export async function getClubStandings(supabase: SupabaseClient, clubId: string): Promise<ClubStanding[]> {
  const { data, error } = await supabase.rpc("club_standings", { p_club_id: clubId });
  if (error) throw error;
  return ((data as StandingRow[]) ?? []).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    gamesPlayed: r.games_played,
    gamesWon: r.games_won,
    bestWinStreak: r.best_win_streak,
  }));
}
