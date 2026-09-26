// The list behind Home's notification bell: every "something wants you"
// item from data the app already has (no server table of its own) plus a
// per-account local "seen" set, so opening the bell clears the dot without
// deleting anything actionable. The actionable counts are the SAME ones
// useNotifications.ts / appBadge.ts use (your-turn games, game invites,
// incoming friend requests) — countPendingTurns()'s test pins that.

import type { MpGameSummary } from "./mpStore";
import { readLocalStorage, writeLocalStorage } from "./localStorageUtil";
import type { ClaimedQuest } from "./verifySoloGame";

export type NotificationItem =
  | { kind: "turn"; id: string; game: MpGameSummary }
  | { kind: "invite"; id: string; game: MpGameSummary }
  | { kind: "friends"; id: string; count: number }
  | { kind: "shield"; id: string; day: string }
  | { kind: "quest"; id: string; quest: ClaimedQuest };

export interface NotificationSources {
  userId: string | null;
  games: MpGameSummary[];
  friendRequests: number;
  /** Newest unseen shield-covered day (dailyDealStore.unseenShieldSave). */
  shieldSaveDay?: string | null;
  /** Quests paid out on this visit (useQuests.justClaimed). */
  claimedQuests?: ClaimedQuest[];
}

export function isYourTurn(g: MpGameSummary, userId: string | null): boolean {
  return g.invite_status === "accepted" && g.status === "active" && !!userId && g.turn_user_id === userId;
}

/** Actionable items first (your turn, invites, friend requests), then the
 * informational ones. A new turn in the same game gets a new id (the turn's
 * start time) so it re-badges. */
export function buildNotificationItems(src: NotificationSources): NotificationItem[] {
  const items: NotificationItem[] = [];
  for (const g of src.games) {
    if (isYourTurn(g, src.userId)) {
      items.push({ kind: "turn", id: `turn:${g.game_id}:${g.turn_started_at ?? g.updated_at}`, game: g });
    }
  }
  for (const g of src.games) {
    if (g.invite_status === "invited") items.push({ kind: "invite", id: `invite:${g.game_id}`, game: g });
  }
  if (src.friendRequests > 0) {
    items.push({ kind: "friends", id: `friends:${src.friendRequests}`, count: src.friendRequests });
  }
  if (src.shieldSaveDay) items.push({ kind: "shield", id: `shield:${src.shieldSaveDay}`, day: src.shieldSaveDay });
  for (const q of src.claimedQuests ?? []) items.push({ kind: "quest", id: `quest:${q.period}:${q.id}`, quest: q });
  return items;
}

/** How many "things waiting" an item stands for (a friends row is N requests). */
export function itemWeight(item: NotificationItem): number {
  return item.kind === "friends" ? item.count : 1;
}

/** The actionable total — must equal useNotifications().total. */
export function actionableTotal(items: NotificationItem[]): number {
  return items.reduce((n, i) => (i.kind === "turn" || i.kind === "invite" || i.kind === "friends" ? n + itemWeight(i) : n), 0);
}

export function unseenCount(items: NotificationItem[], seen: ReadonlySet<string>): number {
  return items.reduce((n, i) => (seen.has(i.id) ? n : n + itemWeight(i)), 0);
}

/** "9+" past nine, so the badge never outgrows its circle. */
export function badgeLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}

// ── per-account "seen" set ───────────────────────────────────────────────

const SEEN_PREFIX = "booksAndRuns:notifSeen:";
const SEEN_CAP = 200;

export function loadSeen(userId: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(readLocalStorage(SEEN_PREFIX + userId) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Adds `ids` to the account's seen set (oldest dropped past the cap). */
export function markSeen(userId: string, ids: string[]): Set<string> {
  const next = loadSeen(userId);
  for (const id of ids) next.add(id);
  const arr = [...next].slice(-SEEN_CAP);
  writeLocalStorage(SEEN_PREFIX + userId, JSON.stringify(arr));
  return new Set(arr);
}
