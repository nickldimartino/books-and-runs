import { describe, expect, it } from "vitest";
import { EMPTY_PROGRESS_STATE } from "@/achievements";
import { buildMetricSnapshot, questLedgerRef, questsForPeriod } from "@/quests";
import { buildQuestViews, EMPTY_QUEST_STATE, splitDuration } from "./questsStore";

const NOW = new Date("2026-09-25T10:00:00Z");

describe("buildQuestViews", () => {
  it("returns a daily and a weekly view of 3 quests each with reset times", () => {
    const [daily, weekly] = buildQuestViews(EMPTY_QUEST_STATE, null, null, NOW);
    expect(daily.period).toBe("daily");
    expect(weekly.period).toBe("weekly");
    expect(daily.periodKey).toBe("2026-09-25");
    expect(weekly.periodKey).toBe("2026-W39");
    expect(daily.statuses).toHaveLength(3);
    expect(weekly.statuses).toHaveLength(3);
    expect(new Date(daily.resetsAt).toISOString()).toBe("2026-09-26T00:00:00.000Z");
    expect(new Date(weekly.resetsAt).toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });

  it("a guest (no progress) sees every quest at 0", () => {
    const views = buildQuestViews(EMPTY_QUEST_STATE, null, null, NOW);
    expect(views.flatMap((v) => v.statuses).every((s) => s.progress === 0 && !s.claimed)).toBe(true);
  });

  it("computes progress as verified progress minus the server baseline", () => {
    const quest = questsForPeriod("daily", "2026-09-25")[0];
    const baseline = buildMetricSnapshot({ games_played: 10, games_won: 4 }, { [quest.metric]: 10 });
    const progress = {
      ...EMPTY_PROGRESS_STATE,
      gamesPlayed: 11,
      gamesWon: 5,
      counters: { [quest.metric]: 12 },
    };
    const server = { baselines: { "2026-09-25": baseline }, claimedRefs: new Set<string>() };
    const daily = buildQuestViews(server, progress, null, NOW)[0];
    const status = daily.statuses.find((s) => s.quest.id === quest.id)!;
    const expected =
      quest.metric === "games_played" ? 1 : quest.metric === "games_won" ? 1 : 2;
    expect(status.progress).toBe(Math.min(quest.target, expected));
  });

  it("merges this device's unverified in-progress counters for immediacy (display only)", () => {
    const quest = questsForPeriod("daily", "2026-09-25").find((q) => !q.metric.startsWith("games_"));
    if (!quest) return; // this day's seed drew only game-count quests
    const baseline = buildMetricSnapshot({ games_played: 0, games_won: 0 }, {});
    const server = { baselines: { "2026-09-25": baseline }, claimedRefs: new Set<string>() };
    const without = buildQuestViews(server, EMPTY_PROGRESS_STATE, null, NOW)[0];
    const withPending = buildQuestViews(server, EMPTY_PROGRESS_STATE, { [quest.metric]: 2 }, NOW)[0];
    const pick = (v: typeof without) => v.statuses.find((s) => s.quest.id === quest.id)!.progress;
    expect(pick(without)).toBe(0);
    expect(pick(withPending)).toBe(Math.min(quest.target, 2));
  });

  it("marks quests with a ledger row as claimed", () => {
    const quest = questsForPeriod("daily", "2026-09-25")[1];
    const server = { baselines: {}, claimedRefs: new Set([questLedgerRef("2026-09-25", quest.id)]) };
    const daily = buildQuestViews(server, EMPTY_PROGRESS_STATE, null, NOW)[0];
    expect(daily.statuses.map((s) => s.claimed)).toEqual([false, true, false]);
  });

  it("swaps to the new quests after a UTC midnight rollover", () => {
    const before = buildQuestViews(EMPTY_QUEST_STATE, null, null, new Date("2026-09-25T23:59:00Z"))[0];
    const after = buildQuestViews(EMPTY_QUEST_STATE, null, null, new Date("2026-09-26T00:01:00Z"))[0];
    expect(before.periodKey).not.toBe(after.periodKey);
  });
});

describe("splitDuration", () => {
  it("splits into days/hours/minutes, rounding partial minutes up", () => {
    expect(splitDuration(0)).toEqual({ d: 0, h: 0, m: 0 });
    expect(splitDuration(61_000)).toEqual({ d: 0, h: 0, m: 2 });
    expect(splitDuration((5 * 60 + 12) * 60_000)).toEqual({ d: 0, h: 5, m: 12 });
    expect(splitDuration((49 * 60 + 5) * 60_000)).toEqual({ d: 2, h: 1, m: 5 });
  });
  it("clamps negatives to zero", () => {
    expect(splitDuration(-5000)).toEqual({ d: 0, h: 0, m: 0 });
  });
});
