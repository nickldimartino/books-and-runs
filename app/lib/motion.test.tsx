import { afterEach, describe, expect, it } from "vitest";
import { applyReduceMotion, flightMs, prefersReducedMotion, scaleMs, speedFactor } from "./motion";
import { DEFAULT_SETTINGS, saveLocalSettings } from "./settingsStore";

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-reduce-motion");
});

describe("game speed", () => {
  it("scales durations by the saved speed", () => {
    saveLocalSettings({ ...DEFAULT_SETTINGS, gameSpeed: "fast" });
    expect(scaleMs(900)).toBe(450);
    expect(flightMs()).toBe(190);
    saveLocalSettings({ ...DEFAULT_SETTINGS, gameSpeed: "instant" });
    expect(scaleMs(900)).toBe(0);
    expect(speedFactor()).toBe(0);
    saveLocalSettings({ ...DEFAULT_SETTINGS, gameSpeed: "relaxed" });
    expect(scaleMs(1000)).toBe(1600);
  });

  it("falls back to normal for a garbage stored value", () => {
    window.localStorage.setItem("booksAndRuns:settings", JSON.stringify({ gameSpeed: "warp" }));
    expect(scaleMs(450)).toBe(450);
  });
});

describe("reduce motion", () => {
  it("is on when the in-app setting is on", () => {
    saveLocalSettings({ ...DEFAULT_SETTINGS, reduceMotion: "on" });
    expect(prefersReducedMotion()).toBe(true);
  });

  it("toggles the html attribute", () => {
    applyReduceMotion("on");
    expect(document.documentElement.getAttribute("data-reduce-motion")).toBe("on");
    applyReduceMotion("system");
    expect(document.documentElement.hasAttribute("data-reduce-motion")).toBe(false);
  });
});
