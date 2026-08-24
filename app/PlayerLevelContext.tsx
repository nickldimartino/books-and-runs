"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { levelProgress, LevelProgress } from "@/leveling";
import { useAuth } from "./AuthContext";
import { loadAchievementProgressState } from "./lib/loadAchievementProgress";
import { supabase } from "./lib/supabaseClient";

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

  const load = useCallback(async (): Promise<LevelProgress | null> => {
    if (!supabase || !user) {
      setLevel(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    const state = await loadAchievementProgressState(supabase, user.id);
    const fresh = levelProgress(state);
    setLevel(fresh);
    setLoading(false);
    return fresh;
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
