"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { supabase } from "./supabaseClient";
import { getFriendRequests } from "./friendsStore";

/**
 * Small shared hook for the "you have friend requests" badge on Home and the
 * Friends page. Counts incoming pending requests and keeps the number live
 * off Realtime (mp_events + friendships from migration 0009), so a request
 * that arrives while the app is open bumps the badge without a refresh.
 *
 * Stage 4 extends this into the fuller multiplayer badge
 * ({ friendRequests, gameRequests, yourTurnGames }).
 */
export function useFriendActivity(): { incomingRequests: number; refresh: () => void } {
  const { user } = useAuth();
  const [incomingRequests, setIncomingRequests] = useState(0);

  const refresh = useCallback(() => {
    if (!supabase || !user) {
      setIncomingRequests(0);
      return;
    }
    getFriendRequests(supabase)
      .then((reqs) => setIncomingRequests(reqs.filter((r) => r.direction === "incoming").length))
      .catch((err) => console.error("Failed to load friend requests:", err));
  }, [user]);

  useEffect(() => {
    refresh();
    if (!supabase || !user) return;

    const channel = supabase
      .channel(`friend-activity-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mp_events", filter: `user_id=eq.${user.id}` },
        () => refresh()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => refresh())
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [user, refresh]);

  return { incomingRequests, refresh };
}
