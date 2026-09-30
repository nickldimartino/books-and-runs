import type { SupabaseClient } from "@supabase/supabase-js";
import { findStoreItem } from "./storeCatalog";

export interface ReceivedGift {
  id: string;
  sku: string;
  itemName: string;
  /** Null when the sender's account has no display name set, or the event
   * predates a resolvable actor for some other reason — the bell still
   * shows a generic "a friend" line rather than hiding the gift. */
  fromName: string | null;
  createdAt: string;
}

interface GiftEventRow {
  id: string;
  actor_id: string | null;
  payload: { sku?: string } | null;
  created_at: string;
}

/**
 * "A friend gifted you a Boutique item" events — mp_events rows (migration
 * 0009's per-user inbox, RLS: owner read only) with kind 'gift_received',
 * written by stripe-webhook (migration 0099) once a gift's Checkout
 * Session completes. Capped the same way every other bell source is (a
 * handful of recent ones, not a full history) — see notificationItems.ts.
 *
 * The sender's name is resolved in a second, batched query against
 * `leaderboard_entries` (publicly readable to any signed-in account, same
 * as every other "show a friend's name" lookup in this app) rather than a
 * join, since mp_events has no FK relationship Postgrest could follow.
 */
export async function getRecentGifts(supabase: SupabaseClient, limit = 10): Promise<ReceivedGift[]> {
  const { data, error } = await supabase
    .from("mp_events")
    .select("id, actor_id, payload, created_at")
    .eq("kind", "gift_received")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as GiftEventRow[];
  if (rows.length === 0) return [];

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id))];
  const names = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: entries } = await supabase.from("leaderboard_entries").select("user_id, display_name").in("user_id", actorIds);
    for (const e of entries ?? []) names.set(e.user_id as string, e.display_name as string | null);
  }

  return rows.map((r) => {
    const sku = r.payload?.sku ?? "";
    return {
      id: r.id,
      sku,
      itemName: findStoreItem(sku)?.name ?? sku,
      fromName: r.actor_id ? (names.get(r.actor_id) ?? null) : null,
      createdAt: r.created_at,
    };
  });
}
