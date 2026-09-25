// Rotating daily/weekly quests — the short-cycle goal layer on top of the
// long-tail achievements. Framework-free and import-free (the `solo-verify`
// Edge Function bundles this file; the app imports the same catalog for
// display), so client and server can never disagree on which quests are live
// or what they pay.
//
// How progress works (nothing here trusts a client):
//   * Each quest tracks one already-server-verified metric — `games_played` /
//     `games_won` from player_stats, or an achievement counter such as
//     `books_melded`. Both only ever move through solo-verify / the `mp`
//     Edge Function's verified writes.
//   * Progress = (metric now) - (metric when the quest period began). The
//     "when it began" snapshot is a `quest_baselines` row the server writes
//     the first time it sees the account in a period (migration 0056) — the
//     client can read it but never write it.
//   * Completion pays fixed XP through the same idempotent `xp_ledger` path
//     Daily Deal uses (see dailyRewards.ts); the ledger primary key means a
//     quest can be credited once per period, however often it's claimed.
//
// Which quests are live is a pure function of the period key (UTC day /
// ISO week), seeded, so every client and the server derive the same three.

import { utcDayKey, utcIsoWeekKey } from "./dailyRewards";

export type QuestPeriod = "daily" | "weekly";

/** Quests shown per period. */
export const QUESTS_PER_PERIOD = 3;

export interface QuestDef {
  id: string;
  period: QuestPeriod;
  /** Key into the metric snapshot: "games_played", "games_won", or an
   * achievement counter key (see src/achievements.ts). */
  metric: string;
  target: number;
  xp: number;
}

// Order is part of the seed contract: appending is safe, reordering or
// removing changes which quests an in-flight period shows (harmless, but it
// would shuffle today's set for players who've already started).
export const QUEST_CATALOG: readonly QuestDef[] = [
  // Daily — small, achievable in one or two games.
  { id: "d_play", period: "daily", metric: "games_played", target: 2, xp: 20 },
  { id: "d_win", period: "daily", metric: "games_won", target: 1, xp: 30 },
  { id: "d_books", period: "daily", metric: "books_melded", target: 6, xp: 20 },
  { id: "d_runs", period: "daily", metric: "runs_melded", target: 6, xp: 20 },
  { id: "d_layoff", period: "daily", metric: "cards_laid_off", target: 8, xp: 20 },
  { id: "d_out", period: "daily", metric: "rounds_won", target: 3, xp: 25 },
  { id: "d_nodiscard", period: "daily", metric: "rounds_won_no_discard", target: 1, xp: 30 },
  { id: "d_clean", period: "daily", metric: "melds_with_zero_wilds", target: 5, xp: 20 },
  { id: "d_pile", period: "daily", metric: "cards_drawn_from_discard", target: 6, xp: 15 },
  // Weekly — a few sessions' worth.
  { id: "w_play", period: "weekly", metric: "games_played", target: 8, xp: 60 },
  { id: "w_win", period: "weekly", metric: "games_won", target: 4, xp: 100 },
  { id: "w_books", period: "weekly", metric: "books_melded", target: 30, xp: 60 },
  { id: "w_runs", period: "weekly", metric: "runs_melded", target: 30, xp: 60 },
  { id: "w_layoff", period: "weekly", metric: "cards_laid_off", target: 40, xp: 60 },
  { id: "w_out", period: "weekly", metric: "rounds_won", target: 15, xp: 80 },
  { id: "w_nodiscard", period: "weekly", metric: "rounds_won_no_discard", target: 3, xp: 80 },
  { id: "w_oversized", period: "weekly", metric: "oversized_runs_melded", target: 3, xp: 70 },
  { id: "w_wilds", period: "weekly", metric: "wilds_used_in_melds", target: 25, xp: 60 },
];

/** Translation key for a metric's label (a verb phrase with no number in it,
 * so it needs no plural forms — the target shows as "2 / 6" beside it). */
export const QUEST_METRIC_LABEL_KEYS: Readonly<Record<string, string>> = {
  games_played: "quests.metric.gamesPlayed",
  games_won: "quests.metric.gamesWon",
  books_melded: "quests.metric.booksMelded",
  runs_melded: "quests.metric.runsMelded",
  cards_laid_off: "quests.metric.cardsLaidOff",
  rounds_won: "quests.metric.roundsWon",
  rounds_won_no_discard: "quests.metric.roundsWonNoDiscard",
  melds_with_zero_wilds: "quests.metric.meldsWithZeroWilds",
  cards_drawn_from_discard: "quests.metric.cardsDrawnFromDiscard",
  oversized_runs_melded: "quests.metric.oversizedRunsMelded",
  wilds_used_in_melds: "quests.metric.wildsUsedInMelds",
};

/** Every metric any quest reads — what a baseline snapshot needs to hold. */
export const QUEST_METRICS: readonly string[] = [...new Set(QUEST_CATALOG.map((q) => q.metric))];

export type MetricSnapshot = Record<string, number>;

/** Builds the metric snapshot from the two rows the server reads. Only the
 * catalog's own metrics are kept, so a stored baseline stays tiny. */
export function buildMetricSnapshot(
  stats: { games_played?: number | null; games_won?: number | null } | null | undefined,
  counters: Record<string, number> | null | undefined
): MetricSnapshot {
  const out: MetricSnapshot = {};
  for (const metric of QUEST_METRICS) {
    if (metric === "games_played") out[metric] = stats?.games_played ?? 0;
    else if (metric === "games_won") out[metric] = stats?.games_won ?? 0;
    else out[metric] = counters?.[metric] ?? 0;
  }
  return out;
}

// ── deterministic selection ─────────────────────────────────────────────

/** Same djb2 hash as dailyDealStore.ts's dateSeed. */
function hashString(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) hash = (hash * 33) ^ s.charCodeAt(i);
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The live quests for a period: a seeded shuffle of that period's pool,
 * first QUESTS_PER_PERIOD. Pure — same key, same quests, on any client. */
export function questsForPeriod(period: QuestPeriod, periodKey: string): QuestDef[] {
  const pool = QUEST_CATALOG.filter((q) => q.period === period);
  const rand = mulberry32(hashString(`${period}:${periodKey}`));
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, QUESTS_PER_PERIOD);
}

export function currentPeriodKey(period: QuestPeriod, now: Date = new Date()): string {
  return period === "daily" ? utcDayKey(now) : utcIsoWeekKey(now);
}

/** The ledger ref a quest's XP is credited under — unique per (period key,
 * quest), which is what makes a claim idempotent. */
export function questLedgerRef(periodKey: string, questId: string): string {
  return `quest:${periodKey}:${questId}`;
}

// ── progress ────────────────────────────────────────────────────────────

/** Progress toward a quest's target, clamped to [0, target]. `baseline`
 * undefined means the server hasn't snapshotted this period yet — nothing
 * has been counted, so 0 (never `current`, which would credit all-time
 * progress). */
export function questProgress(
  quest: QuestDef,
  baseline: MetricSnapshot | null | undefined,
  current: MetricSnapshot
): number {
  if (!baseline) return 0;
  const start = baseline[quest.metric] ?? 0;
  const now = current[quest.metric] ?? 0;
  return Math.max(0, Math.min(quest.target, now - start));
}

export interface QuestStatus {
  quest: QuestDef;
  progress: number;
  complete: boolean;
  claimed: boolean;
}

export function questStatuses(
  period: QuestPeriod,
  periodKey: string,
  baseline: MetricSnapshot | null | undefined,
  current: MetricSnapshot,
  claimedRefs: ReadonlySet<string>
): QuestStatus[] {
  return questsForPeriod(period, periodKey).map((quest) => {
    const progress = questProgress(quest, baseline, current);
    return {
      quest,
      progress,
      complete: progress >= quest.target,
      claimed: claimedRefs.has(questLedgerRef(periodKey, quest.id)),
    };
  });
}
