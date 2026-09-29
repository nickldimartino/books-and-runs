import { describe, expect, it } from "vitest";
import { latestRelease, notifiableReleases, RELEASE_NOTIFICATIONS_SINCE, releasesNewestFirst, RELEASES } from "./releases";

describe("RELEASES", () => {
  it("is non-empty and every entry has a real title, description, and well-formed version/date", () => {
    expect(RELEASES.length).toBeGreaterThan(0);
    for (const r of RELEASES) {
      expect(r.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(0);
      expect(["feature", "fix"]).toContain(r.kind);
    }
  });

  it("versions strictly increase (each release is newer than the last)", () => {
    for (let i = 1; i < RELEASES.length; i++) {
      const prev = RELEASES[i - 1].version.split(".").map(Number);
      const cur = RELEASES[i].version.split(".").map(Number);
      const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      expect(cmp(cur, prev)).toBeGreaterThan(0);
    }
  });

  it("dates are non-decreasing in the same order as versions", () => {
    for (let i = 1; i < RELEASES.length; i++) {
      expect(RELEASES[i].date >= RELEASES[i - 1].date).toBe(true);
    }
  });

  it("every sku is unique by version", () => {
    const versions = RELEASES.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
  });
});

describe("releasesNewestFirst", () => {
  it("reverses the chronological order without mutating RELEASES", () => {
    const before = [...RELEASES];
    const newest = releasesNewestFirst();
    expect(newest[0]).toEqual(RELEASES[RELEASES.length - 1]);
    expect(newest[newest.length - 1]).toEqual(RELEASES[0]);
    expect(RELEASES).toEqual(before);
  });
});

describe("latestRelease", () => {
  it("is the last (newest) entry", () => {
    expect(latestRelease()).toEqual(RELEASES[RELEASES.length - 1]);
  });
});

describe("notifiableReleases", () => {
  it("only includes releases at or after RELEASE_NOTIFICATIONS_SINCE, newest first", () => {
    const items = notifiableReleases();
    expect(items.length).toBeGreaterThan(0);
    for (const r of items) {
      const [rMaj, rMin, rPatch] = r.version.split(".").map(Number);
      const [cMaj, cMin, cPatch] = RELEASE_NOTIFICATIONS_SINCE.split(".").map(Number);
      const cmp = rMaj - cMaj || rMin - cMin || rPatch - cPatch;
      expect(cmp).toBeGreaterThanOrEqual(0);
    }
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].date >= items[i].date).toBe(true);
    }
  });

  it("excludes the bulk of the backfilled history (proves the cutoff actually filters something)", () => {
    expect(notifiableReleases().length).toBeLessThan(RELEASES.length);
  });

  it("never returns more than the requested cap, even once many releases exist after the cutoff", () => {
    expect(notifiableReleases(5).length).toBeLessThanOrEqual(5);
    expect(notifiableReleases(2).length).toBeLessThanOrEqual(2);
    // With only one real release at/after the cutoff today, the cap can't
    // actually bind yet — this just proves the parameter is honored.
    expect(notifiableReleases(0)).toEqual([]);
  });
});
