// Client side of the rotating daily/weekly quests (catalog + rules in
// src/quests.ts; the server-side baselines/claims in solo-verify, migration
// 0056). This file only READS what the server wrote — the per-period
// baseline snapshots and the ledger rows that mark a quest as paid — and
// turns it into display state. Nothing here credits XP or decides that a
// quest is done; the server does, idempotently, and the app just shows it.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMetricSnapshot,
  currentPeriodKey,
  MetricSnapshot,
  QuestPeriod,
  questLedgerRef,
  questsForPeriod,
  QuestStatus,
  questStatuses,
} from "@/quests";
import { nextUtcMidnight, nextUtcWeekStart } from "@/dailyRewards";
import type { AchievementProgressState } from "@/achievements";
import { withSessionCounters } from "./pendingProgress";

export interface QuestServerState {
  /** period key -> snapshot the server took when it first saw the account in that period. */
  baselines: Record<string, MetricSnapshot>;
  /** Ledger refs of quests already paid out. */
  claimedRefs: Set<string>;
}

export const EMPTY_QUEST_STATE: QuestServerState = { baselines: {}, claimedRefs: new Set() };

export interface QuestPeriodView {
  period: QuestPeriod;
  periodKey: string;
  statuses: QuestStatus[];
  /** Epoch ms of the next reset. */
  resetsAt: number;
}

/** Reads the caller's baselines + paid quest refs for the live periods
 * (owner-read RLS on both tables — migration 0056). Throws on a read error
 * (e.g. 0056 not applied) so callers can hide the card. */
export async function loadQuestServerState(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<QuestServerState> {
  const periods: QuestPeriod[] = ["daily", "weekly"];
  const keys = periods.map((p) => currentPeriodKey(p, now));
  const refs = periods.flatMap((p, i) => questsForPeriod(p, keys[i]).map((q) => questLedgerRef(keys[i], q.id)));

  const [baselineRes, ledgerRes] = await Promise.all([
    supabase.from("quest_baselines").select("period_key, baseline").eq("user_id", userId).in("period_key", keys),
    supabase.from("xp_ledger").select("ref").eq("user_id", userId).in("ref", refs),
  ]);
  if (baselineRes.error) throw baselineRes.error;
  if (ledgerRes.error) throw ledgerRes.error;

  const baselines: Record<string, MetricSnapshot> = {};
  for (const row of (baselineRes.data ?? []) as { period_key: string; baseline: MetricSnapshot }[]) {
    baselines[row.period_key] = row.baseline ?? {};
  }
  return {
    baselines,
    claimedRefs: new Set(((ledgerRes.data ?? []) as { ref: string }[]).map((r) => r.ref)),
  };
}

/** Both periods' quests with progress. `progress` is the account's verified
 * progress (PlayerLevelContext); `sessionCounters` is this device's
 * not-yet-verified in-progress-game counters, merged in for immediacy only —
 * the same display-only estimate pendingProgress.ts gives the "closest
 * achievement" card. A guest (no progress) just sees every quest at 0. */
export function buildQuestViews(
  server: QuestServerState,
  progress: AchievementProgressState | null,
  sessionCounters: Record<string, number> | null,
  now: Date = new Date()
): QuestPeriodView[] {
  const shown = progress ? withSessionCounters(progress, sessionCounters) : null;
  const current = buildMetricSnapshot(
    shown ? { games_played: shown.gamesPlayed, games_won: shown.gamesWon } : null,
    shown?.counters
  );
  return (["daily", "weekly"] as const).map((period) => {
    const periodKey = currentPeriodKey(period, now);
    return {
      period,
      periodKey,
      statuses: questStatuses(period, periodKey, server.baselines[periodKey], current, server.claimedRefs),
      resetsAt: period === "daily" ? nextUtcMidnight(now) : nextUtcWeekStart(now),
    };
  });
}

/** "5h 12m" / "2d 3h" / "8m" pieces for the reset countdown; the caller
 * localises them via the quests.time.* keys. */
export function splitDuration(ms: number): { d: number; h: number; m: number } {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  return { d: Math.floor(totalMinutes / 1440), h: Math.floor((totalMinutes % 1440) / 60), m: totalMinutes % 60 };
}
