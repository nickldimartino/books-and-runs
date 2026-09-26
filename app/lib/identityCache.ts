// The signed-in identity chip (display name + avatar) is fetched from the
// server, and every page that shows it used to start from "nothing" on mount —
// so moving between Home, Progress and Profile flashed the default avatar and
// generated name before the real ones arrived. This keeps the last known
// identity in memory (instant across client-side navigation) and in
// localStorage (instant on the first paint after a reload), always tagged with
// its user id so another account never sees it. It is display-only: the fetch
// still runs and overwrites it.

import type { AvatarInfo } from "./leaderboardStore";

export interface CachedIdentity {
  name: string | null;
  avatar: AvatarInfo | null;
}

const KEY = "booksAndRuns:identity";
/** Skip the refetch when the last one for this user was this recent. */
const FRESH_MS = 60_000;

let mem: { userId: string; identity: CachedIdentity; at: number } | null = null;

export function readIdentity(userId: string): CachedIdentity | null {
  if (mem && mem.userId === userId) return mem.identity;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; name?: string | null; avatar?: AvatarInfo | null };
    if (parsed.userId !== userId) return null;
    const identity = { name: parsed.name ?? null, avatar: parsed.avatar ?? null };
    mem = { userId, identity, at: 0 };
    return identity;
  } catch {
    return null;
  }
}

export function writeIdentity(userId: string, identity: CachedIdentity): void {
  mem = { userId, identity, at: Date.now() };
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ userId, ...identity }));
  } catch {
    // storage unavailable/full — the in-memory copy still covers navigation
  }
}

/** True when this user's identity was fetched within the last minute. */
export function identityIsFresh(userId: string): boolean {
  return !!mem && mem.userId === userId && Date.now() - mem.at < FRESH_MS;
}

/** Tests only. */
export function resetIdentityCacheForTests(): void {
  mem = null;
}
