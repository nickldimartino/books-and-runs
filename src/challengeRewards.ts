// The database-facing half of Daily Deal/Weekly Challenge XP and quests,
// written against a tiny structural slice of the Supabase client so the
// `solo-verify` Edge Function (which passes its service-role client) and the
// unit tests (which pass an in-memory fake) run the exact same code. Import-
// light and framework-free like the rest of src/ — the function bundles this
// file (scripts/bundle-solo-verify-engine.mjs).
//
// Every write here is idempotent by construction:
//   * xp_ledger has PRIMARY KEY (user_id, ref) and is written with
//     ON CONFLICT DO NOTHING, returning only the rows actually inserted — so
//     a retry, a replay, or two racing requests credit each ref exactly once
//     and only the winner reports the XP.
//   * the daily/weekly achievement counters are ABSOLUTE values recomputed
//     from the ground-truth completion tables (never "+1"), so re-running
//     just re-sets the same numbers.
//   * quest baselines are ON CONFLICT DO NOTHING, so the first snapshot of a
//     period wins.
// See migration 0056 for the tables and src/dailyRewards.ts / src/quests.ts
// for the rules.

import {
  DAILY_DEAL_XP,
  dailyLedgerRef,
  reachedStreakMilestones,
  streakLedgerRef,
  WEEKLY_CHALLENGE_XP,
  weeklyLedgerRef,
} from "./dailyRewards";
import { dailyShieldStats, weeklyShieldStats } from "./streakShield";
import { buildMetricSnapshot, currentPeriodKey, MetricSnapshot, questLedgerRef, QuestPeriod, questProgress, questsForPeriod } from "./quests";

/** The slice of a Supabase client these helpers use. Deliberately loose
 * (the real client's builder types are generic-heavy) — the function passes
 * its service-role client, tests pass a fake. */
export interface RewardsDb {
  from(table: string): any;
  rpc(fn: string, args: object): PromiseLike<unknown>;
}

export interface ChallengeReward {
  /** Completion XP newly credited by THIS request (0 on a replay/retry). */
  xp: number;
  /** Streak-milestone bonuses newly credited by this request (daily only). */
  streakBonuses: { days: number; xp: number }[];
}

interface LedgerRow {
  ref: string;
  kind: string;
  xp: number;
}

/** After a verified completion row exists in daily_deal_completions /
 * weekly_challenge_completions: refresh the achievement counters and credit
 * the fixed XP (+ any streak milestones). Best-effort — never throws; the
 * completion itself is already recorded and the XP is caught up by the next
 * completion or a retry. */
export async function creditChallengeCompletion(
  db: RewardsDb,
  uid: string,
  kind: "daily" | "weekly",
  key: string
): Promise<ChallengeReward> {
  const none: ChallengeReward = { xp: 0, streakBonuses: [] };
  try {
    const table = kind === "daily" ? "daily_deal_completions" : "weekly_challenge_completions";
    const column = kind === "daily" ? "date" : "week";
    const { data: rows, error: selectError } = await db
      .from(table)
      .select(column)
      .eq("user_id", uid)
      .limit(5000);
    if (selectError || !rows) return none;
    // Shield-aware (src/streakShield.ts): `best` includes single-unit gaps a
    // shield covered, `count` is real completions only (covered units are not
    // plays). Milestone XP stays once-per-milestone via the ledger ref.
    const keys = (rows as Record<string, string>[]).map((r) => String(r[column]));
    const stats = kind === "daily" ? dailyShieldStats(keys) : weeklyShieldStats(keys);

    await db.rpc("solo_verify_set_counters", {
      p_user_id: uid,
      p_patch:
        kind === "daily"
          ? { daily_deals_completed: stats.count, daily_deal_best_streak: stats.best }
          : { weekly_challenges_completed: stats.count, weekly_challenge_best_streak: stats.best },
    });

    const entries: LedgerRow[] = [
      kind === "daily"
        ? { ref: dailyLedgerRef(key), kind: "daily", xp: DAILY_DEAL_XP }
        : { ref: weeklyLedgerRef(key), kind: "weekly", xp: WEEKLY_CHALLENGE_XP },
    ];
    if (kind === "daily") {
      for (const m of reachedStreakMilestones(stats.best)) {
        entries.push({ ref: streakLedgerRef(m.days), kind: "streak", xp: m.xp });
      }
    }
    const { data: inserted, error: ledgerError } = await db
      .from("xp_ledger")
      .upsert(
        entries.map((e) => ({ user_id: uid, ...e })),
        { onConflict: "user_id,ref", ignoreDuplicates: true }
      )
      .select("ref, kind, xp");
    if (ledgerError || !inserted) return none;

    const reward: ChallengeReward = { xp: 0, streakBonuses: [] };
    for (const row of inserted as LedgerRow[]) {
      if (row.kind === "streak") {
        reward.streakBonuses.push({ days: Number(row.ref.split(":")[2]), xp: row.xp });
      } else {
        reward.xp += row.xp;
      }
    }
    reward.streakBonuses.sort((a, b) => a.days - b.days);
    return reward;
  } catch (e) {
    console.error("challenge reward error:", e);
    return none;
  }
}

// ── Quests ──────────────────────────────────────────────────────────────

const QUEST_PERIODS: QuestPeriod[] = ["daily", "weekly"];

async function readMetricSnapshot(db: RewardsDb, uid: string): Promise<MetricSnapshot> {
  const [{ data: stats }, { data: counters }] = await Promise.all([
    db.from("player_stats").select("games_played, games_won").eq("user_id", uid).maybeSingle(),
    db.from("achievement_counters").select("counters").eq("user_id", uid).maybeSingle(),
  ]);
  return buildMetricSnapshot(stats, counters?.counters);
}

/** Writes a baseline for any live period the account doesn't have one for
 * yet. Call BEFORE applying a game's own deltas so that game counts. */
export async function ensureQuestBaselines(db: RewardsDb, uid: string, now: Date = new Date()): Promise<void> {
  const keys = QUEST_PERIODS.map((p) => currentPeriodKey(p, now));
  const { data: existing } = await db
    .from("quest_baselines")
    .select("period_key")
    .eq("user_id", uid)
    .in("period_key", keys);
  const have = new Set(((existing ?? []) as { period_key: string }[]).map((r) => r.period_key));
  const missing = keys.filter((k) => !have.has(k));
  if (missing.length === 0) return;
  const snapshot = await readMetricSnapshot(db, uid);
  await db
    .from("quest_baselines")
    .upsert(
      missing.map((period_key) => ({ user_id: uid, period_key, baseline: snapshot })),
      { onConflict: "user_id,period_key", ignoreDuplicates: true }
    );
}

export interface ClaimedQuest {
  id: string;
  period: QuestPeriod;
  xp: number;
}

/** Credits every completed, not-yet-claimed quest of the live periods and
 * returns just the ones THIS call newly credited. Idempotent. */
export async function claimCompletedQuests(db: RewardsDb, uid: string, now: Date = new Date()): Promise<ClaimedQuest[]> {
  const periods = QUEST_PERIODS.map((period) => ({ period, key: currentPeriodKey(period, now) }));
  const { data: baselines } = await db
    .from("quest_baselines")
    .select("period_key, baseline")
    .eq("user_id", uid)
    .in("period_key", periods.map((p) => p.key));
  if (!baselines || baselines.length === 0) return [];
  const baselineByKey = new Map<string, MetricSnapshot>(
    (baselines as { period_key: string; baseline: MetricSnapshot }[]).map((b) => [b.period_key, b.baseline])
  );

  const current = await readMetricSnapshot(db, uid);
  const due: { ref: string; xp: number; id: string; period: QuestPeriod }[] = [];
  for (const { period, key } of periods) {
    const baseline = baselineByKey.get(key);
    if (!baseline) continue;
    for (const quest of questsForPeriod(period, key)) {
      if (questProgress(quest, baseline, current) >= quest.target) {
        due.push({ ref: questLedgerRef(key, quest.id), xp: quest.xp, id: quest.id, period });
      }
    }
  }
  if (due.length === 0) return [];

  const { data: inserted, error } = await db
    .from("xp_ledger")
    .upsert(
      due.map((d) => ({ user_id: uid, ref: d.ref, kind: "quest", xp: d.xp })),
      { onConflict: "user_id,ref", ignoreDuplicates: true }
    )
    .select("ref");
  if (error || !inserted) return [];
  const newRefs = new Set((inserted as { ref: string }[]).map((r) => r.ref));
  return due.filter((d) => newRefs.has(d.ref)).map(({ id, period, xp }) => ({ id, period, xp }));
}
