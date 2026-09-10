import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Thin wrappers over the friend RPCs from migration 0009, in the same shape
 * as leaderboardStore.ts — every call takes the supabase client + relies on
 * the signed-in session for identity; the RPCs themselves enforce who may do
 * what. Display names come back from the RPCs' left-join on
 * leaderboard_entries and are null for an account that never set one; render
 * them through `displayNameFor` from leaderboardStore.
 */

export interface Friend {
  userId: string;
  displayName: string | null;
  friendsSince: string | null;
}

export interface FriendRequest {
  id: string;
  direction: "incoming" | "outgoing";
  otherUserId: string;
  displayName: string | null;
  createdAt: string;
}

interface FriendRow {
  user_id: string;
  display_name: string | null;
  friends_since: string | null;
}

interface RequestRow {
  id: string;
  direction: "incoming" | "outgoing";
  other_user_id: string;
  display_name: string | null;
  created_at: string;
}

interface LookupRow {
  user_id: string;
  display_name: string | null;
}

/** The signed-in account's own shareable code (e.g. "BR-7K2Q9"). Self-heals
 * a missing profile row, so it's always safe to call. */
export async function getMyFriendCode(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc("mp_my_friend_code");
  if (error) throw error;
  return data as string;
}

/** Resolve a pasted code. Returns null when nothing matches. */
export async function lookupFriendCode(
  supabase: SupabaseClient,
  code: string
): Promise<{ userId: string; displayName: string | null } | null> {
  const { data, error } = await supabase.rpc("mp_lookup_friend_code", { code });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as LookupRow | undefined;
  if (!row) return null;
  return { userId: row.user_id, displayName: row.display_name };
}

export async function getFriends(supabase: SupabaseClient): Promise<Friend[]> {
  const { data, error } = await supabase.rpc("mp_my_friends");
  if (error) throw error;
  return ((data as FriendRow[]) ?? []).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    friendsSince: r.friends_since,
  }));
}

export async function getFriendRequests(supabase: SupabaseClient): Promise<FriendRequest[]> {
  const { data, error } = await supabase.rpc("mp_my_requests");
  if (error) throw error;
  return ((data as RequestRow[]) ?? []).map((r) => ({
    id: r.id,
    direction: r.direction,
    otherUserId: r.other_user_id,
    displayName: r.display_name,
    createdAt: r.created_at,
  }));
}

/** Send a request. If the target already requested you, this accepts it; if
 * you're already friends or already have a pending request out, it's a
 * no-op — none of which surface as an error. */
export async function sendFriendRequest(supabase: SupabaseClient, targetUserId: string): Promise<void> {
  const { error } = await supabase.rpc("mp_send_friend_request", { target: targetUserId });
  if (error) throw error;
}

export async function respondToFriendRequest(
  supabase: SupabaseClient,
  requestId: string,
  accept: boolean
): Promise<void> {
  const { error } = await supabase.rpc("mp_respond_friend_request", {
    request_id: requestId,
    accept,
  });
  if (error) throw error;
}

/** Unfriend, or cancel your own still-pending outgoing request. */
export async function removeFriend(supabase: SupabaseClient, otherUserId: string): Promise<void> {
  const { error } = await supabase.rpc("mp_remove_friend", { other: otherUserId });
  if (error) throw error;
}
