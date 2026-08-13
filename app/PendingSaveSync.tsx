"use client";

import { useCallback, useEffect } from "react";
import { useAuth } from "./AuthContext";
import {
  isActiveForegroundGame,
  loadPendingSaves,
  removePendingSave,
  upsertPendingSave,
} from "./lib/pendingSaveQueue";
import { recordAchievementProgress } from "./lib/recordAchievementProgress";
import { recordGameResult } from "./lib/recordGameResult";
import { supabase } from "./lib/supabaseClient";
import { usePlayerLevel } from "./PlayerLevelContext";

/**
 * Finishes syncing any games that couldn't save while offline — see
 * GameOverScreen's attemptSave, which queues a game here the moment a save
 * fails so it survives navigating away or closing the app entirely. Runs on
 * mount (covers "reopen the app once you're back online") and whenever the
 * browser regains connectivity while the app's already open. There's no true
 * background sync here — Safari has never implemented the Background Sync
 * API, so nothing can flush the queue while the app isn't actually open.
 * Renders nothing; mounted once in the root layout.
 */
export function PendingSaveSync() {
  const { user } = useAuth();
  const { refresh: refreshLevel } = usePlayerLevel();

  const flush = useCallback(async () => {
    if (!supabase || !user) return;
    const queue = loadPendingSaves().filter((entry) => entry.userId === user.id);
    let syncedAny = false;

    // Order matters: recordGameResult derives games_played/average_score
    // from whatever's already stored, so queued games sync one at a time,
    // in the order they were played, not all at once.
    for (const entry of queue) {
      if (isActiveForegroundGame(entry.id)) continue;

      const [gameResult, achievementResult] = await Promise.allSettled([
        entry.gameResultDone
          ? Promise.resolve()
          : recordGameResult(supabase, user.id, entry.state, entry.roundHistory),
        entry.achievementDone
          ? Promise.resolve()
          : recordAchievementProgress(supabase, user.id, entry.counters),
      ]);

      const gameResultDone = entry.gameResultDone || gameResult.status === "fulfilled";
      const achievementDone = entry.achievementDone || achievementResult.status === "fulfilled";

      if (gameResultDone && achievementDone) {
        removePendingSave(entry.id);
        syncedAny = true;
        continue;
      }

      if (gameResult.status === "rejected") {
        console.error("Failed to sync queued game result:", gameResult.reason);
      }
      if (achievementResult.status === "rejected") {
        console.error("Failed to sync queued achievement progress:", achievementResult.reason);
      }
      upsertPendingSave({ ...entry, gameResultDone, achievementDone });
      // Still offline (or a real error) — stop rather than churning through
      // the rest of an ordered queue that's going to fail the same way.
      break;
    }

    if (syncedAny) refreshLevel();
  }, [user, refreshLevel]);

  useEffect(() => {
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  return null;
}
