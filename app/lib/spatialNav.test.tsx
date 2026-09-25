import { describe, expect, it } from "vitest";
import { pickNext, type NavRect } from "./spatialNav";

const r = (left: number, top: number, w = 50, h = 50): NavRect => ({ left, top, right: left + w, bottom: top + h });

describe("pickNext", () => {
  const items = [
    { item: "right-near", rect: r(100, 0) },
    { item: "right-far", rect: r(300, 0) },
    { item: "below", rect: r(0, 100) },
    { item: "above-left", rect: r(-100, -100) },
  ];
  const from = r(0, 0);

  it("steps to the nearest control in the pressed direction", () => {
    expect(pickNext(from, items, "right")).toBe("right-near");
    expect(pickNext(from, items, "down")).toBe("below");
    expect(pickNext(from, items, "left")).toBe("above-left");
    expect(pickNext(from, items, "up")).toBe("above-left");
  });

  it("returns null when nothing lies that way", () => {
    expect(pickNext(r(0, 0), [{ item: "x", rect: r(100, 0) }], "left")).toBeNull();
  });

  it("prefers the aligned control over a nearer diagonal one", () => {
    const list = [
      { item: "diag", rect: r(60, 60) },
      { item: "aligned", rect: r(140, 0) },
    ];
    expect(pickNext(from, list, "right")).toBe("aligned");
  });
});
