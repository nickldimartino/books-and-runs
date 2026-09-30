import { describe, expect, it } from "vitest";
import { getCommunityMilestone } from "./communityMilestoneStore";

function fakeSupabase(row: Record<string, unknown> | null, error: Error | null = null) {
  return {
    rpc: async () => ({ data: row ? [row] : [], error }),
  } as never;
}

describe("getCommunityMilestone", () => {
  it("returns null for an unconfigured client without calling anything", async () => {
    await expect(getCommunityMilestone(null)).resolves.toBeNull();
  });

  it("returns null when every milestone has been reached (no rows back)", async () => {
    await expect(getCommunityMilestone(fakeSupabase(null))).resolves.toBeNull();
  });

  it("maps a live milestone row", async () => {
    const client = fakeSupabase({
      id: 1,
      metric: "daily_deals_completed",
      current_count: 42,
      target: 2000,
      reward_sku: "badge:🎻",
      reached_at: null,
    });
    await expect(getCommunityMilestone(client)).resolves.toEqual({
      id: 1,
      metric: "daily_deals_completed",
      currentCount: 42,
      target: 2000,
      rewardSku: "badge:🎻",
      reachedAt: null,
    });
  });

  it("throws when the RPC errors", async () => {
    const client = fakeSupabase(null, new Error("boom"));
    await expect(getCommunityMilestone(client)).rejects.toThrow("boom");
  });
});
