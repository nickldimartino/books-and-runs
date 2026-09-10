"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { getFriendRequests } from "./friendsStore";
import { getMyMpGames, MpGameSummary } from "./mpStore";
import { supabase } from "./supabaseClient";

export interface Notifications {
  friendRequests: number;
  gameRequests: number;
  yourTurn: number;
  /** Everything that wants the player's attention right now. */
  total: number;
  mpGames: MpGameSummary[];
  loading: boolean;
  refresh: () => void;
}

/**
 * One place for every "something needs you" count — friend requests, game
 * invites, and games where it's your turn — behind a single Realtime
 * subscription. Replaces the separate friend / multiplayer activity hooks so
 * the Home screen has one badge, not two systems.
 */
export function useNotifications(): Notifications {
  const { user } = useAuth();
  const [friendRequests, setFriendRequests] = useState(0);
  const [mpGames, setMpGames] = useState<MpGameSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!supabase || !user) {
      setFriendRequests(0);
      setMpGames([]);
      setLoading(false);
      return;
    }
    Promise.allSettled([getFriendRequests(supabase), getMyMpGames(supabase)]).then(([reqRes, gamesRes]) => {
      if (reqRes.status === "fulfilled") {
        setFriendRequests(reqRes.value.filter((r) => r.direction === "incoming").length);
      }
      if (gamesRes.status === "fulfilled") setMpGames(gamesRes.value);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    refresh();
    if (!supabase || !user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => refresh())
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

  const gameRequests = mpGames.filter((g) => g.invite_status === "invited").length;
  const yourTurn = mpGames.filter(
    (g) => g.invite_status === "accepted" && g.status === "active" && g.turn_user_id === user?.id
  ).length;

  return {
    friendRequests,
    gameRequests,
    yourTurn,
    total: friendRequests + gameRequests + yourTurn,
    mpGames,
    loading,
    refresh,
  };
}
