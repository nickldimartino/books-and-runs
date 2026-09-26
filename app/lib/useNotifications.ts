"use client";

// One hook behind every "something needs your attention" badge in the app:
// pending friend requests + incoming game invites + games where it's your
// turn, summed into `total`. Keeps a single Supabase Realtime channel
// subscribed to the relevant tables and refetches on any change (plus an
// exposed `refresh()`). Replaced the old separate useFriendActivity /
// useMpActivity hooks.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { getFriendRequests } from "./friendsStore";
import { getMyMpGames, MpGameSummary } from "./mpStore";
import { isChannelDead, useResumeRefresh } from "./resumeRefresh";
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
export function useNotifications(enabled = true): Notifications {
  const { user: authUser } = useAuth();
  // `enabled` false (in-game screens, where the app nav that shows these
  // badges is hidden) behaves like signed out: no fetch, no Realtime channel.
  const user = enabled ? authUser : null;
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

  const resubscribeRef = useRef<() => void>(() => {});
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Keep the account's UTC offset fresh for push quiet hours (migration 0062).
  useEffect(() => {
    if (!supabase || !user) return;
    const offset = -new Date().getTimezoneOffset();
    supabase
      .from("settings")
      .upsert({ user_id: user.id, tz_offset_minutes: offset, updated_at: new Date().toISOString() })
      .then(({ error }) => {
        if (error) console.debug("tz offset not synced:", error.message);
      });
  }, [user]);

  useEffect(() => {
    refresh();
    if (!supabase || !user) return;
    const client = supabase;
    let everSubscribed = false;
    const open = () => client
      .channel(`notifications-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "mp_games" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "mp_participants" }, () => refresh())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mp_events", filter: `user_id=eq.${user.id}` },
        () => refresh()
      )
      .subscribe((status: string) => {
        if (status !== "SUBSCRIBED") return;
        if (everSubscribed) refresh();
        everSubscribed = true;
      });
    let channel = open();
    resubscribeRef.current = () => {
      if (!isChannelDead(Reflect.get(channel, "state"))) return;
      client.removeChannel(channel);
      channel = open();
    };
    return () => {
      resubscribeRef.current = () => {};
      client.removeChannel(channel);
    };
  }, [user, refresh]);

  // Back from the background / network: refetch the badge + revive realtime.
  useResumeRefresh(() => {
    resubscribeRef.current();
    refreshRef.current();
  }, !!user);

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
