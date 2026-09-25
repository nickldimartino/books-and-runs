// @vitest-environment jsdom

// The install nudge is deliberately rare — every gate below is a way it must
// NOT show (before a game is finished, when already installed, while backed
// off after a dismissal, after too many dismissals), so they're pinned here.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backoffMs,
  GAME_COMPLETED_EVENT,
  installHintKind,
  loadInstallState,
  MAX_DISMISSALS,
  recordGameCompleted,
  recordInstalled,
  recordInstallDismissed,
  requestPersistentStorage,
  type InstallHintInput,
} from "./installHint";
import { track } from "./analytics";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function input(over: Partial<InstallHintInput["state"]> & Partial<Omit<InstallHintInput, "state">> = {}): InstallHintInput {
  const { canPrompt = true, iosSafari = false, standalone = false, now = NOW, ...state } = over;
  return {
    state: { completedGames: 1, dismissals: 0, lastDismissedAt: null, installed: false, ...state },
    now,
    standalone,
    canPrompt,
    iosSafari,
  };
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("installHintKind", () => {
  it("waits for a completed game", () => {
    expect(installHintKind(input({ completedGames: 0 }))).toBeNull();
    expect(installHintKind(input({ completedGames: 1 }))).toBe("prompt");
  });

  it("uses the native prompt when the browser offered one, the iOS coach otherwise", () => {
    expect(installHintKind(input({ canPrompt: true, iosSafari: false }))).toBe("prompt");
    expect(installHintKind(input({ canPrompt: false, iosSafari: true }))).toBe("ios");
    expect(installHintKind(input({ canPrompt: false, iosSafari: false }))).toBeNull(); // nothing to offer
  });

  it("never shows to an already-installed app", () => {
    expect(installHintKind(input({ standalone: true }))).toBeNull();
    expect(installHintKind(input({ installed: true }))).toBeNull();
  });

  it("backs off exponentially after each dismissal (7d, 14d, 28d)", () => {
    expect(backoffMs(1)).toBe(7 * DAY);
    expect(backoffMs(2)).toBe(14 * DAY);
    expect(backoffMs(3)).toBe(28 * DAY);
    const dismissedAt = NOW - 6 * DAY;
    expect(installHintKind(input({ dismissals: 1, lastDismissedAt: dismissedAt }))).toBeNull();
    expect(installHintKind(input({ dismissals: 1, lastDismissedAt: NOW - 8 * DAY }))).toBe("prompt");
    expect(installHintKind(input({ dismissals: 2, lastDismissedAt: NOW - 8 * DAY }))).toBeNull();
    expect(installHintKind(input({ dismissals: 2, lastDismissedAt: NOW - 15 * DAY }))).toBe("prompt");
  });

  it("gives up for good after MAX_DISMISSALS", () => {
    expect(installHintKind(input({ dismissals: MAX_DISMISSALS, lastDismissedAt: NOW - 365 * DAY }))).toBeNull();
  });
});

describe("persisted state", () => {
  it("counts completed games and announces them", () => {
    const handler = vi.fn();
    window.addEventListener(GAME_COMPLETED_EVENT, handler);
    recordGameCompleted();
    recordGameCompleted();
    window.removeEventListener(GAME_COMPLETED_EVENT, handler);
    expect(loadInstallState().completedGames).toBe(2);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("track('game_completed') is what feeds it (analytics.ts hook)", () => {
    track("game_completed", { mode: "solo" });
    expect(loadInstallState().completedGames).toBe(1);
    track("game_started", {});
    expect(loadInstallState().completedGames).toBe(1);
  });

  it("records dismissals with a timestamp and installs permanently", () => {
    recordInstallDismissed(NOW);
    expect(loadInstallState()).toMatchObject({ dismissals: 1, lastDismissedAt: NOW });
    recordInstalled();
    expect(loadInstallState().installed).toBe(true);
  });

  it("survives corrupt storage", () => {
    window.localStorage.setItem("booksAndRuns:installHint", "{nope");
    expect(loadInstallState().completedGames).toBe(0);
  });
});

describe("requestPersistentStorage", () => {
  it("asks once per device and remembers", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "storage", {
      value: { persist, persisted: vi.fn().mockResolvedValue(false) },
      configurable: true,
    });
    expect(await requestPersistentStorage()).toBe(true);
    expect(await requestPersistentStorage()).toBeNull(); // already asked
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("is a no-op where the API doesn't exist", async () => {
    Object.defineProperty(navigator, "storage", { value: undefined, configurable: true });
    expect(await requestPersistentStorage()).toBeNull();
  });
});
