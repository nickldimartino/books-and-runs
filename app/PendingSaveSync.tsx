"use client";

import { useCallback, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { syncLeaderboardStats } from "./lib/leaderboardStore";
import {
  isActiveForegroundGame,
  loadPendingSaves,
  removePendingSave,
} from "./lib/pendingSaveQueue";
import { supabase } from "./lib/supabaseClient";
import { verifySoloGame } from "./lib/verifySoloGame";
import { usePlayerLevel } from "./PlayerLevelContext";

/**
 * Finishes syncing any games that couldn't save while offline — see
 * GameOverScreen's attemptSave, which queues a game here the moment a
 * verifySoloGame call fails to even reach Supabase, so it survives
 * navigating away or closing the app entirely. Runs on mount (covers
 * "reopen the app once you're back online") and whenever the browser
 * regains connectivity while the app's already open. There's no true
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

    // Order matters: the server derives games_played/average_score from
    // whatever's already stored, so queued games sync one at a time, in
    // the order they were played, not all at once.
    for (const entry of queue) {
      if (isActiveForegroundGame(entry.id)) continue;

      try {
        await verifySoloGame(supabase, entry.payload);
        removePendingSave(entry.id);
        syncedAny = true;
      } catch (err) {
        console.error("Failed to sync queued game:", err);
        // Same reasoning as GameOverScreen's own attemptSave: a
        // verification rejection is deterministic (the exact same payload
        // will fail again identically), so drop it rather than retrying
        // forever — only a genuinely transient failure stays queued.
        const status = (err as { status?: number } | null)?.status;
        const permanentRejection = typeof status === "number" && status >= 400 && status < 500;
        if (permanentRejection) {
          removePendingSave(entry.id);
        } else {
          // Still offline (or a real server error) — stop rather than
          // churning through the rest of an ordered queue that's going to
          // fail the same way.
          break;
        }
      }
    }

    if (syncedAny) {
      refreshLevel();
      // Same reasoning as GameOverScreen's own call: best-effort, so a
      // queued game recovering here doesn't also need its leaderboard row
      // to succeed before the underlying player_stats/achievement_counters
      // writes above are considered done. Without this, an offline-then-
      // recovered game correctly updated the account's real stats but left
      // the leaderboard showing stale numbers until some *other* trigger
      // (a later game, or opening Account/Leaderboard) happened to sync it.
      syncLeaderboardStats(supabase, user.id).catch((err) => {
        console.error("Failed to sync leaderboard entry:", err);
      });
    }
  }, [user, refreshLevel]);

  useEffect(() => {
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  return null;
}
