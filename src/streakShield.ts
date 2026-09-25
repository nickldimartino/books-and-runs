// Streak shields — a free, earned, automatic grace for the Daily Deal and
// Weekly Challenge streaks. Framework-free and import-free on purpose: the
// `solo-verify` Edge Function bundles it (via src/challengeRewards.ts) and
// the app uses the very same walk for display and for its local estimate.
//
// THE RULE (Daily; Weekly is the same with weeks as the unit):
//   * Walk the account's completion keys in ascending order.
//   * Consecutive unit -> streak + 1.
//   * Exactly ONE missed unit between two completions and a shield in hand ->
//     the shield is spent, the missed unit is "covered", and the streak
//     carries on: it becomes streak + 1 for the day actually played (the
//     covered day itself adds nothing to the count).
//   * Two or more missed units, or one missed unit with no shield -> the
//     streak restarts at 1. Shields already held are kept.
//   * Each time the streak reaches a multiple of `earnEvery` (Daily: 7, 14,
//     21, ...; Weekly: 4, 8, ...) one shield is earned, if the player holds
//     fewer than `cap` (Daily: 2, Weekly: 1). A shield earned at the cap is
//     simply not granted. Never purchasable; separate gaps each cost one
//     shield, so shields chain across separate one-unit gaps.
//   * Covered units are NOT completions: `count` is the number of distinct
//     keys actually played, and no XP / achievement counter reads covered
//     units. Milestone XP (7/30/100) is keyed per milestone in xp_ledger, so
//     a shield can never make one pay twice.
//
// This is the TS mirror of the SQL walk in migration 0081
// (`streak_shield_walk`); src/streakShield.sql.test.ts runs both against a
// scratch Postgres on generated histories and asserts they agree. Keep the
// two in lock-step.
//
// Day keys are calendar dates ("YYYY-MM-DD" — the player's local calendar
// day, exactly what daily_deal_completions stores) and adjacency is plain
// calendar arithmetic on the key, so timezone/DST never enters the walk.

export interface ShieldConfig {
  /** A shield is earned every time the streak reaches a multiple of this. */
  earnEvery: number;
  /** Most shields that can be held at once. */
  cap: number;
}

export const DAILY_SHIELD_CONFIG: ShieldConfig = { earnEvery: 7, cap: 2 };
export const WEEKLY_SHIELD_CONFIG: ShieldConfig = { earnEvery: 4, cap: 1 };

export interface ShieldWalk {
  /** Distinct units actually played (covered units excluded). */
  count: number;
  /** The streak ending at the most recent completion (0 if none). */
  current: number;
  /** Longest streak ever, shield bridges included. */
  best: number;
  /** Shields currently held. Always earned - used. */
  shields: number;
  /** Shields granted over the account's lifetime. */
  earned: number;
  /** Shields spent over the account's lifetime. */
  used: number;
  /** Unit index of the last completion, or null. */
  lastIndex: number | null;
  /** Unit index of the completion on which the most recent shield was earned, or null. */
  lastEarnedIndex: number | null;
  /** Covered unit indexes, ascending. */
  coveredIndexes: number[];
}

/** One step of the walk, exported so the local (per-device) store can apply
 * the identical rule incrementally when the player finishes a deal. */
export interface ShieldStreakState {
  current: number;
  best: number;
  shields: number;
  earned: number;
  used: number;
  lastEarnedIndex: number | null;
  covered: number | null; // the unit this step covered, if any
}

export function stepShieldStreak(
  prev: { current: number; best: number; shields: number; earned: number; used: number; lastEarnedIndex: number | null },
  prevIndex: number | null, // previous completion's unit index; null = first ever
  index: number,
  config: ShieldConfig
): ShieldStreakState {
  let { current, shields, earned, used, lastEarnedIndex } = prev;
  let covered: number | null = null;
  const missed = prevIndex === null ? null : index - prevIndex - 1;
  if (missed === null) current = 1;
  else if (missed === 0) current += 1;
  else if (missed === 1 && shields > 0 && prevIndex !== null) {
    shields -= 1;
    used += 1;
    covered = prevIndex + 1;
    current += 1;
  } else current = 1;
  if (current % config.earnEvery === 0 && shields < config.cap) {
    shields += 1;
    earned += 1;
    lastEarnedIndex = index;
  }
  return { current, best: Math.max(prev.best, current), shields, earned, used, lastEarnedIndex, covered };
}

/** Walk sorted-unique unit indexes. Order/duplicates in `indexes` don't matter. */
export function walkShieldStreak(indexes: readonly number[], config: ShieldConfig): ShieldWalk {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b);
  let s = { current: 0, best: 0, shields: 0, earned: 0, used: 0, lastEarnedIndex: null as number | null };
  const coveredIndexes: number[] = [];
  let prev: number | null = null;
  for (const idx of sorted) {
    const step = stepShieldStreak(s, prev, idx, config);
    if (step.covered !== null) coveredIndexes.push(step.covered);
    s = step;
    prev = idx;
  }
  return {
    count: sorted.length,
    current: s.current,
    best: s.best,
    shields: s.shields,
    earned: s.earned,
    used: s.used,
    lastIndex: prev,
    lastEarnedIndex: s.lastEarnedIndex,
    coveredIndexes,
  };
}

// ── key <-> index ───────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

export function dayIndex(dateKey: string): number {
  return Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / DAY_MS);
}

export function dayKeyFromIndex(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

// Monday of ISO week 1 is the Monday on/before Jan 4th; weeks are counted
// from the Monday 2001-01-01 — identical to migration 0057's formula.
const WEEK_EPOCH_DAY = Math.floor(Date.UTC(2001, 0, 1) / DAY_MS);

function isoWeekMondayDay(year: number, week: number): number {
  const jan4Day = Math.floor(Date.UTC(year, 0, 4) / DAY_MS);
  const isoDow = ((jan4Day + 3) % 7 + 7) % 7; // 1970-01-01 is a Thursday -> 0 = Mon
  return jan4Day - isoDow + (week - 1) * 7;
}

export function weekIndex(weekKey: string): number {
  const [y, w] = weekKey.split("-W");
  return (isoWeekMondayDay(Number(y), Number(w)) - WEEK_EPOCH_DAY) / 7;
}

export function weekKeyFromIndex(index: number): string {
  // The Thursday of the week decides the ISO year.
  const thursday = new Date((WEEK_EPOCH_DAY + index * 7 + 3) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = (WEEK_EPOCH_DAY + index * 7 - isoWeekMondayDay(year, 1)) / 7 + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// ── keyed wrappers ──────────────────────────────────────────────────────

export interface ShieldStats {
  count: number;
  best: number;
  current: number;
  shields: number;
  earned: number;
  used: number;
  /** Key of the last completion, or null. */
  lastPlayed: string | null;
  /** Key of the completion on which the latest shield was earned, or null. */
  lastEarnedOn: string | null;
  /** Covered keys, ascending. */
  covered: string[];
}

function toStats(w: ShieldWalk, toKey: (i: number) => string): ShieldStats {
  return {
    count: w.count,
    best: w.best,
    current: w.current,
    shields: w.shields,
    earned: w.earned,
    used: w.used,
    lastPlayed: w.lastIndex === null ? null : toKey(w.lastIndex),
    lastEarnedOn: w.lastEarnedIndex === null ? null : toKey(w.lastEarnedIndex),
    covered: w.coveredIndexes.map(toKey),
  };
}

export function dailyShieldStats(dateKeys: readonly string[]): ShieldStats {
  return toStats(walkShieldStreak(dateKeys.map(dayIndex), DAILY_SHIELD_CONFIG), dayKeyFromIndex);
}

export function weeklyShieldStats(weekKeys: readonly string[]): ShieldStats {
  return toStats(walkShieldStreak(weekKeys.map(weekIndex), WEEKLY_SHIELD_CONFIG), weekKeyFromIndex);
}

// ── display: is the streak still alive right now? ───────────────────────

/** The streak to *show* on `todayKey`, given the last completion and the
 * shields held. Played today or yesterday: the streak stands. Exactly one
 * unit missed with a shield in hand: it still stands (the shield will cover
 * that unit as soon as the player plays). Anything else has lapsed -> 0.
 * `unitsSinceLast` is today's index minus lastPlayed's. */
export function displayStreak(streak: number, unitsSinceLast: number | null, shields: number): number {
  if (streak <= 0 || unitsSinceLast === null || unitsSinceLast < 0) return 0;
  if (unitsSinceLast <= 1) return streak;
  if (unitsSinceLast === 2 && shields > 0) return streak;
  return 0;
}

export function dailyDisplayStreak(
  streak: number,
  lastPlayed: string | null,
  shields: number,
  todayKey: string
): number {
  return displayStreak(streak, lastPlayed ? dayIndex(todayKey) - dayIndex(lastPlayed) : null, shields);
}

export function weeklyDisplayStreak(
  streak: number,
  lastPlayed: string | null,
  shields: number,
  thisWeekKey: string
): number {
  return displayStreak(streak, lastPlayed ? weekIndex(thisWeekKey) - weekIndex(lastPlayed) : null, shields);
}
