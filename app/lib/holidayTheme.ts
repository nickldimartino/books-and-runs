// Automated holiday theming: for the 7 days before and after each of 9 US
// holidays, the *display* theme defaults to that holiday's dark/light pair
// (see themeStore.ts's 18 holiday THEMES, which already existed as
// purchasable picks before this file — this is what makes them show up
// for everyone, free, without anyone owning them) — for every visitor,
// signed in or not, unless that visitor explicitly picks a theme of their
// own during the window (see recordExplicitPick below).
//
// Deliberately never touches the *saved* theme (themeStore.ts's
// loadLocalTheme/saveLocalTheme, or the account's `settings.theme` row) —
// this is a display-only override layered on top, the same way a table
// felt color never changes what's actually in anyone's hand. That split is
// what lets AccountSwitchGuard.tsx keep enforcing "a signed-out visitor
// has no saved theme of their own" completely unchanged: it still resets
// *storage* to DEFAULT_THEME, and simply paints whatever getDisplayTheme()
// says instead of hardcoding DEFAULT_THEME for the paint too.
//
// getDisplayTheme()'s date/window logic is duplicated by hand in
// public/init.js (the pre-paint script — the only place most page loads
// actually paint a theme at all; see that file's own doc for why
// everything theme-related is hand-duplicated there) — see
// holidayTheme.test.ts's "agrees with init.js" suite, which evaluates
// init.js's own holiday block against this module across a wide date
// range instead of trusting the two copies to stay in sync by eye. Keep
// both in sync by hand when adding or changing a holiday.

import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "./localStorageUtil";
import { ThemeId } from "./themeStore";

export type HolidayId =
  | "valentines"
  | "stpatricks"
  | "easter"
  | "july4th"
  | "halloween"
  | "thanksgiving"
  | "hanukkah"
  | "christmas"
  | "newyears";

interface HolidayDef {
  id: HolidayId;
  dark: ThemeId;
  light: ThemeId;
  /** The holiday's own Gregorian date in a given year — null if this
   * holiday's date isn't known for that year (see HANUKKAH_FIRST_NIGHT). */
  centerForYear: (year: number) => { month: number; day: number } | null;
}

const WINDOW_DAYS = 7;

function fixed(month: number, day: number) {
  return () => ({ month, day });
}

/** Meeus/Jones/Butcher Gregorian Easter algorithm — standard, public-domain
 * Computus. Returns the Gregorian month/day of Easter Sunday. */
function easterDate(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** 4th Thursday of November. */
function thanksgivingDate(year: number): { month: number; day: number } {
  const nov1Dow = new Date(Date.UTC(year, 10, 1)).getUTCDay(); // 0=Sun..6=Sat
  const firstThursday = 1 + ((4 - nov1Dow + 7) % 7);
  return { month: 11, day: firstThursday + 21 };
}

// First night of Hanukkah, by hand — the Hebrew calendar doesn't reduce to
// a formula worth inlining here, so (like community_milestones' own
// "add the next one by hand" precedent) this is a maintained table rather
// than computed. Verify/extend a few years out periodically; a year with
// no entry simply means Hanukkah doesn't get a holiday window that year
// instead of showing a wrong one.
const HANUKKAH_FIRST_NIGHT: Record<number, { month: number; day: number }> = {
  2024: { month: 12, day: 25 },
  2025: { month: 12, day: 14 },
  2026: { month: 12, day: 4 },
  2027: { month: 12, day: 24 },
  2028: { month: 12, day: 12 },
  2029: { month: 12, day: 1 },
  2030: { month: 12, day: 20 },
  2031: { month: 12, day: 9 },
  2032: { month: 11, day: 27 },
  2033: { month: 12, day: 16 },
  2034: { month: 12, day: 6 },
  2035: { month: 12, day: 25 },
};

// Index order is this module's own tie-break for same-distance overlaps —
// otherwise arbitrary.
const HOLIDAYS: HolidayDef[] = [
  { id: "valentines", dark: "valentines", light: "sweetheart", centerForYear: fixed(2, 14) },
  { id: "stpatricks", dark: "stpatricks", light: "cloverfield", centerForYear: fixed(3, 17) },
  { id: "easter", dark: "springdusk", light: "easter", centerForYear: easterDate },
  { id: "july4th", dark: "july4th", light: "starsandstripes", centerForYear: fixed(7, 4) },
  { id: "halloween", dark: "halloween", light: "candycorn", centerForYear: fixed(10, 31) },
  { id: "thanksgiving", dark: "thanksgiving", light: "pumpkinspice", centerForYear: thanksgivingDate },
  { id: "hanukkah", dark: "hanukkah", light: "festivaloflights", centerForYear: (y) => HANUKKAH_FIRST_NIGHT[y] ?? null },
  { id: "christmas", dark: "christmas", light: "candycane", centerForYear: fixed(12, 25) },
  { id: "newyears", dark: "newyears", light: "confetti", centerForYear: fixed(1, 1) },
];

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function utcMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export interface ActiveHoliday {
  id: HolidayId;
  dark: ThemeId;
  light: ThemeId;
  /** Epoch ms (UTC midnight) the window ends — inclusive last day, end of
   * that day. Used as the opt-out expiry. */
  windowEndMs: number;
}

/**
 * Which holiday (if any) is active for `now`, resolving an overlap between
 * two holidays' windows (e.g. late Hanukkah bumping into Christmas, or an
 * early Easter bumping into St. Patrick's) by picking whichever holiday's
 * own date `now` is closest to. Checks each holiday's date in `now`'s
 * year, the year before, and the year after, since a window can cross a
 * year boundary (Christmas, New Year's) in either direction.
 */
export function activeHoliday(now: Date): ActiveHoliday | null {
  const todayUtc = utcMidnight(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  let best: { def: HolidayDef; distance: number; centerDate: Date } | null = null;

  for (const def of HOLIDAYS) {
    for (const yearOffset of [-1, 0, 1]) {
      const year = now.getUTCFullYear() + yearOffset;
      const center = def.centerForYear(year);
      if (!center) continue;
      const centerDate = utcMidnight(year, center.month, center.day);
      const distance = Math.abs(daysBetween(todayUtc, centerDate));
      if (distance > WINDOW_DAYS) continue;
      if (!best || distance < best.distance) best = { def, distance, centerDate };
    }
  }

  if (!best) return null;
  // Midnight UTC of the day *after* the last day in the window (exclusive
  // upper bound), so any moment during the window's actual last calendar
  // day — not just up to that day's midnight — still counts as "within
  // the window" for the opt-out check below.
  const windowEnd = new Date(best.centerDate.getTime() + (WINDOW_DAYS + 1) * 86400000);
  return {
    id: best.def.id,
    dark: best.def.dark,
    light: best.def.light,
    windowEndMs: windowEnd.getTime(),
  };
}

function prefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return true;
  }
}

const OPT_OUT_KEY = "booksAndRuns:holidayThemeOptOut";

interface OptOut {
  holidayId: HolidayId;
  untilMs: number;
}

function loadOptOut(): OptOut | null {
  const raw = readLocalStorage(OPT_OUT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OptOut>;
    if (
      typeof parsed.holidayId === "string" &&
      HOLIDAYS.some((h) => h.id === parsed.holidayId) &&
      typeof parsed.untilMs === "number"
    ) {
      return { holidayId: parsed.holidayId as HolidayId, untilMs: parsed.untilMs };
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Call when the visitor explicitly picks a theme of their own (Settings >
 * Theme) — "it can still be changed" from the feature's own brief. Marks
 * the *currently active* holiday (if any) as skipped through the rest of
 * its window, so the override in getDisplayTheme() stops re-asserting
 * itself over that explicit pick on the very next page load. A no-op when
 * no holiday is active right now. Cleared automatically once the window
 * it was recorded for ends (loadOptOut/getDisplayTheme both check
 * `untilMs`), so next year's window starts fresh.
 */
export function recordExplicitThemePick(now: Date = new Date()): void {
  const active = activeHoliday(now);
  if (!active) return;
  writeLocalStorage(OPT_OUT_KEY, JSON.stringify({ holidayId: active.id, untilMs: active.windowEndMs } satisfies OptOut));
}

/** The "reset to defaults" half of this feature — see themeStore.ts's
 * DEFAULT_THEME doc: a reset is a deliberate return to literal baseline,
 * which includes forgetting any in-window opt-out so the ambient holiday
 * default (if one's active) resumes immediately. */
export function clearHolidayOptOut(): void {
  removeLocalStorage(OPT_OUT_KEY);
}

/**
 * The theme to actually paint right now: `saved` unless a holiday window
 * is active and the visitor hasn't explicitly picked a theme of their own
 * during it. Never reads or writes the saved theme itself — pass in
 * whatever themeStore.loadLocalTheme() (or an account's synced value)
 * currently is.
 */
export function getDisplayTheme(saved: ThemeId, now: Date = new Date()): ThemeId {
  const active = activeHoliday(now);
  if (!active) return saved;
  const optOut = loadOptOut();
  if (optOut && optOut.holidayId === active.id && now.getTime() < optOut.untilMs) return saved;
  return prefersDark() ? active.dark : active.light;
}
