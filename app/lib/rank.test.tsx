import { describe, expect, it } from "vitest";
import { WIN_RATE_MIN_GAMES } from "@/achievements";
import { computeRank } from "./rank";

describe("computeRank", () => {
  it("is Unranked below the minimum sample size, regardless of win rate", () => {
    const rank = computeRank(WIN_RATE_MIN_GAMES - 1, WIN_RATE_MIN_GAMES - 1);
    expect(rank.tier).toBeNull();
    expect(rank.winRate).toBeNull();
  });

  it("buckets a real win rate into the right tier", () => {
    expect(computeRank(100, 10).tier?.id).toBe("bronze"); // 10%
    expect(computeRank(100, 40).tier?.id).toBe("silver"); // 40%
    expect(computeRank(100, 55).tier?.id).toBe("gold"); // 55%
    expect(computeRank(100, 65).tier?.id).toBe("platinum"); // 65%
    expect(computeRank(100, 80).tier?.id).toBe("diamond"); // 80%
  });

  it("is monotonic at the exact tier boundaries", () => {
    expect(computeRank(100, 35).tier?.id).toBe("silver");
    expect(computeRank(100, 34).tier?.id).toBe("bronze");
  });
});
