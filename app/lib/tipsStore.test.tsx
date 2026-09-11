// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { dismissTip, isTipSeen, resetSeenTips } from "./tipsStore";

afterEach(() => {
  window.localStorage.clear();
});

describe("tipsStore", () => {
  it("a tip is unseen until dismissed", () => {
    expect(isTipSeen("home")).toBe(false);
    dismissTip("home");
    expect(isTipSeen("home")).toBe(true);
  });

  it("dismissing one tip doesn't mark others as seen", () => {
    dismissTip("home");
    expect(isTipSeen("new-game")).toBe(false);
  });

  it("dismissing is idempotent", () => {
    dismissTip("settings");
    dismissTip("settings");
    expect(isTipSeen("settings")).toBe(true);
  });

  it("resetSeenTips clears every dismissed tip", () => {
    dismissTip("home");
    dismissTip("achievements");
    resetSeenTips();
    expect(isTipSeen("home")).toBe(false);
    expect(isTipSeen("achievements")).toBe(false);
  });

  it("survives garbage in localStorage rather than throwing", () => {
    window.localStorage.setItem("booksAndRuns:seenTips", "{not json");
    expect(() => isTipSeen("home")).not.toThrow();
    expect(isTipSeen("home")).toBe(false);
  });
});
