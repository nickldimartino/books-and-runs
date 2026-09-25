// App-icon badge (the Badging API) for pending multiplayer turns. Supported by
// installed PWAs on Chromium desktop/Android and iOS 16.4+ Home Screen apps;
// a silent no-op elsewhere. The count is "things waiting on you": games where
// it's your move plus game invites — the same set the Home badge counts
// (useNotifications.ts), minus friend requests, which aren't time-critical.

import type { MpGameSummary } from "./mpStore";

export function countPendingTurns(games: MpGameSummary[], userId: string): number {
  return games.filter(
    (g) =>
      g.invite_status === "invited" ||
      (g.invite_status === "accepted" && g.status === "active" && g.turn_user_id === userId)
  ).length;
}

export function isBadgeSupported(): boolean {
  return typeof navigator !== "undefined" && typeof (navigator as Navigator).setAppBadge === "function";
}

export async function setAppBadgeCount(count: number): Promise<void> {
  if (!isBadgeSupported()) return;
  try {
    if (count > 0) await navigator.setAppBadge(count);
    else await navigator.clearAppBadge();
  } catch {
    /* best-effort */
  }
}
