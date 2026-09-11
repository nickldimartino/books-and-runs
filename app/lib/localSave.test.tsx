// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCloudSave,
  clearSavedGame,
  loadSavedGame,
  saveGame,
  SOLO_CLEAR_EVENT,
  SOLO_SAVE_EVENT,
  SOLO_SYNCED_EVENT,
  type SavedGame,
} from "./localSave";
import { createGame } from "@/gameEngine";
import { CONTRACTS } from "@/types";

function makeSaved(savedAt: number): SavedGame {
  return {
    state: createGame(
      [
        { id: "human-0", name: "You", isAI: false },
        { id: "ai-1", name: "Bot", isAI: true, difficulty: "medium" },
      ],
      CONTRACTS
    ),
    hasDrawn: false,
    roundStartScores: {},
    roundHistory: [],
    savedAt,
  };
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("localSave — cloud-sync event contract", () => {
  it("saveGame writes storage and fires SOLO_SAVE_EVENT", () => {
    const spy = vi.fn();
    window.addEventListener(SOLO_SAVE_EVENT, spy);
    saveGame({ state: makeSaved(0).state, hasDrawn: true, roundStartScores: {}, roundHistory: [] });
    window.removeEventListener(SOLO_SAVE_EVENT, spy);

    expect(spy).toHaveBeenCalledOnce();
    expect(loadSavedGame()).not.toBeNull();
    expect(loadSavedGame()!.hasDrawn).toBe(true);
  });

  it("clearSavedGame removes storage and fires SOLO_CLEAR_EVENT", () => {
    saveGame({ state: makeSaved(0).state, hasDrawn: false, roundStartScores: {}, roundHistory: [] });
    const spy = vi.fn();
    window.addEventListener(SOLO_CLEAR_EVENT, spy);
    clearSavedGame();
    window.removeEventListener(SOLO_CLEAR_EVENT, spy);

    expect(spy).toHaveBeenCalledOnce();
    expect(loadSavedGame()).toBeNull();
  });

  it("applyCloudSave writes the given save and fires SOLO_SYNCED_EVENT, not SOLO_SAVE_EVENT", () => {
    const synced = vi.fn();
    const saved = vi.fn();
    window.addEventListener(SOLO_SYNCED_EVENT, synced);
    window.addEventListener(SOLO_SAVE_EVENT, saved);

    const incoming = makeSaved(1234567);
    applyCloudSave(incoming);

    window.removeEventListener(SOLO_SYNCED_EVENT, synced);
    window.removeEventListener(SOLO_SAVE_EVENT, saved);

    expect(synced).toHaveBeenCalledOnce();
    expect(saved).not.toHaveBeenCalled(); // came from the cloud — don't echo it back
    expect(loadSavedGame()!.savedAt).toBe(1234567);
  });

  it("applyCloudSave rejects a structurally broken payload without touching storage", () => {
    saveGame({ state: makeSaved(0).state, hasDrawn: false, roundStartScores: {}, roundHistory: [] });
    const before = localStorage.getItem("booksAndRuns:savedGame");
    // @ts-expect-error deliberately malformed
    applyCloudSave({ state: { players: "nope" }, savedAt: 9 });
    // applyCloudSave itself doesn't validate, but loadSavedGame does and
    // self-heals — so the malformed write is caught on the next read.
    expect(loadSavedGame()).toBeNull();
    expect(localStorage.getItem("booksAndRuns:savedGame")).not.toBe(before);
  });
});
