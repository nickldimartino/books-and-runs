// "Welcome back" on Home: remembers when this device last opened Home, so a
// returning player after a few days away gets a friendly recap instead of a
// silently re-rendered page. Device-level and account-agnostic (a timestamp
// only) — nothing here is personal data, so it needs no account-switch
// handling.

import { readLocalStorage, writeLocalStorage } from "./localStorageUtil";

const KEY = "booksAndRuns:lastHomeVisit";

/** Days away before the card appears — a couple of days is "a normal gap
 * between sessions", not an absence worth remarking on. */
export const WELCOME_BACK_AFTER_DAYS = 3;

const DAY_MS = 86_400_000;

export function readLastHomeVisit(): number | null {
  const raw = readLocalStorage(KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function touchHomeVisit(now: number = Date.now()): void {
  writeLocalStorage(KEY, String(now));
}

/** True only for a genuine return: there IS a previous visit, and it was at
 * least WELCOME_BACK_AFTER_DAYS ago. A brand-new device has no previous
 * visit, so never gets a "welcome back". */
export function isReturningAfterAbsence(last: number | null, now: number = Date.now()): boolean {
  return last !== null && now - last >= WELCOME_BACK_AFTER_DAYS * DAY_MS;
}
