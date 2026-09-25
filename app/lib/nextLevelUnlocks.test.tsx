import { describe, expect, it } from "vitest";
import { nextLevelUnlocks } from "./allCosmetics";

describe("nextLevelUnlocks", () => {
  it("points at the nearest level above the current one, with every reward at that level", () => {
    const next = nextLevelUnlocks(0);
    expect(next).not.toBeNull();
    expect(next!.level).toBeGreaterThan(0);
    expect(next!.items.length).toBeGreaterThan(0);
    for (const item of next!.items) {
      expect(item.unlock.kind).toBe("level");
      expect(item.name).toBeTruthy();
    }
  });

  it("advances as the level rises and never points backwards", () => {
    const first = nextLevelUnlocks(0)!;
    const second = nextLevelUnlocks(first.level)!;
    expect(second.level).toBeGreaterThan(first.level);
  });

  it("is null once every level-gated reward is unlocked", () => {
    expect(nextLevelUnlocks(100_000)).toBeNull();
  });
});
