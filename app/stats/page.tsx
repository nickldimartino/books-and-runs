"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "../AuthContext";
import { playerProfileHref } from "../lib/leaderboardStore";

// /stats was folded into the profile page (see app/player/page.tsx's own
// doc) — a player only ever has the one profile, so keeping "public
// profile" and "your private stats" as two separate pages was redundant.
// This route just forwards anyone with an old link/bookmark.
export default function StatsRedirect() {
  const router = useRouter();
  const { loading, user } = useAuth();
  useEffect(() => {
    if (loading) return;
    router.replace(user ? playerProfileHref(user.id) : "/player");
  }, [loading, user, router]);
  return null;
}
