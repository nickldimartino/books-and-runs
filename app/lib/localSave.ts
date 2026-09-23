import type { SupabaseClient } from "@supabase/supabase-js";
import { MoveLogEntry } from "@/moveLog";
import { GameState } from "@/types";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "./localStorageUtil";
import { RoundHistoryEntry } from "./recordGameResult";

// localStorage persistence for an in-progress solo/pass-and-play game (and
// its Daily Deal / Weekly Challenge siblings below, each in their own save
// slot — see DAILY_DEAL_SAVE_KEY's own doc for why they're kept separate).
// This is the source of truth GameContext.tsx reads and writes locally;
// LocalSaveSync.tsx mirrors the real-game slot to the account when signed
// in, so it resumes across devices too.

const SAVE_KEY = "booksAndRuns:savedGame";

// A Daily Deal in progress gets its own slot, entirely separate from
// SAVE_KEY: the two can be in flight at once (a real solo/pass-and-play game
// paused while today's deal is played), and neither should be able to
// clobber the other. Deliberately local-only, unlike SAVE_KEY — it's never
// wired into LocalSaveSync's cloud push — Daily Deal already isn't tracked
// across devices (see dailyDealStore.ts), and an in-progress one-round
// challenge isn't worth the extra sync surface; exiting early just means
// resuming on the same device you left it on.
const DAILY_DEAL_SAVE_KEY = "booksAndRuns:dailyDealSave";
// Same reasoning as DAILY_DEAL_SAVE_KEY, its own slot for the Weekly
// Challenge (see weeklyChallengeStore.ts) — all three (a real game, Daily
// Deal, Weekly Challenge) can be in flight at once, none should clobber
// another.
const WEEKLY_CHALLENGE_SAVE_KEY = "booksAndRuns:weeklyChallengeSave";

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
  // The integer this game's whole deal (every round) is reproducible from
  // — see deck.ts's roundSeed and GameContext.tsx's gameSeedRef. Optional/
  // absent for a save made before this field existed; a game with no seed
  // just can't be server-verified at game-over, so it's skipped entirely —
  // treated as untracked for that one game, same as trackStats off (see
  // GameOverScreen.tsx's attemptSave).
  seed?: number | null;
  // Every draw/meld/lay-off/discard so far this game, alongside `seed` —
  // together, everything a server-side replay needs. Same optionality
  // reasoning as `seed`.
  moveLog?: MoveLogEntry[];
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

/**
 * One save slot's load/save/clear trio, parametrized by storage key — the
 * real game, Daily Deal, and Weekly Challenge saves are identical in shape
 * and validity check (looksLikeSavedGame) and only ever differed by which
 * key they used and whether they fired an event, previously three
 * line-for-line copies of the same three functions. Events are optional:
 * only the real save slot fires them (LocalSaveSync listens, to mirror it
 * to the account — Daily Deal/Weekly Challenge saves are deliberately
 * local-only, see DAILY_DEAL_SAVE_KEY's own doc).
 */
function makeSaveSlot(key: string, events?: { save?: string; clear?: string }) {
  function load(): SavedGame | null {
    const raw = readLocalStorage(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!looksLikeSavedGame(parsed)) {
        // Unusable — drop it so a reload doesn't keep hitting the same crash.
        clear();
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function save(data: Omit<SavedGame, "savedAt">): void {
    const wrote = writeLocalStorage(key, JSON.stringify({ ...data, savedAt: Date.now() }));
    // Only on an actual successful write — matches the original per-slot
    // functions, which had emit() inside the same try block as setItem, so
    // a throw (quota full, storage disabled) skipped it too.
    if (wrote && events?.save) emit(events.save);
  }

  function clear(): void {
    removeLocalStorage(key);
    if (events?.clear) emit(events.clear);
  }

  return { load, save, clear };
}

const soloSlot = makeSaveSlot(SAVE_KEY, { save: SOLO_SAVE_EVENT, clear: SOLO_CLEAR_EVENT });
export const loadSavedGame = soloSlot.load;
export const saveGame = soloSlot.save;
export const clearSavedGame = soloSlot.clear;

const dailyDealSlot = makeSaveSlot(DAILY_DEAL_SAVE_KEY);
export const loadDailyDealSave = dailyDealSlot.load;
export const saveDailyDealGame = dailyDealSlot.save;
export const clearDailyDealSave = dailyDealSlot.clear;

const weeklyChallengeSlot = makeSaveSlot(WEEKLY_CHALLENGE_SAVE_KEY);
export const loadWeeklyChallengeSave = weeklyChallengeSlot.load;
export const saveWeeklyChallengeGame = weeklyChallengeSlot.save;
export const clearWeeklyChallengeSave = weeklyChallengeSlot.clear;

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
  // A real Supabase error (network/auth/etc.) throws, same as every sibling
  // "pull the account's synced X" function — both call sites (LocalSaveSync,
  // page.tsx's handleContinue) already catch and treat this differently from
  // a genuine "no save yet" (!data with no error), so silently returning
  // null for both used to make a transient failure indistinguishable from
  // "you have nothing saved," which could skip a real resume.
  if (error) throw error;
  if (!data) return null;
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
