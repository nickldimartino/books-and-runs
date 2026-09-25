// Not-yet-verified achievement progress from this device's in-progress solo
// saves (regular, Daily Deal, Weekly Challenge), merged on top of the real
// persisted progress for DISPLAY ONLY — the real write still happens once,
// via solo-verify at game-over. Shared by Home's and the profile page's
// "closest achievement" cards so both reflect a mid-round meld.

import type { AchievementProgressState } from "@/achievements";
import { loadDailyDealSave, loadSavedGame, loadWeeklyChallengeSave } from "./localSave";

export function loadPendingSessionCounters(): Record<string, number> | null {
  const merged: Record<string, number> = {};
  for (const save of [loadSavedGame(), loadDailyDealSave(), loadWeeklyChallengeSave()]) {
    if (!save?.sessionCounters) continue;
    for (const [key, amount] of Object.entries(save.sessionCounters)) {
      merged[key] = (merged[key] ?? 0) + amount;
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

export function withSessionCounters<T extends AchievementProgressState | null>(
  progress: T,
  sessionCounters: Record<string, number> | null
): T {
  if (!progress || !sessionCounters || Object.keys(sessionCounters).length === 0) return progress;
  const counters = { ...progress.counters };
  for (const [key, delta] of Object.entries(sessionCounters)) {
    counters[key] = (counters[key] ?? 0) + delta;
  }
  return { ...progress, counters };
}
