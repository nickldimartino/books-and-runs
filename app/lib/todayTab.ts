// State for Home's "Today" card: which of Daily / Weekly / Quests is showing.
// The choice is remembered per device (localStorage, best-effort) and
// public/init.js mirrors it onto <html data-today-tab> before first paint so
// the card can reserve the right height (see globals.css).

export type TodayTab = "daily" | "weekly" | "quests";

export const TODAY_TAB_KEY = "booksAndRuns:todayTab";
export const TODAY_TABS: readonly TodayTab[] = ["daily", "weekly", "quests"];

export function isTodayTab(v: unknown): v is TodayTab {
  return v === "daily" || v === "weekly" || v === "quests";
}

export function loadTodayTab(): TodayTab | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(TODAY_TAB_KEY);
    return isTodayTab(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveTodayTab(tab: TodayTab): void {
  try {
    window.localStorage.setItem(TODAY_TAB_KEY, tab);
    document.documentElement.setAttribute("data-today-tab", tab);
  } catch {
    // best-effort — the default logic below picks again next visit
  }
}

export interface TodayTabInputs {
  /** A quest was paid out on this visit (celebrate it). */
  questJustCompleted: boolean;
  dailyPlayedToday: boolean;
  weeklyPlayedThisWeek: boolean;
  /** Quests are hidden until the first game has been started. */
  questsAvailable: boolean;
}

/** The tab to open on when the player hasn't chosen one before: a fresh quest
 * payout first, else whatever is still unplayed today, else this week's
 * challenge, else the quests. */
export function defaultTodayTab(i: TodayTabInputs): TodayTab {
  if (i.questsAvailable && i.questJustCompleted) return "quests";
  if (!i.dailyPlayedToday) return "daily";
  if (!i.weeklyPlayedThisWeek) return "weekly";
  return i.questsAvailable ? "quests" : "daily";
}

/** What to show: the remembered tab if it is still selectable, else the
 * computed default (frozen by the caller once its data is ready), else Daily. */
export function resolveTodayTab(stored: TodayTab | null, auto: TodayTab | null, questsAvailable: boolean): TodayTab {
  const ok = (v: TodayTab | null): v is TodayTab => !!v && (v !== "quests" || questsAvailable);
  if (ok(stored)) return stored;
  if (ok(auto)) return auto;
  return "daily";
}
