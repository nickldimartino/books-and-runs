import { describe, expect, it } from "vitest";
import {
  buildMetricSnapshot,
  currentPeriodKey,
  QUEST_CATALOG,
  QUEST_METRIC_LABEL_KEYS,
  QUEST_METRICS,
  questLedgerRef,
  questProgress,
  questsForPeriod,
  QUESTS_PER_PERIOD,
  questStatuses,
} from "./quests";

describe("catalog", () => {
  it("has unique ids and enough of each period to rotate", () => {
    const ids = QUEST_CATALOG.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const period of ["daily", "weekly"] as const) {
      expect(QUEST_CATALOG.filter((q) => q.period === period).length).toBeGreaterThan(QUESTS_PER_PERIOD);
    }
  });
  it("every quest has a positive target and XP, and a label key for its metric", () => {
    for (const q of QUEST_CATALOG) {
      expect(q.target).toBeGreaterThan(0);
      expect(q.xp).toBeGreaterThan(0);
      expect(q.xp).toBeLessThanOrEqual(1000); // xp_ledger's CHECK
      expect(QUEST_METRIC_LABEL_KEYS[q.metric]).toBeTruthy();
    }
  });
  it("weekly quests are bigger than daily ones", () => {
    const maxDaily = Math.max(...QUEST_CATALOG.filter((q) => q.period === "daily").map((q) => q.xp));
    const minWeekly = Math.min(...QUEST_CATALOG.filter((q) => q.period === "weekly").map((q) => q.xp));
    expect(minWeekly).toBeGreaterThanOrEqual(maxDaily);
  });
});

describe("questsForPeriod — deterministic selection", () => {
  it("returns the same distinct quests for the same period key, every time", () => {
    const a = questsForPeriod("daily", "2026-09-25");
    const b = questsForPeriod("daily", "2026-09-25");
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    expect(a).toHaveLength(QUESTS_PER_PERIOD);
    expect(new Set(a.map((q) => q.id)).size).toBe(QUESTS_PER_PERIOD);
    expect(a.every((q) => q.period === "daily")).toBe(true);
  });
  it("rotates across periods (not the same set every day)", () => {
    const sets = new Set<string>();
    for (let d = 1; d <= 20; d++) {
      sets.add(
        questsForPeriod("daily", `2026-09-${String(d).padStart(2, "0")}`)
          .map((q) => q.id)
          .sort()
          .join(",")
      );
    }
    expect(sets.size).toBeGreaterThan(5);
  });
  it("uses only weekly quests for a week, and covers the whole pool over time", () => {
    const seen = new Set<string>();
    for (let w = 1; w <= 52; w++) {
      const qs = questsForPeriod("weekly", `2026-W${String(w).padStart(2, "0")}`);
      expect(qs.every((q) => q.period === "weekly")).toBe(true);
      qs.forEach((q) => seen.add(q.id));
    }
    expect(seen.size).toBe(QUEST_CATALOG.filter((q) => q.period === "weekly").length);
  });
});

describe("period keys", () => {
  it("uses the UTC day for daily and the ISO week for weekly", () => {
    const now = new Date("2026-09-25T23:30:00Z");
    expect(currentPeriodKey("daily", now)).toBe("2026-09-25");
    expect(currentPeriodKey("weekly", now)).toBe("2026-W39");
  });
});

describe("buildMetricSnapshot / questProgress", () => {
  const snapshot = buildMetricSnapshot({ games_played: 12, games_won: 4 }, { books_melded: 30, unrelated: 99 });

  it("keeps only catalog metrics and defaults the rest to 0", () => {
    expect(snapshot.games_played).toBe(12);
    expect(snapshot.games_won).toBe(4);
    expect(snapshot.books_melded).toBe(30);
    expect(snapshot.runs_melded).toBe(0);
    expect("unrelated" in snapshot).toBe(false);
    expect(Object.keys(snapshot).sort()).toEqual([...QUEST_METRICS].sort());
  });

  it("handles missing rows (a brand-new account)", () => {
    const empty = buildMetricSnapshot(null, undefined);
    expect(Object.values(empty).every((v) => v === 0)).toBe(true);
  });

  const quest = { id: "t", period: "daily" as const, metric: "books_melded", target: 6, xp: 20 };

  it("is progress since the baseline, clamped to the target", () => {
    expect(questProgress(quest, { books_melded: 30 }, { books_melded: 33 })).toBe(3);
    expect(questProgress(quest, { books_melded: 30 }, { books_melded: 99 })).toBe(6);
  });
  it("never goes negative", () => {
    expect(questProgress(quest, { books_melded: 30 }, { books_melded: 10 })).toBe(0);
  });
  it("is 0 without a baseline — never credits all-time progress", () => {
    expect(questProgress(quest, undefined, { books_melded: 500 })).toBe(0);
    expect(questProgress(quest, null, { books_melded: 500 })).toBe(0);
  });
  it("treats a metric missing from the baseline as 0", () => {
    expect(questProgress(quest, {}, { books_melded: 4 })).toBe(4);
  });
});

describe("questStatuses", () => {
  it("marks completion and claim state per quest", () => {
    const key = "2026-09-25";
    const quests = questsForPeriod("daily", key);
    const baseline = buildMetricSnapshot({ games_played: 0, games_won: 0 }, {});
    // Everything the three quests read is far past its target.
    const current: Record<string, number> = {};
    for (const q of quests) current[q.metric] = q.target + 5;
    const claimed = new Set([questLedgerRef(key, quests[0].id)]);
    const statuses = questStatuses("daily", key, baseline, current, claimed);
    expect(statuses.map((s) => s.quest.id)).toEqual(quests.map((q) => q.id));
    expect(statuses.every((s) => s.complete && s.progress === s.quest.target)).toBe(true);
    expect(statuses.map((s) => s.claimed)).toEqual([true, false, false]);
  });
  it("shows everything at 0 before the server has snapshotted the period", () => {
    const statuses = questStatuses("weekly", "2026-W39", undefined, { games_played: 99 }, new Set());
    expect(statuses.every((s) => s.progress === 0 && !s.complete)).toBe(true);
  });
  it("a quest's ledger ref is unique per period and per quest (idempotency key)", () => {
    expect(questLedgerRef("2026-09-25", "d_play")).not.toBe(questLedgerRef("2026-09-26", "d_play"));
    expect(questLedgerRef("2026-09-25", "d_play")).not.toBe(questLedgerRef("2026-09-25", "d_win"));
  });
});
