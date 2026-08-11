"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { AchievementProgressState, EMPTY_PROGRESS_STATE } from "@/achievements";
import { levelProgress, LevelProgress } from "@/leveling";
import { useAuth } from "./AuthContext";
import { supabase } from "./lib/supabaseClient";

interface PlayerStatsRow {
  games_played: number;
  games_won: number;
  wins_by_difficulty: Record<string, number>;
}

interface AchievementCountersRow {
  counters: Record<string, number>;
}

interface PlayerLevelContextValue {
  level: LevelProgress | null;
  loading: boolean;
  /** Re-fetches from Supabase and returns the fresh value — call after a
   * game finishes (see GameOverScreen) so the level updates without waiting
   * for a reload, and so the caller can diff against the pre-game level to
   * show XP gained this game. */
  refresh: () => Promise<LevelProgress | null>;
}

const PlayerLevelContext = createContext<PlayerLevelContextValue | null>(null);

/**
 * Your account level, derived the same way Achievements are: a pure
 * function (src/leveling.ts) of player_stats + achievement_counters. No XP
 * total is stored anywhere — it's recomputed from those two tables every
 * time, so there's nothing new to keep in sync or ever go stale on its own.
 * Mounted once in the root layout so both Home and the game screen can show
 * it without independent, possibly-inconsistent fetches.
 */
export function PlayerLevelProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [level, setLevel] = useState<LevelProgress | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback((): Promise<LevelProgress | null> => {
    if (!supabase || !user) {
      setLevel(null);
      setLoading(false);
      return Promise.resolve(null);
    }
    setLoading(true);
    return Promise.all([
      supabase
        .from("player_stats")
        .select("games_played, games_won, wins_by_difficulty")
        .eq("user_id", user.id)
        .maybeSingle<PlayerStatsRow>(),
      supabase
        .from("achievement_counters")
        .select("counters")
        .eq("user_id", user.id)
        .maybeSingle<AchievementCountersRow>(),
    ]).then(([statsRes, countersRes]) => {
      const state: AchievementProgressState = {
        ...EMPTY_PROGRESS_STATE,
        counters: countersRes.data?.counters ?? {},
        gamesPlayed: statsRes.data?.games_played ?? 0,
        gamesWon: statsRes.data?.games_won ?? 0,
        winsByDifficulty: statsRes.data?.wins_by_difficulty ?? {},
      };
      const fresh = levelProgress(state);
      setLevel(fresh);
      setLoading(false);
      return fresh;
    });
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PlayerLevelContext.Provider value={{ level, loading, refresh: load }}>
      {children}
    </PlayerLevelContext.Provider>
  );
}

export function usePlayerLevel(): PlayerLevelContextValue {
  const ctx = useContext(PlayerLevelContext);
  if (!ctx) throw new Error("usePlayerLevel must be used within a PlayerLevelProvider");
  return ctx;
}
