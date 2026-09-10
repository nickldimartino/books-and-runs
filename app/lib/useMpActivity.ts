"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { getMyMpGames, MpGameSummary } from "./mpStore";
import { supabase } from "./supabaseClient";

export interface MpActivity {
  games: MpGameSummary[];
  gameRequests: number;
  yourTurn: number;
  /** Anything that wants the player's attention right now. */
  attention: number;
  loading: boolean;
  refresh: () => void;
}

/**
 * The signed-in account's multiplayer games + request count, kept live off
 * Realtime. Used by the Home multiplayer section and its attention badge.
 */
export function useMpActivity(): MpActivity {
  const { user } = useAuth();
  const [games, setGames] = useState<MpGameSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!supabase || !user) {
      setGames([]);
      setLoading(false);
      return;
    }
    getMyMpGames(supabase)
      .then((g) => setGames(g))
      .catch((err) => console.error("Failed to load multiplayer games:", err))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    refresh();
    if (!supabase || !user) return;
    const channel = supabase
      .channel(`mp-activity-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mp_games" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "mp_participants" }, () => refresh())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mp_events", filter: `user_id=eq.${user.id}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [user, refresh]);

  const gameRequests = games.filter((g) => g.invite_status === "invited").length;
  const yourTurn = games.filter(
    (g) => g.invite_status === "accepted" && g.status === "active" && g.turn_user_id === user?.id
  ).length;

  return { games, gameRequests, yourTurn, attention: gameRequests + yourTurn, loading, refresh };
}
