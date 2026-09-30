import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { getFriendRequests, getFriends, sendFriendRequest } from "../lib/friendsStore";
import { getMyMpHistory, MpHistoryEntry } from "../lib/mpStore";
import { blockUser } from "../lib/safetyStore";
import { supabase } from "../lib/supabaseClient";
import { useT } from "../lib/i18n/LocaleProvider";

export interface HeadToHead {
  wins: number;
  losses: number;
  ties: number;
  gamesTogether: number;
}

/**
 * Everything about viewing SOMEONE ELSE's profile — friend status, the
 * head-to-head record against them, and report/block. All effects no-op
 * for a self-view (`isSelf`) since none of this is meaningful there; kept
 * as one hook rather than three because they share that same guard and are
 * only ever consumed together, by the same "other person's profile" UI.
 */
export function usePlayerSocial(user: User | null, profileId: string | null | undefined, isSelf: boolean) {
  const { t } = useT();

  // Friend status (only meaningful for someone else's profile).
  const [related, setRelated] = useState<"none" | "related" | "requested">("none");
  useEffect(() => {
    if (!supabase || !user || !profileId || isSelf) return;
    Promise.all([getFriends(supabase), getFriendRequests(supabase)])
      .then(([friends, requests]) => {
        const isRelated =
          friends.some((f) => f.userId === profileId) || requests.some((r) => r.otherUserId === profileId);
        setRelated(isRelated ? "related" : "none");
      })
      .catch((err) => console.error("Failed to load friend state:", err));
  }, [user, profileId, isSelf]);

  async function addFriend() {
    if (!supabase || !profileId) return;
    setRelated("requested");
    try {
      await sendFriendRequest(supabase, profileId);
    } catch (err) {
      console.error("Add friend failed:", err);
      setRelated("none");
    }
  }

  // ── Head-to-head record (only meaningful for someone else's profile) ───
  // Your own multiplayer history, not theirs — mp_my_history only ever
  // returns games *you* played in, filtered here to the ones this
  // profile's account also sat at. "Beat them" means your score was
  // better in a game you both finished, independent of who won the whole
  // table — the closest a >2-player game has to a real 1v1 record.
  const [h2hHistory, setH2hHistory] = useState<MpHistoryEntry[]>([]);
  useEffect(() => {
    if (!supabase || !user || !profileId || isSelf) {
      setH2hHistory([]);
      return;
    }
    getMyMpHistory(supabase, 200)
      .then(setH2hHistory)
      .catch((err) => console.error("Failed to load head-to-head history:", err));
  }, [user, profileId, isSelf]);

  const headToHead = useMemo<HeadToHead | null>(() => {
    if (!user || !profileId || isSelf) return null;
    let wins = 0;
    let losses = 0;
    let ties = 0;
    for (const g of h2hHistory) {
      const me = g.seats.find((s) => s.userId === user.id);
      const them = g.seats.find((s) => s.userId === profileId);
      if (!me || !them) continue;
      const myScore = g.cumulative_scores[String(me.seat)];
      const theirScore = g.cumulative_scores[String(them.seat)];
      if (myScore == null || theirScore == null) continue;
      if (myScore < theirScore) wins++;
      else if (myScore > theirScore) losses++;
      else ties++;
    }
    const gamesTogether = wins + losses + ties;
    return gamesTogether > 0 ? { wins, losses, ties, gamesTogether } : null;
  }, [h2hHistory, user, profileId, isSelf]);

  // ── Report / block (someone else's profile) ───────────────────────────
  const [reporting, setReporting] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [blockedNow, setBlockedNow] = useState(false);

  async function confirmBlock() {
    if (!supabase || !profileId) return;
    setBlockBusy(true);
    setBlockError(null);
    try {
      await blockUser(supabase, profileId);
      setConfirmingBlock(false);
      setBlockedNow(true);
    } catch (err) {
      console.error("Failed to block:", err);
      setBlockError(t("safety.block.error"));
    } finally {
      setBlockBusy(false);
    }
  }

  return {
    related,
    addFriend,
    headToHead,
    reporting,
    setReporting,
    confirmingBlock,
    setConfirmingBlock,
    blockBusy,
    blockError,
    setBlockError,
    blockedNow,
    confirmBlock,
  };
}

export type PlayerSocial = ReturnType<typeof usePlayerSocial>;
