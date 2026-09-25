// Fixed XP for finishing the Daily Deal / Weekly Challenge, streak-milestone
// bonuses, and the pure streak/period helpers the server side needs to
// award them. Framework-free and import-free on purpose: the `solo-verify`
// Edge Function bundles this file (see scripts/bundle-solo-verify-engine.mjs)
// and the app imports the very same constants for display, so the number a
// player is shown ("+25 XP") can never drift from the number the server
// credits.
//
// How the XP is stored: every bonus lands as one row in `xp_ledger`
// (migration 0056), keyed (user_id, ref) — the primary key IS the
// idempotency guarantee. A given day's/week's completion, a given streak
// milestone, and a given quest on a given day can each be credited exactly
// once, no matter how many times the request is retried or replayed.
// `compute_total_xp()` (SQL) and `computeTotalXp()` (src/leveling.ts) both
// add the ledger's sum on top of the derived XP, so level, the leaderboard
// and Home all agree.

export const DAILY_DEAL_XP = 25;
export const WEEKLY_CHALLENGE_XP = 100;

/** Daily Deal streak length -> one-time bonus XP. Paid once per account per
 * milestone (the ledger ref has no date in it), the first time the account's
 * best streak reaches it. */
export const DAILY_STREAK_MILESTONE_XP: Readonly<Record<number, number>> = {
  7: 50,
  30: 150,
  100: 400,
};

export type LedgerKind = "daily" | "weekly" | "streak" | "quest";

export const dailyLedgerRef = (dateKey: string): string => `daily:${dateKey}`;
export const weeklyLedgerRef = (weekKey: string): string => `weekly:${weekKey}`;
export const streakLedgerRef = (days: number): string => `streak:daily:${days}`;

export interface StreakMilestone {
  days: number;
  xp: number;
}

/** Every milestone a best streak of `bestStreak` days has reached, ascending.
 * The server inserts all of them each time (ON CONFLICT DO NOTHING), so a
 * milestone that was somehow missed is caught up rather than lost. */
export function reachedStreakMilestones(bestStreak: number): StreakMilestone[] {
  return Object.entries(DAILY_STREAK_MILESTONE_XP)
    .map(([days, xp]) => ({ days: Number(days), xp }))
    .filter((m) => m.days <= bestStreak)
    .sort((a, b) => a.days - b.days);
}

// ── streaks ─────────────────────────────────────────────────────────────

export interface StreakStats {
  /** Total distinct completions. */
  count: number;
  /** Longest run of consecutive days/weeks ever. */
  best: number;
  /** The run ending at the most recent completion (0 if none). */
  current: number;
}

function dayNumber(dateKey: string): number {
  return Math.floor(new Date(`${dateKey}T00:00:00Z`).getTime() / 86_400_000);
}

function parseWeek(weekKey: string): { year: number; week: number } {
  const [y, w] = weekKey.split("-W");
  return { year: Number(y), week: Number(w) };
}

/** Same adjacency rule as the SQL trigger in migration 0039: same year and
 * the next week number, or a year rollover from week 52/53 into week 1. */
function weeksConsecutive(prev: string, next: string): boolean {
  const a = parseWeek(prev);
  const b = parseWeek(next);
  if (a.year === b.year && b.week === a.week + 1) return true;
  return b.year === a.year + 1 && b.week === 1 && a.week >= 52;
}

/** Streak statistics over a set of "YYYY-MM-DD" (`kind: "day"`) or
 * "YYYY-Www" (`kind: "week"`) keys, mirroring what migrations 0036/0039's
 * triggers compute for leaderboard_entries — recomputed from ground truth,
 * never trusted from a client. Order and duplicates in the input don't
 * matter. */
export function streakStats(keys: readonly string[], kind: "day" | "week"): StreakStats {
  const sorted = [...new Set(keys)].sort();
  let current = 0;
  let best = 0;
  let prev: string | null = null;
  for (const key of sorted) {
    const consecutive =
      prev !== null && (kind === "day" ? dayNumber(key) === dayNumber(prev) + 1 : weeksConsecutive(prev, key));
    current = consecutive ? current + 1 : 1;
    if (current > best) best = current;
    prev = key;
  }
  return { count: sorted.length, best, current };
}

// ── UTC period keys (daily / weekly quests) ─────────────────────────────
// Quests reset on the UTC day / ISO week so every client and the server
// agree on which set of quests is live — unlike Daily Deal's local calendar
// day, there's no player-visible "same deal for everyone" to keep aligned
// with a local clock here.

export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** ISO 8601 week key ("2026-W39") for the UTC date of `now`. */
export function utcIsoWeekKey(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const isoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - isoDay); // the Thursday of this ISO week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Epoch ms of the next UTC midnight (daily reset). */
export function nextUtcMidnight(now: Date = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

/** Epoch ms of the next Monday 00:00 UTC (weekly reset). */
export function nextUtcWeekStart(now: Date = new Date()): number {
  const isoDay = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (8 - isoDay));
}
