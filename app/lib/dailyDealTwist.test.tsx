import { describe, expect, it } from "vitest";
import { dailyDealTwistFor, DailyDealTwist, dateSeed } from "./dailyDealStore";

describe("dailyDealTwistFor", () => {
  it("is a pure, deterministic function of the seed", () => {
    for (const seed of [0, 1, 5, 42, 123456]) {
      expect(dailyDealTwistFor(seed)).toBe(dailyDealTwistFor(seed));
    }
  });

  it("is 'none' unless the seed is a multiple of 5", () => {
    for (let seed = 0; seed < 100; seed++) {
      const twist = dailyDealTwistFor(seed);
      if (seed % 5 !== 0) expect(twist).toBe("none");
      else expect(twist).not.toBe("none");
    }
  });

  it("only ever returns a known twist kind", () => {
    const seen = new Set<DailyDealTwist>();
    for (let seed = 0; seed < 500; seed++) seen.add(dailyDealTwistFor(seed));
    for (const t of seen) expect(["none", "gauntlet", "crowd", "duel"]).toContain(t);
  });

  it("cycles through every twist kind over enough consecutive multiples of 5, not just one", () => {
    const seen = new Set<DailyDealTwist>();
    for (let i = 0; i < 30; i++) seen.add(dailyDealTwistFor(i * 5));
    expect(seen.has("gauntlet")).toBe(true);
    expect(seen.has("crowd")).toBe(true);
    expect(seen.has("duel")).toBe(true);
  });

  it("real-world date seeds land on a twist roughly 1 day in 5", () => {
    // Sanity check against actual dateSeed() output rather than a synthetic
    // 0..N range, since djb2's real distribution across dates is what
    // actually matters (see dailyDealContract's own doc on djb2's uneven
    // spread over a small modulus for a *different* reason).
    let twistDays = 0;
    const start = new Date("2026-01-01T00:00:00Z");
    for (let i = 0; i < 365; i++) {
      const d = new Date(start.getTime() + i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      if (dailyDealTwistFor(dateSeed(key)) !== "none") twistDays++;
    }
    expect(twistDays).toBeGreaterThan(50);
    expect(twistDays).toBeLessThan(90);
  });
});
