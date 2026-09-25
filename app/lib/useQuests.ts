"use client";

// Home's quest state: asks solo-verify to snapshot/auto-claim (a quest can
// complete through multiplayer, which never passes through Home), reads the
// server rows back, and re-derives the view every minute so the reset
// countdown stays live and a UTC-midnight rollover swaps in the new quests.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../AuthContext";
import { usePlayerLevel } from "../PlayerLevelContext";
import { currentPeriodKey } from "@/quests";
import { buildQuestViews, EMPTY_QUEST_STATE, loadQuestServerState, QuestPeriodView, QuestServerState } from "./questsStore";
import { loadPendingSessionCounters } from "./pendingProgress";
import { supabase } from "./supabaseClient";
import { ClaimedQuest, syncQuests } from "./verifySoloGame";

const TICK_MS = 60_000;

export interface UseQuests {
  views: QuestPeriodView[];
  /** False when signed out or the server side isn't available (migration
   * 0056 / the redeployed function not live yet) — the card then shows the
   * sign-in state (guest) or is hidden (unavailable). */
  earning: boolean;
  unavailable: boolean;
  /** Quests newly paid out by the sync on this visit, for the toast. */
  justClaimed: ClaimedQuest[];
  dismissClaimed: () => void;
  now: Date;
}

export function useQuests(): UseQuests {
  const { user } = useAuth();
  const { progress, refresh } = usePlayerLevel();
  const [now, setNow] = useState(() => new Date());
  const [server, setServer] = useState<QuestServerState>(EMPTY_QUEST_STATE);
  const [unavailable, setUnavailable] = useState(false);
  const [justClaimed, setJustClaimed] = useState<ClaimedQuest[]>([]);
  const [sessionCounters, setSessionCounters] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    setSessionCounters(loadPendingSessionCounters());
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // A new UTC day / ISO week means new quests and (server-side) new baselines.
  const periodSignature = `${currentPeriodKey("daily", now)}|${currentPeriodKey("weekly", now)}`;
  const userId = user?.id;

  const load = useCallback(async () => {
    if (!supabase || !userId) return;
    let claimed: ClaimedQuest[] = [];
    try {
      claimed = await syncQuests(supabase);
    } catch {
      // Server without quests support (function not redeployed yet) or a
      // transient failure — fall through and still try to show what's there.
    }
    try {
      setServer(await loadQuestServerState(supabase, userId));
      setUnavailable(false);
    } catch {
      setUnavailable(true);
      return;
    }
    if (claimed.length > 0) {
      setJustClaimed(claimed);
      refresh().catch(() => {});
    }
    // refresh identity changes with `user` inside PlayerLevelProvider; the
    // period signature is the real trigger for a re-sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, periodSignature]);

  useEffect(() => {
    if (!userId) {
      setServer(EMPTY_QUEST_STATE);
      setUnavailable(false);
      return;
    }
    load();
  }, [userId, load]);

  const views = useMemo(
    () => buildQuestViews(server, userId ? progress : null, sessionCounters, now),
    [server, userId, progress, sessionCounters, now]
  );

  const dismissClaimed = useCallback(() => setJustClaimed([]), []);

  return { views, earning: !!userId, unavailable, justClaimed, dismissClaimed, now };
}
