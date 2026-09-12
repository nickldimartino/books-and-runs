// @vitest-environment jsdom

// Covers both directions: applying a pulled-down account row onto this
// device's local stores + DOM attributes (and only the fields the account
// actually set), and pushing local changes back up — including that the
// two volume sliders specifically get debounced rather than writing on
// every drag tick.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AccountSettingsRow,
  applyAccountSettings,
  bootstrapMissingAccountSettings,
  onAccountSettingsSynced,
  pushAllDefaults,
  pushCardBack,
  pushCardFace,
  pushColorblindMode,
  pushHouseSettingsPatch,
  pushTheme,
  resetLocalPreferencesToDefaults,
} from "./accountSettingsSync";
import { DEFAULT_THEME, saveLocalTheme } from "./themeStore";

function fakeSupabase() {
  const upserts: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      upsert: async (row: Record<string, unknown>) => {
        upserts.push(row);
        return { error: null };
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, upserts };
}

function blankRow(): AccountSettingsRow {
  return {
    theme: null,
    card_back: null,
    card_face: null,
    colorblind_mode: null,
    preferred_ai_difficulty_default: null,
    sound_on: true,
    sound_volume: null,
    highlight_layoffs: null,
    show_whose_turn: null,
    ambient_music_enabled: null,
    ambient_volume: null,
    ambient_track: null,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-cardback");
  document.documentElement.removeAttribute("data-colorblind");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("applyAccountSettings", () => {
  it("applies every set field to its local store and DOM attribute", () => {
    applyAccountSettings({
      ...blankRow(),
      theme: "sakura",
      card_back: "noir",
      card_face: "bold",
      colorblind_mode: "protanopia",
      preferred_ai_difficulty_default: "hard",
      sound_on: false,
      sound_volume: 0.5,
      highlight_layoffs: false,
      show_whose_turn: false,
      ambient_music_enabled: true,
      ambient_volume: 0.2,
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("sakura");
    expect(document.documentElement.getAttribute("data-cardback")).toBe("noir");
    expect(document.documentElement.getAttribute("data-colorblind")).toBe("protanopia");
    expect(window.localStorage.getItem("booksAndRuns:cardFace")).toBe("bold");

    const settings = JSON.parse(window.localStorage.getItem("booksAndRuns:settings")!);
    expect(settings).toMatchObject({
      preferredAiDifficulty: "hard",
      soundEnabled: false,
      soundVolume: 0.5,
      highlightLayoffs: false,
      showWhoseTurn: false,
      ambientMusicEnabled: true,
      ambientVolume: 0.2,
    });
  });

  it("leaves a field the account never set at its existing local value", () => {
    window.localStorage.setItem(
      "booksAndRuns:settings",
      JSON.stringify({
        preferredAiDifficulty: "expert",
        soundEnabled: true,
        highlightLayoffs: true,
        showWhoseTurn: true,
        soundVolume: 0.9,
        ambientMusicEnabled: false,
        ambientVolume: 0.4,
      })
    );

    applyAccountSettings(blankRow());

    const settings = JSON.parse(window.localStorage.getItem("booksAndRuns:settings")!);
    // Untouched — the account row set nothing (aside from the always-set
    // sound_on, which happens to match the pre-existing local value here).
    expect(settings.preferredAiDifficulty).toBe("expert");
    expect(settings.soundVolume).toBe(0.9);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("fires the synced event so an already-mounted page can react", () => {
    const handler = vi.fn();
    const unsubscribe = onAccountSettingsSynced(handler);
    applyAccountSettings(blankRow());
    expect(handler).toHaveBeenCalledTimes(1);
    unsubscribe();
    applyAccountSettings(blankRow());
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("pushHouseSettingsPatch", () => {
  it("pushes non-volume fields immediately", async () => {
    const { client, upserts } = fakeSupabase();
    pushHouseSettingsPatch(client, "u1", { highlightLayoffs: true, showWhoseTurn: false });
    await Promise.resolve();
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ user_id: "u1", highlight_layoffs: true, show_whose_turn: false });
  });

  it("debounces sound/ambient volume — only the last value in a burst gets sent", async () => {
    vi.useFakeTimers();
    const { client, upserts } = fakeSupabase();

    pushHouseSettingsPatch(client, "u1", { soundVolume: 0.1 });
    pushHouseSettingsPatch(client, "u1", { soundVolume: 0.5 });
    pushHouseSettingsPatch(client, "u1", { soundVolume: 0.9 });
    expect(upserts).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(700);

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ sound_volume: 0.9 });
  });

  it("is a no-op signed out", async () => {
    const { client, upserts } = fakeSupabase();
    pushHouseSettingsPatch(client, null, { showWhoseTurn: true });
    pushHouseSettingsPatch(null, "u1", { showWhoseTurn: true });
    await Promise.resolve();
    expect(upserts).toHaveLength(0);
  });
});

describe("the small per-store push helpers", () => {
  it("pushTheme/pushCardBack/pushCardFace/pushColorblindMode each upsert their one field", async () => {
    const { client, upserts } = fakeSupabase();
    pushTheme(client, "u1", "midnight");
    pushCardBack(client, "u1", "match");
    pushCardFace(client, "u1", "classic");
    pushColorblindMode(client, "u1", "tritanopia");
    await Promise.resolve();

    expect(upserts).toHaveLength(4);
    expect(upserts.map((u) => Object.keys(u).find((k) => k !== "user_id" && k !== "updated_at")))
      .toEqual(["theme", "card_back", "card_face", "colorblind_mode"]);
  });
});

describe("resetLocalPreferencesToDefaults", () => {
  it("resets every local store and DOM attribute to its default, regardless of what was set", () => {
    window.localStorage.setItem(
      "booksAndRuns:settings",
      JSON.stringify({
        preferredAiDifficulty: "expert",
        soundEnabled: true,
        highlightLayoffs: true,
        showWhoseTurn: true,
        soundVolume: 0.9,
        ambientMusicEnabled: true,
        ambientVolume: 0.9,
        ambientTrack: "bounce",
      })
    );
    document.documentElement.setAttribute("data-theme", "sakura");
    document.documentElement.setAttribute("data-cardback", "noir");
    document.documentElement.setAttribute("data-colorblind", "protanopia");
    window.localStorage.setItem("booksAndRuns:cardFace", "bold");

    resetLocalPreferencesToDefaults();

    expect(document.documentElement.getAttribute("data-theme")).toBe(DEFAULT_THEME);
    // "off" is the absence of the attribute, not a literal "off" value.
    expect(document.documentElement.hasAttribute("data-colorblind")).toBe(false);
    expect(window.localStorage.getItem("booksAndRuns:cardFace")).toBe("classic");
    const settings = JSON.parse(window.localStorage.getItem("booksAndRuns:settings")!);
    expect(settings).toMatchObject({
      preferredAiDifficulty: "medium",
      ambientMusicEnabled: false,
      ambientTrack: "rotate",
    });
  });
});

describe("bootstrapMissingAccountSettings", () => {
  it("pushes this device's current local value for every field the account has never set", async () => {
    window.localStorage.setItem(
      "booksAndRuns:settings",
      JSON.stringify({
        preferredAiDifficulty: "hard",
        soundEnabled: true,
        highlightLayoffs: true,
        showWhoseTurn: true,
        soundVolume: 0.6,
        ambientMusicEnabled: false,
        ambientVolume: 0.4,
        ambientTrack: "skip",
      })
    );
    saveLocalTheme("sakura");

    const { client, upserts } = fakeSupabase();
    bootstrapMissingAccountSettings(client, "u1", blankRow());
    await Promise.resolve();

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      user_id: "u1",
      theme: "sakura",
      preferred_ai_difficulty_default: "hard",
      sound_volume: 0.6,
      ambient_track: "skip",
    });
  });

  it("pushes nothing when the account has already set every field", async () => {
    const { client, upserts } = fakeSupabase();
    bootstrapMissingAccountSettings(client, "u1", {
      ...blankRow(),
      theme: "sakura",
      card_back: "noir",
      card_face: "bold",
      colorblind_mode: "protanopia",
      preferred_ai_difficulty_default: "hard",
      sound_volume: 0.5,
      highlight_layoffs: false,
      show_whose_turn: false,
      ambient_music_enabled: true,
      ambient_volume: 0.2,
      ambient_track: "bounce",
    });
    await Promise.resolve();

    expect(upserts).toHaveLength(0);
  });
});

describe("pushAllDefaults", () => {
  it("sends every default value in one upsert", async () => {
    const { client, upserts } = fakeSupabase();
    pushAllDefaults(client, "u1", DEFAULT_THEME);
    await Promise.resolve();

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      user_id: "u1",
      theme: DEFAULT_THEME,
      card_back: "match",
      card_face: "classic",
      colorblind_mode: "off",
      sound_on: true,
    });
  });
});
