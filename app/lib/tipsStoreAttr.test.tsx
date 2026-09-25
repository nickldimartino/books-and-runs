// @vitest-environment jsdom

// PageTip is server-rendered *visible*; a returning visitor's dismissed tips
// are hidden pre-paint via <html data-seen-tips> (init.js sets it, tipsStore
// keeps it current). These pin the "keeps it current" half.

import { afterEach, describe, expect, it } from "vitest";
import { dismissTip, resetSeenTips } from "./tipsStore";

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-seen-tips");
});

describe("data-seen-tips attribute", () => {
  it("lists dismissed tips and updates on every write", () => {
    dismissTip("home");
    dismissTip("friends");
    expect(document.documentElement.getAttribute("data-seen-tips")).toBe("home friends");
    resetSeenTips();
    expect(document.documentElement.getAttribute("data-seen-tips")).toBe("");
  });
});
