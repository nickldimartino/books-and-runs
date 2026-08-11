import { SupabaseClient } from "@supabase/supabase-js";

interface AchievementCountersRow {
  counters: Record<string, number>;
}

/**
 * Merges this game's session counter deltas (see GameContext.tsx's
 * sessionCountersRef) into the signed-in user's running totals in
 * achievement_counters. Called once, at game-over, alongside
 * recordGameResult — same "only a fully-finished game counts" rule that
 * recordGameResult already follows, so quitting mid-game doesn't record
 * partial progress either way.
 */
export async function recordAchievementProgress(
  supabase: SupabaseClient,
  userId: string,
  sessionDeltas: Record<string, number>
): Promise<void> {
  const deltaEntries = Object.entries(sessionDeltas).filter(([, v]) => v !== 0);
  if (deltaEntries.length === 0) return;

  const { data: existing } = await supabase
    .from("achievement_counters")
    .select("counters")
    .eq("user_id", userId)
    .maybeSingle<AchievementCountersRow>();

  const merged: Record<string, number> = { ...(existing?.counters ?? {}) };
  for (const [key, delta] of deltaEntries) {
    merged[key] = (merged[key] ?? 0) + delta;
  }

  await supabase.from("achievement_counters").upsert({
    user_id: userId,
    counters: merged,
    updated_at: new Date().toISOString(),
  });
}
