import type { SupabaseClient } from "@supabase/supabase-js";
import { GameState } from "@/types";
import { RoundHistoryEntry } from "./recordGameResult";

const SAVE_KEY = "booksAndRuns:savedGame";

// Fired after the local saved game is written / cleared, so LocalSaveSync
// can mirror it to the account (see LocalSaveSync.tsx). `br:solo-synced`
// goes the other way — LocalSaveSync fires it after pulling a newer save
// down from the cloud, so GameContext re-reads hasSavedGame.
export const SOLO_SAVE_EVENT = "br:solo-save";
export const SOLO_CLEAR_EVENT = "br:solo-clear";
export const SOLO_SYNCED_EVENT = "br:solo-synced";

function emit(name: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}

export interface SavedGame {
  state: GameState;
  hasDrawn: boolean;
  roundStartScores: Record<string, number>;
  roundHistory: RoundHistoryEntry[];
  // Achievement counter deltas accumulated so far this game (see
  // GameContext.tsx's sessionCountersRef) — persisted so resuming a saved
  // game after closing the app doesn't silently drop this game's progress.
  // Optional since saves made before this field existed won't have it.
  sessionCounters?: Record<string, number>;
  // Whether this game's results should be recorded to the signed-in
  // account at all (player_stats, achievement_counters, the leaderboard) —
  // set once at New Game and carried through so resuming a saved game
  // later doesn't silently revert an "off" choice back to tracking.
  // Optional/defaults to true (tracking on) for saves made before this
  // field existed.
  trackStats?: boolean;
  savedAt: number;
}

/**
 * Whether a parsed value has the shape the game screen actually renders.
 * The try/catch below only catches malformed JSON — a *structurally* wrong
 * object (say `state.players` isn't an array) would otherwise sail through
 * and crash GameContext/game/page.tsx on the first `.map`, with no in-app
 * way back out. Corruption is rare but real: an interrupted write, storage
 * eviction, a browser extension, or a future change to GameState's shape.
 */
function looksLikeSavedGame(v: unknown): v is SavedGame {
  if (!v || typeof v !== "object") return false;
  const g = v as Record<string, unknown>;
  const s = g.state as Record<string, unknown> | undefined;
  return (
    !!s &&
    typeof s === "object" &&
    Array.isArray(s.players) &&
    s.players.length > 0 &&
    Array.isArray(s.selectedContracts) &&
    s.selectedContracts.length > 0 &&
    typeof s.round === "number" &&
    Array.isArray(s.drawPile) &&
    Array.isArray(s.discardPile) &&
    Array.isArray(s.melds)
  );
}

export function loadSavedGame(): SavedGame | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!looksLikeSavedGame(parsed)) {
      // Unusable — drop it so a reload doesn't keep hitting the same crash.
      clearSavedGame();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveGame(data: Omit<SavedGame, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
    emit(SOLO_SAVE_EVENT);
  } catch {
    // storage unavailable/full — local persistence is a nicety, not required
  }
}

export function clearSavedGame(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
  emit(SOLO_CLEAR_EVENT);
}

/**
 * Writes a SavedGame pulled from the cloud straight into local storage
 * (used by LocalSaveSync when another device has a newer save). Skips the
 * SOLO_SAVE_EVENT — this came *from* the cloud, re-pushing it would be a
 * pointless round-trip — and fires SOLO_SYNCED_EVENT so the UI refreshes.
 */
export function applyCloudSave(data: SavedGame): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    emit(SOLO_SYNCED_EVENT);
  } catch {
    // ignore
  }
}

interface SoloSaveRow {
  save: SavedGame;
  saved_at: number;
}

/** The account's synced solo/pass-and-play save, or null. Same shape check
 * as loadSavedGame — a structurally broken row is treated as absent. */
export async function loadCloudSave(
  supabase: SupabaseClient,
  userId: string
): Promise<SavedGame | null> {
  const { data, error } = await supabase
    .from("solo_saves")
    .select("save, saved_at")
    .eq("user_id", userId)
    .maybeSingle<SoloSaveRow>();
  if (error || !data) return null;
  return looksLikeSavedGame(data.save) ? data.save : null;
}

export async function pushCloudSave(
  supabase: SupabaseClient,
  userId: string,
  data: SavedGame
): Promise<void> {
  const { error } = await supabase.from("solo_saves").upsert({
    user_id: userId,
    save: data,
    saved_at: data.savedAt,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function clearCloudSave(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from("solo_saves").delete().eq("user_id", userId);
  if (error) throw error;
}

// A tutorial game deliberately never touches SAVE_KEY (see GameContext.tsx's
// persist()), so /game's "recover from localStorage if a navigation here
// landed with no in-memory state" fallback has nothing to find for one.
// This is a much smaller, ephemeral signal for exactly that one case: the
// tutorial is a fixed, scripted deal (see src/tutorial.ts), so "recovering"
// it just means starting it fresh again — nothing real to lose. sessionStorage
// (not localStorage) since this should never survive past the current tab.
const TUTORIAL_STARTING_KEY = "booksAndRuns:tutorialStarting";

export function markTutorialStarting(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(TUTORIAL_STARTING_KEY, "1");
  } catch {
    // ignore
  }
}

/** Reads and clears the flag in one step — it's only ever meant to be acted on once. */
export function consumeTutorialStartingFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const was = window.sessionStorage.getItem(TUTORIAL_STARTING_KEY) === "1";
    window.sessionStorage.removeItem(TUTORIAL_STARTING_KEY);
    return was;
  } catch {
    return false;
  }
}
