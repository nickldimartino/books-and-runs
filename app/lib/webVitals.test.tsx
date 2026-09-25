// @vitest-environment jsdom

// The math + privacy shape of the field Web Vitals reporter (webVitals.ts).

import { describe, expect, it } from "vitest";
import { bucket, computeCls, computeInp, normalizeRoute } from "./webVitals";

describe("computeCls", () => {
  it("takes the worst session window, not the raw sum", () => {
    const entries = [
      { value: 0.05, startTime: 100, hadRecentInput: false },
      { value: 0.05, startTime: 600, hadRecentInput: false }, // same window (gap < 1 s) → 0.10
      { value: 0.04, startTime: 4000, hadRecentInput: false }, // gap > 1 s → new window
    ];
    expect(computeCls(entries)).toBeCloseTo(0.1);
  });

  it("caps a window at 5 s even with continuous shifts", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ value: 0.01, startTime: i * 600, hadRecentInput: false }));
    // 0..4800 ms is one window (9 shifts), the rest start another
    expect(computeCls(entries)).toBeCloseTo(0.09);
  });

  it("ignores shifts that follow user input", () => {
    expect(computeCls([{ value: 0.5, startTime: 10, hadRecentInput: true }])).toBe(0);
  });
});

describe("computeInp", () => {
  it("is null with no interactions and the worst one for a small page", () => {
    expect(computeInp([])).toBeNull();
    expect(computeInp([40, 210, 80])).toBe(210);
  });
});

describe("privacy shaping", () => {
  it("buckets values so they can't fingerprint", () => {
    expect(bucket(2437, 100)).toBe(2400);
    expect(bucket(0.0349, 0.01)).toBeCloseTo(0.03);
    expect(bucket(83, 10)).toBe(80);
  });

  it("reports only the path, never a query string, and normalizes slashes", () => {
    expect(normalizeRoute("/friends/")).toBe("/friends");
    expect(normalizeRoute("/")).toBe("/");
    expect(normalizeRoute("")).toBe("/");
    expect(normalizeRoute("/x".repeat(40)).length).toBeLessThanOrEqual(48);
  });
});
