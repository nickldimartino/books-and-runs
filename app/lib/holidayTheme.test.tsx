import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeHoliday, clearHolidayOptOut, getDisplayTheme, HolidayId, recordExplicitThemePick } from "./holidayTheme";

function d(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

describe("activeHoliday", () => {
  it("is null on a day far from any holiday", () => {
    expect(activeHoliday(d("2026-01-20"))).toBeNull();
    expect(activeHoliday(d("2026-08-15"))).toBeNull();
  });

  it("is active exactly 7 days before and after a fixed-date holiday, not 8", () => {
    expect(activeHoliday(d("2026-10-24"))?.id).toBe("halloween"); // -7
    expect(activeHoliday(d("2026-10-31"))?.id).toBe("halloween"); // center
    expect(activeHoliday(d("2026-11-07"))?.id).toBe("halloween"); // +7
    expect(activeHoliday(d("2026-10-23"))).toBeNull();
    expect(activeHoliday(d("2026-11-08"))).toBeNull();
  });

  it("computes Easter via Computus and windows around it", () => {
    // 2026 Easter is April 5.
    expect(activeHoliday(d("2026-04-05"))?.id).toBe("easter");
    expect(activeHoliday(d("2026-03-29"))?.id).toBe("easter");
    expect(activeHoliday(d("2026-04-12"))?.id).toBe("easter");
    expect(activeHoliday(d("2026-03-28"))).not.toMatchObject({ id: "easter" });
  });

  it("computes Thanksgiving as the 4th Thursday of November", () => {
    // 2026: Nov 1 is a Sunday, so the 4th Thursday is Nov 26.
    expect(activeHoliday(d("2026-11-26"))?.id).toBe("thanksgiving");
  });

  it("resolves an overlap (Christmas/New Year's) by closest center date", () => {
    expect(activeHoliday(d("2026-12-25"))?.id).toBe("christmas");
    expect(activeHoliday(d("2026-12-28"))?.id).toBe("christmas");
    expect(activeHoliday(d("2026-12-29"))?.id).toBe("newyears");
    expect(activeHoliday(d("2026-12-31"))?.id).toBe("newyears");
    expect(activeHoliday(d("2027-01-01"))?.id).toBe("newyears");
  });

  it("finds Hanukkah from the hand-maintained table and returns null outside it", () => {
    // 2026 first night is Dec 4.
    expect(activeHoliday(d("2026-12-04"))?.id).toBe("hanukkah");
    expect(activeHoliday(d("2040-12-04"))).toBeNull();
  });

  it("carries New Year's window correctly across a year boundary", () => {
    expect(activeHoliday(d("2026-01-01"))?.id).toBe("newyears");
    expect(activeHoliday(d("2025-12-29"))?.id).toBe("newyears");
  });
});

describe("getDisplayTheme", () => {
  const realMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  function setPrefersDark(isDark: boolean) {
    window.matchMedia = vi.fn().mockReturnValue({ matches: isDark }) as unknown as typeof window.matchMedia;
  }

  it("returns the saved theme outside any holiday window", () => {
    expect(getDisplayTheme("midnight", d("2026-06-01"))).toBe("midnight");
    expect(getDisplayTheme("noir", d("2026-06-01"))).toBe("noir");
  });

  it("overrides the saved theme with the holiday's dark variant when the system prefers dark", () => {
    setPrefersDark(true);
    expect(getDisplayTheme("noir", d("2026-10-31"))).toBe("halloween");
  });

  it("overrides with the light variant when the system prefers light", () => {
    setPrefersDark(false);
    expect(getDisplayTheme("noir", d("2026-10-31"))).toBe("candycorn");
  });

  it("stops overriding once an explicit pick is recorded during the active window", () => {
    setPrefersDark(true);
    expect(getDisplayTheme("noir", d("2026-10-31"))).toBe("halloween");
    recordExplicitThemePick(d("2026-10-31"));
    expect(getDisplayTheme("noir", d("2026-10-31"))).toBe("noir");
    // Still respected later in the same window.
    expect(getDisplayTheme("noir", d("2026-11-07"))).toBe("noir");
  });

  it("resumes overriding once the opted-out window actually ends", () => {
    setPrefersDark(true);
    recordExplicitThemePick(d("2026-10-31"));
    expect(getDisplayTheme("noir", d("2026-11-07"))).toBe("noir");
    // Nov 8 is outside Halloween's window entirely, so no override either way.
    expect(getDisplayTheme("noir", d("2026-11-08"))).toBe("noir");
  });

  it("does not carry an opt-out recorded for one holiday into a later, different holiday", () => {
    setPrefersDark(true);
    recordExplicitThemePick(d("2026-10-31")); // opts out of Halloween
    expect(getDisplayTheme("noir", d("2026-11-26"))).toBe("thanksgiving");
  });

  it("recordExplicitThemePick is a no-op when no holiday is active", () => {
    recordExplicitThemePick(d("2026-06-01"));
    setPrefersDark(true);
    expect(getDisplayTheme("noir", d("2026-10-31"))).toBe("halloween");
  });

  it("clearHolidayOptOut makes the override resume immediately, mid-window", () => {
    setPrefersDark(true);
    recordExplicitThemePick(d("2026-10-31"));
    expect(getDisplayTheme("noir", d("2026-10-31"))).toBe("noir");
    clearHolidayOptOut();
    expect(getDisplayTheme("noir", d("2026-10-31"))).toBe("halloween");
  });
});

// init.js is hand-duplicated logic (see that file's own doc on why — same
// trade-off THEME_IDS/THEME_BG already make there) and has to keep
// returning the exact same holiday for the exact same day as this module,
// or a page's pre-paint theme and its post-hydration theme would disagree.
// Loaded and exercised the same way app/sw.test.tsx loads sw.template.js.
describe("agrees with public/init.js", () => {
  function loadInitJsHolidayHelpers(): {
    activeHoliday: (now: Date) => { id: HolidayId; dark: string; light: string; windowEndMs: number } | null;
  } {
    const src = readFileSync(join(process.cwd(), "public", "init.js"), "utf8");
    // Pull the IIFE body out and expose its internal helpers via a stub
    // `module` the same way sw.template.js's own test does, without
    // needing init.js itself to branch on being under test — the rest of
    // its body (DOM/localStorage access) simply never runs since nothing
    // here calls the outer IIFE, only the extracted function declarations.
    const start = src.indexOf("(function () {");
    const end = src.lastIndexOf("})();");
    const body = src.slice(start + "(function () {".length, end);
    const wrapped = `${body}\nmodule.exports = { activeHoliday: activeHoliday };`;
    const mod = { exports: {} as unknown };
    new Function("module", "window", "document", "localStorage", "location", "sessionStorage", wrapped)(
      mod,
      {},
      {},
      {},
      {},
      {}
    );
    return mod.exports as ReturnType<typeof loadInitJsHolidayHelpers>;
  }

  const helpers = loadInitJsHolidayHelpers();

  it("matches this module's activeHoliday() for every day across a 6-year span", () => {
    const start = new Date("2024-01-01T12:00:00.000Z");
    const end = new Date("2030-01-01T12:00:00.000Z");
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      const now = new Date(t);
      const ours = activeHoliday(now);
      const theirs = helpers.activeHoliday(now);
      const label = now.toISOString().slice(0, 10);
      if (ours === null || theirs === null) {
        expect([ours, theirs], label).toEqual([null, null]);
      } else {
        expect({ id: theirs.id, dark: theirs.dark, light: theirs.light, windowEndMs: theirs.windowEndMs }, label).toEqual({
          id: ours.id,
          dark: ours.dark,
          light: ours.light,
          windowEndMs: ours.windowEndMs,
        });
      }
    }
  });
});
