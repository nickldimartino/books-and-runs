import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { LeaderboardEntry, syncLeaderboardStats } from "../lib/leaderboardStore";
import { supabase } from "../lib/supabaseClient";

function emptyEntry(userId: string): LeaderboardEntry {
  return {
    user_id: userId,
    display_name: null,
    bio: null,
    avatar_kind: "emoji",
    avatar_emoji: null,
    avatar_color: null,
    avatar_photo_path: null,
    showcase: [],
    avatar_frame: null,
    badge: null,
    title: null,
    banner: null,
    joined_at: null,
    is_creator: false,
    is_test_account: false,
    level: 0,
    total_xp: 0,
    achievements_unlocked: 0,
    games_played: 0,
    games_won: 0,
    average_score: null,
    worst_score: null,
    daily_deal_streak: 0,
    daily_deal_best_streak: 0,
    weekly_challenge_best_streak: 0,
    mp_games_played: 0,
    mp_games_won: 0,
    mp_best_win_streak: 0,
    mp_rating: 1200,
    mp_rated_games: 0,
    updated_at: new Date(0).toISOString(),
  };
}

/**
 * Which profile is this, and what does its public row say — the one thing
 * every other part of this page (header, edit dialog, stats, social) needs
 * before it can render anything. A bare "/player" (no `?id=`) means "my own
 * profile" (see the effect's own doc); `isSelf` is what everything else on
 * the page branches on.
 */
export function usePlayerIdentity(user: User | null) {
  const [profileId, setProfileId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // A bare "/player" (no `?id=`) means "my own profile" — UnlockToast and
    // this page's own Account tip both link that way rather than building
    // playerProfileHref(user.id) themselves. Without this fallback,
    // profileId stayed null forever for a signed-in visitor (nothing below
    // ever loads without one), so the page just hung on its loading
    // spinner. Re-runs once `user` resolves, since auth loads async and
    // may not be ready on the first pass.
    const idParam = new URLSearchParams(window.location.search).get("id");
    if (idParam) setProfileId(idParam);
    else if (user) setProfileId(user.id);
  }, [user]);

  const [entry, setEntry] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const isSelf = !!user && !!profileId && user.id === profileId;

  useEffect(() => {
    if (!supabase || !user || !profileId) return;
    let cancelled = false;
    const client = supabase;
    setLoading(true);
    setLoadError(false);
    (async () => {
      // A self-view self-heals its own row first — same reasoning as
      // Account/Leaderboard's own sync-on-visit (a past failed sync, or an
      // account that predates a stats column entirely).
      if (profileId === user.id) {
        await syncLeaderboardStats(client, profileId, user.created_at).catch((err) =>
          console.error("Failed to sync leaderboard stats (a missing migration would fail silently otherwise):", err)
        );
      }
      const { data, error } = await client.from("leaderboard_entries").select("*").eq("user_id", profileId).maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("Failed to load profile:", error);
        setLoadError(true);
      } else {
        const row = (data as LeaderboardEntry | null) ?? emptyEntry(profileId);
        setEntry(row);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, profileId]);

  return { profileId, entry, setEntry, loading, loadError, isSelf };
}
