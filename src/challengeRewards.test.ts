import { describe, expect, it, vi } from "vitest";
import { claimCompletedQuests, creditChallengeCompletion, ensureQuestBaselines, RewardsDb } from "./challengeRewards";
import { DAILY_DEAL_XP, DAILY_STREAK_MILESTONE_XP, WEEKLY_CHALLENGE_XP } from "./dailyRewards";
import { currentPeriodKey, questsForPeriod } from "./quests";

type Row = Record<string, unknown>;

/** A minimal in-memory stand-in for the slice of the Supabase client
 * challengeRewards.ts uses: select/eq/in/limit/maybeSingle, upsert with
 * ON CONFLICT DO NOTHING semantics (+ .select() returning only rows that
 * were actually inserted, like PostgREST), and the solo_verify_set_counters
 * jsonb-merge RPC. */
class FakeDb implements RewardsDb {
  tables: Record<string, Row[]> = {
    daily_deal_completions: [],
    weekly_challenge_completions: [],
    xp_ledger: [],
    quest_baselines: [],
    player_stats: [],
    achievement_counters: [],
  };
  private pk: Record<string, string[]> = {
    xp_ledger: ["user_id", "ref"],
    quest_baselines: ["user_id", "period_key"],
    daily_deal_completions: ["user_id", "date"],
    weekly_challenge_completions: ["user_id", "week"],
  };
  rpcFail = false;

  from(table: string) {
    const db = this;
    const rows = db.tables[table];
    const filters: ((r: Row) => boolean)[] = [];
    let cols: string[] | null = null;
    let max = Infinity;
    const project = (r: Row) => (cols ? Object.fromEntries(cols.map((c) => [c, r[c]])) : { ...r });
    const run = () => ({
      data: rows.filter((r) => filters.every((f) => f(r))).slice(0, max).map(project),
      error: null,
    });
    const q = {
      select(c: string) {
        cols = c.split(",").map((s) => s.trim());
        return q;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return q;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]));
        return q;
      },
      limit(n: number) {
        max = n;
        return q;
      },
      maybeSingle() {
        const { data } = run();
        return Promise.resolve({ data: data[0] ?? null, error: null });
      },
      then(resolve: (v: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve);
      },
      upsert(newRows: Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean }) {
        const keyCols = opts.onConflict ? opts.onConflict.split(",") : db.pk[table];
        const inserted: Row[] = [];
        for (const nr of newRows) {
          const dup = rows.find((r) => keyCols.every((k) => r[k] === nr[k]));
          if (dup) {
            if (!opts.ignoreDuplicates) Object.assign(dup, nr);
            continue;
          }
          rows.push({ ...nr });
          inserted.push(nr);
        }
        return {
          select(c: string) {
            const cs = c.split(",").map((s) => s.trim());
            return Promise.resolve({
              data: inserted.map((r) => Object.fromEntries(cs.map((k) => [k, r[k]]))),
              error: null,
            });
          },
          then(resolve: (v: unknown) => unknown) {
            return Promise.resolve({ data: null, error: null }).then(resolve);
          },
        };
      },
    };
    return q;
  }

  rpc(fn: string, args: object) {
    if (fn !== "solo_verify_set_counters") throw new Error(`unexpected rpc ${fn}`);
    if (this.rpcFail) return Promise.reject(new Error("rpc down"));
    const { p_user_id, p_patch } = args as { p_user_id: string; p_patch: Record<string, number> };
    const row = this.tables.achievement_counters.find((r) => r.user_id === p_user_id);
    if (row) row.counters = { ...(row.counters as object), ...p_patch };
    else this.tables.achievement_counters.push({ user_id: p_user_id, counters: { ...p_patch } });
    return Promise.resolve({ data: null, error: null });
  }

  counters(uid: string): Record<string, number> {
    return (this.tables.achievement_counters.find((r) => r.user_id === uid)?.counters as Record<string, number>) ?? {};
  }
  ledgerTotal(uid: string): number {
    return this.tables.xp_ledger.filter((r) => r.user_id === uid).reduce((s, r) => s + (r.xp as number), 0);
  }
}

const UID = "user-1";

function completeDays(db: FakeDb, days: string[]) {
  for (const date of days) {
    if (!db.tables.daily_deal_completions.some((r) => r.date === date)) {
      db.tables.daily_deal_completions.push({ user_id: UID, date });
    }
  }
}
const isoDays = (start: string, n: number) =>
  Array.from({ length: n }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

describe("creditChallengeCompletion — Daily Deal", () => {
  it("pays the fixed daily XP once, and sets the absolute counters", async () => {
    const db = new FakeDb();
    completeDays(db, ["2026-09-25"]);
    const first = await creditChallengeCompletion(db, UID, "daily", "2026-09-25");
    expect(first).toEqual({ xp: DAILY_DEAL_XP, streakBonuses: [] });
    expect(db.ledgerTotal(UID)).toBe(DAILY_DEAL_XP);
    expect(db.counters(UID)).toEqual({ daily_deals_completed: 1, daily_deal_best_streak: 1 });
  });

  it("is idempotent — a replay/retry of the same day pays nothing more", async () => {
    const db = new FakeDb();
    completeDays(db, ["2026-09-25"]);
    await creditChallengeCompletion(db, UID, "daily", "2026-09-25");
    const again = await creditChallengeCompletion(db, UID, "daily", "2026-09-25");
    expect(again).toEqual({ xp: 0, streakBonuses: [] });
    expect(db.ledgerTotal(UID)).toBe(DAILY_DEAL_XP);
    expect(db.tables.xp_ledger).toHaveLength(1);
    expect(db.counters(UID).daily_deals_completed).toBe(1); // absolute, not +1
  });

  it("concurrent identical requests: only one reports the XP", async () => {
    const db = new FakeDb();
    completeDays(db, ["2026-09-25"]);
    const [a, b] = await Promise.all([
      creditChallengeCompletion(db, UID, "daily", "2026-09-25"),
      creditChallengeCompletion(db, UID, "daily", "2026-09-25"),
    ]);
    expect(a.xp + b.xp).toBe(DAILY_DEAL_XP);
    expect(db.ledgerTotal(UID)).toBe(DAILY_DEAL_XP);
  });

  it("pays a new day separately", async () => {
    const db = new FakeDb();
    completeDays(db, ["2026-09-25"]);
    await creditChallengeCompletion(db, UID, "daily", "2026-09-25");
    completeDays(db, ["2026-09-26"]);
    const next = await creditChallengeCompletion(db, UID, "daily", "2026-09-26");
    expect(next.xp).toBe(DAILY_DEAL_XP);
    expect(db.ledgerTotal(UID)).toBe(2 * DAILY_DEAL_XP);
    expect(db.counters(UID)).toEqual({ daily_deals_completed: 2, daily_deal_best_streak: 2 });
  });

  it("pays the 7-day streak milestone exactly once, on the day the streak reaches it", async () => {
    const db = new FakeDb();
    const days = isoDays("2026-09-01", 7);
    let bonusDays: number[] = [];
    for (const [i, d] of days.entries()) {
      completeDays(db, [d]);
      const r = await creditChallengeCompletion(db, UID, "daily", d);
      expect(r.xp).toBe(DAILY_DEAL_XP);
      if (i < 6) expect(r.streakBonuses).toEqual([]);
      else bonusDays = r.streakBonuses.map((b) => b.days);
    }
    expect(bonusDays).toEqual([7]);
    expect(db.ledgerTotal(UID)).toBe(7 * DAILY_DEAL_XP + DAILY_STREAK_MILESTONE_XP[7]);
    // Day 8 (and a replay of day 7) never re-pay the milestone.
    completeDays(db, [isoDays("2026-09-01", 8)[7]]);
    const day8 = await creditChallengeCompletion(db, UID, "daily", "2026-09-08");
    expect(day8.streakBonuses).toEqual([]);
    const replay7 = await creditChallengeCompletion(db, UID, "daily", "2026-09-07");
    expect(replay7).toEqual({ xp: 0, streakBonuses: [] });
  });

  it("a gap does not pay the milestone; the streak has to actually reach it", async () => {
    const db = new FakeDb();
    const days = [...isoDays("2026-09-01", 3), ...isoDays("2026-09-05", 3)]; // gap on the 4th
    let total = 0;
    for (const d of days) {
      completeDays(db, [d]);
      const r = await creditChallengeCompletion(db, UID, "daily", d);
      total += r.streakBonuses.length;
    }
    expect(total).toBe(0);
    expect(db.counters(UID).daily_deal_best_streak).toBe(3);
  });

  it("catches up a milestone an existing streak had already earned", async () => {
    const db = new FakeDb();
    completeDays(db, isoDays("2026-08-01", 31)); // a 31-day history, nothing credited yet
    const r = await creditChallengeCompletion(db, UID, "daily", "2026-08-31");
    expect(r.streakBonuses.map((b) => b.days)).toEqual([7, 30]);
  });

  it("is best-effort: a failing backend returns no reward instead of throwing", async () => {
    const db = new FakeDb();
    completeDays(db, ["2026-09-25"]);
    db.rpcFail = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(creditChallengeCompletion(db, UID, "daily", "2026-09-25")).resolves.toEqual({ xp: 0, streakBonuses: [] });
    spy.mockRestore();
  });
});

describe("creditChallengeCompletion — Weekly Challenge", () => {
  it("pays the weekly XP once and sets weekly counters", async () => {
    const db = new FakeDb();
    db.tables.weekly_challenge_completions.push({ user_id: UID, week: "2026-W39" });
    const first = await creditChallengeCompletion(db, UID, "weekly", "2026-W39");
    expect(first).toEqual({ xp: WEEKLY_CHALLENGE_XP, streakBonuses: [] });
    const again = await creditChallengeCompletion(db, UID, "weekly", "2026-W39");
    expect(again.xp).toBe(0);
    expect(db.ledgerTotal(UID)).toBe(WEEKLY_CHALLENGE_XP);
    expect(db.counters(UID)).toEqual({ weekly_challenges_completed: 1, weekly_challenge_best_streak: 1 });
  });

  it("never touches the daily counters", async () => {
    const db = new FakeDb();
    db.tables.weekly_challenge_completions.push({ user_id: UID, week: "2026-W39" });
    await creditChallengeCompletion(db, UID, "weekly", "2026-W39");
    expect("daily_deals_completed" in db.counters(UID)).toBe(false);
  });
});

describe("quests — baselines and claims", () => {
  const now = new Date("2026-09-25T10:00:00Z");
  const dailyKey = currentPeriodKey("daily", now);
  const weeklyKey = currentPeriodKey("weekly", now);

  function setStats(db: FakeDb, played: number, won: number, counters: Record<string, number>) {
    db.tables.player_stats = [{ user_id: UID, games_played: played, games_won: won }];
    db.tables.achievement_counters = [{ user_id: UID, counters }];
  }

  it("snapshots a baseline per live period once, first snapshot wins", async () => {
    const db = new FakeDb();
    setStats(db, 5, 2, { books_melded: 10 });
    await ensureQuestBaselines(db, UID, now);
    expect(db.tables.quest_baselines.map((r) => r.period_key).sort()).toEqual([dailyKey, weeklyKey].sort());
    setStats(db, 9, 4, { books_melded: 40 });
    await ensureQuestBaselines(db, UID, now);
    expect(db.tables.quest_baselines).toHaveLength(2);
    const daily = db.tables.quest_baselines.find((r) => r.period_key === dailyKey)!;
    expect((daily.baseline as Record<string, number>).games_played).toBe(5);
    expect((daily.baseline as Record<string, number>).books_melded).toBe(10);
  });

  it("claims nothing before any progress, and nothing without a baseline", async () => {
    const db = new FakeDb();
    setStats(db, 5, 2, {});
    expect(await claimCompletedQuests(db, UID, now)).toEqual([]); // no baseline yet
    await ensureQuestBaselines(db, UID, now);
    expect(await claimCompletedQuests(db, UID, now)).toEqual([]);
    expect(db.ledgerTotal(UID)).toBe(0);
  });

  it("pays a quest once its metric has advanced by the target, exactly once", async () => {
    const db = new FakeDb();
    setStats(db, 5, 2, {});
    await ensureQuestBaselines(db, UID, now);
    const live = questsForPeriod("daily", dailyKey);
    // Advance every metric the day's quests read by well past its target.
    const counters: Record<string, number> = {};
    let played = 5;
    let won = 2;
    for (const q of live) {
      if (q.metric === "games_played") played += q.target + 1;
      else if (q.metric === "games_won") won += q.target + 1;
      else counters[q.metric] = q.target + 1;
    }
    setStats(db, played, won, counters);

    const first = await claimCompletedQuests(db, UID, now);
    const dailyClaims = first.filter((c) => c.period === "daily");
    expect(dailyClaims.map((c) => c.id).sort()).toEqual(live.map((q) => q.id).sort());
    expect(dailyClaims.reduce((s, c) => s + c.xp, 0)).toBe(live.reduce((s, q) => s + q.xp, 0));

    const second = await claimCompletedQuests(db, UID, now);
    expect(second.filter((c) => c.period === "daily")).toEqual([]);
    expect(db.ledgerTotal(UID)).toBeGreaterThanOrEqual(live.reduce((s, q) => s + q.xp, 0));
  });

  it("does not credit pre-existing all-time progress (only what happened after the baseline)", async () => {
    const db = new FakeDb();
    // Huge lifetime totals BEFORE the baseline is taken.
    setStats(db, 500, 300, { books_melded: 900, runs_melded: 900, cards_laid_off: 900, rounds_won: 900, rounds_won_no_discard: 90, melds_with_zero_wilds: 900, cards_drawn_from_discard: 900, oversized_runs_melded: 90, wilds_used_in_melds: 900 });
    await ensureQuestBaselines(db, UID, now);
    expect(await claimCompletedQuests(db, UID, now)).toEqual([]);
  });

  it("a claim on a later day pays that day's quests separately (new baseline, new refs)", async () => {
    const db = new FakeDb();
    setStats(db, 0, 0, {});
    await ensureQuestBaselines(db, UID, now);
    const tomorrow = new Date("2026-09-26T10:00:00Z");
    await ensureQuestBaselines(db, UID, tomorrow);
    expect(db.tables.quest_baselines.filter((r) => r.period_key === "2026-09-26")).toHaveLength(1);
    // Weekly baseline is unchanged (same ISO week).
    expect(db.tables.quest_baselines.filter((r) => r.period_key === weeklyKey)).toHaveLength(1);
  });
});
