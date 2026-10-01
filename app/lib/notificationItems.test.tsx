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
    const items = buildNotificationItems({
      userId: "me",
      games: [],
      friendRequests: 0,
      shieldSaveDay: "2026-09-24",
      claimedQuests: [{ id: "q", period: "daily", xp: 5 }],
      gifts: [{ id: "e1", sku: "badge:🎩", itemName: "Top Hat badge", fromName: "Alex", createdAt: "2026-09-25T00:00:00Z" }],
    });
    expect(items).toHaveLength(3);
    expect(actionableTotal(items)).toBe(0);
    expect(items.find((i) => i.kind === "gift")?.id).toBe("gift:e1");
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

  // Regression: releases.ts is a running log that only ever grows — one
  // notification row per entry would have accumulated forever as more
  // releases shipped (exactly what prompted this fix: a 19-entry backfill
  // would otherwise have dropped 5 release rows into every signed-in
  // user's bell at once). Every notifiable release collapses into one row.
  describe("releases collapse into a single row", () => {
    const releases = [
      { version: "0.3.0", date: "2026-09-29", kind: "feature" as const, title: "C", description: "c" },
      { version: "0.2.0", date: "2026-09-28", kind: "feature" as const, title: "B", description: "b" },
      { version: "0.1.0", date: "2026-09-27", kind: "feature" as const, title: "A", description: "a" },
    ];

    it("produces exactly one 'release' item regardless of how many releases are notifiable", () => {
      const items = buildNotificationItems({ userId: "me", games: [], friendRequests: 0, releases });
      const releaseItems = items.filter((i) => i.kind === "release");
      expect(releaseItems).toHaveLength(1);
      expect(releaseItems[0]).toMatchObject({ id: "release:0.3.0", releases });
      // Weight 1, not 3 — a growing changelog shouldn't inflate the badge
      // count just because it's long.
      expect(unseenCount(items, new Set())).toBe(1);
    });

    it("re-badges as unseen the moment a newer release ships, even if the previous newest was already seen", () => {
      localStorage.clear();
      const items = buildNotificationItems({ userId: "me", games: [], friendRequests: 0, releases: releases.slice(1) }); // newest: 0.2.0
      const seen = markSeen("me", items.map((i) => i.id));
      expect(unseenCount(items, seen)).toBe(0);

      const withNewRelease = buildNotificationItems({ userId: "me", games: [], friendRequests: 0, releases }); // newest: 0.3.0
      expect(unseenCount(withNewRelease, seen)).toBe(1);
    });

    it("omits the release item entirely when nothing is notifiable", () => {
      const items = buildNotificationItems({ userId: "me", games: [], friendRequests: 0, releases: [] });
      expect(items.some((i) => i.kind === "release")).toBe(false);
    });
  });
});
