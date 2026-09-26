// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { countPendingTurns } from "./appBadge";
import type { MpGameSummary } from "./mpStore";
import { actionableTotal, badgeLabel, buildNotificationItems, loadSeen, markSeen, unseenCount } from "./notificationItems";

const g = (o: Partial<MpGameSummary>): MpGameSummary => ({
  game_id: "g1", status: "active", round: 1, total_rounds: 7, your_seat: 0, invite_status: "accepted",
  turn_seat: 0, turn_user_id: "me", seats: [], hand_counts: {}, cumulative_scores: {}, host_id: "x",
  updated_at: "2026-09-25T00:00:00Z", ...o,
});

describe("notification items", () => {
  const games = [
    g({ game_id: "a" }),
    g({ game_id: "b", turn_user_id: "them" }),
    g({ game_id: "c", invite_status: "invited", status: "pending" }),
  ];
  it("agrees with the badge counts (turns + invites, plus friend requests)", () => {
    const items = buildNotificationItems({ userId: "me", games, friendRequests: 2 });
    expect(actionableTotal(items)).toBe(countPendingTurns(games, "me") + 2);
    expect(items.map((i) => i.kind)).toEqual(["turn", "invite", "friends"]);
  });
  it("includes informational items without counting them as actionable", () => {
    const items = buildNotificationItems({ userId: "me", games: [], friendRequests: 0, shieldSaveDay: "2026-09-24", claimedQuests: [{ id: "q", period: "daily", xp: 5 }] });
    expect(items).toHaveLength(2);
    expect(actionableTotal(items)).toBe(0);
  });
  it("seen state clears the count but keeps the items, and a new turn re-badges", () => {
    localStorage.clear();
    const items = buildNotificationItems({ userId: "me", games, friendRequests: 0 });
    expect(unseenCount(items, loadSeen("me"))).toBe(2);
    const seen = markSeen("me", items.map((i) => i.id));
    expect(unseenCount(items, seen)).toBe(0);
    expect(items).toHaveLength(2);
    const next = buildNotificationItems({ userId: "me", games: [g({ game_id: "a", turn_started_at: "2026-09-25T01:00:00Z" })], friendRequests: 0 });
    expect(unseenCount(next, loadSeen("me"))).toBe(1);
  });
  it("caps the badge label", () => {
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
  });
});
