// "House settings" — the preferences on the Settings page. Persisted in
// localStorage, and — when signed in — also mirrored to the account (see
// accountSettingsSync.ts); this file itself stays local-only and knows
// nothing about Supabase, same as every other store it's synced alongside.

import { Difficulty } from "@/types";

const KEY = "booksAndRuns:settings";

// "rotate" cycles through every song in ambience.ts's SONGS, crossfading
// between them; any other value pins ambience.ts to just that one song
// (still looping it) — see ambience.ts's own AMBIENT_SONGS for the list.
// Defined here (not in ambience.ts) so this file, which ambience.ts already
// imports from, stays dependency-free.
export type AmbientTrackChoice =
  | "rotate"
  | "arpeggio"
  | "bounce"
  | "skip"
  | "glide"
  | "descend"
  | "drift"
  | "rise"
  | "climb"
  | "settle"
  | "home";

export interface HouseSettings {
  preferredAiDifficulty: Difficulty;
  // Local-only, like theme — not synced to the account (see settings/page.tsx's
  // handleSave, which never includes these in the Supabase upsert).
  soundEnabled: boolean;
  // Independent of soundEnabled — some players want the tap/slide/chime
  // sounds but not vibration (or vice versa), unlike iOS's own Settings,
  // which groups Sound & Haptics as one switch. See haptics.ts's allowed().
  hapticsEnabled: boolean;
  // Badge hand cards and the top discard-pile card that could currently be
  // laid off onto some meld on the table.
  highlightLayoffs: boolean;
  // Show the "Whose turn is it?" button on the game board, which pops up a
  // brief on-screen reminder of whose turn it currently is.
  showWhoseTurn: boolean;
  // The "💡 Hint: Auto-meld" button (GameContext.tsx's hintMeldContract) —
  // off by default, unlike every other assist toggle here: those highlight
  // information you could work out yourself, this one plays a chunk of your
  // turn for you, which should be something a player opts into rather than
  // discovers already sitting on the board.
  showMeldHint: boolean;
  // Sound-effect volume, 0–1. Independent of soundEnabled (which is the
  // on/off master). Applied in sound.ts.
  soundVolume: number;
  // A generative ambient pad (no audio file — synthesized the same way the
  // SFX are, see ambience.ts) that plays while a game screen is open.
  // Entirely separate from soundEnabled/soundVolume — a player who wants
  // table SFX but no music (or vice versa) can. Off by default: unlike a
  // short tap/chime, looping background audio is the kind of thing that
  // should be opted into, not sprung on someone.
  ambientMusicEnabled: boolean;
  ambientVolume: number;
  // Which song(s) ambience.ts plays. "rotate" (default) cycles through all
  // three, crossfading; any other value pins it to just that one.
  ambientTrack: AmbientTrackChoice;
  // "Player activity", "Group melds by type", and "Expandable hand drawer"
  // used to live here as toggles. All three are gone now: the always-on
  // opponent strip (OpponentStrip.tsx) replaced Player activity, grouping
  // books before runs is just how Table melds renders, and the hand drawer
  // is the only hand layout there is — nothing left for any of them to
  // configure.
}

export const DEFAULT_SETTINGS: HouseSettings = {
  preferredAiDifficulty: "medium",
  soundEnabled: true,
  hapticsEnabled: true,
  highlightLayoffs: true,
  showWhoseTurn: true,
  showMeldHint: false,
  soundVolume: 0.7,
  ambientMusicEnabled: false,
  ambientVolume: 0.4,
  ambientTrack: "rotate",
};

export function loadLocalSettings(): HouseSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<HouseSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveLocalSettings(settings: HouseSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable/full — local persistence is a nicety, not required
  }
}
