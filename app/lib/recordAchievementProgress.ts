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

  // Both calls' errors were previously discarded (only `data` was ever
  // destructured out), so a failed write — an RLS rejection, a migration
  // that hasn't been run against this project, a network hiccup — looked
  // identical to a successful one: the promise still resolved, the caller's
  // .catch() never fired, and the achievement silently never accumulated.
  // Throwing here lets GameOverScreen's existing .catch(() => setSaved
  // ("error")) actually do its job.
  const { data: existing, error: selectError } = await supabase
    .from("achievement_counters")
    .select("counters")
    .eq("user_id", userId)
    .maybeSingle<AchievementCountersRow>();
  if (selectError) throw selectError;

  const merged: Record<string, number> = { ...(existing?.counters ?? {}) };
  for (const [key, delta] of deltaEntries) {
    merged[key] = (merged[key] ?? 0) + delta;
  }

  const { error: upsertError } = await supabase.from("achievement_counters").upsert({
    user_id: userId,
    counters: merged,
    updated_at: new Date().toISOString(),
  });
  if (upsertError) throw upsertError;
}
