// Syncs every Settings/Theme/Card back/Card face preference to the signed-in
// account (migration 0022's extended `settings` table) — the local-only
// stores (settingsStore.ts, themeStore.ts, cardBackStore.ts,
// cardFaceStore.ts, colorblindStore.ts) stay the actual source of truth for
// rendering (nothing here replaces them), this just keeps a second copy in
// Supabase and pulls it back down on sign-in, including a fresh "Add to
// Home Screen" install — which gets its own separate local storage on iOS,
// so without this every such install started from scratch.
//
// Pull: AccountSettingsSync.tsx, mounted once, on sign-in.
// Push: one small helper per store, called from each picker's own onSelect/
// onChange — see settings/page.tsx, settings/theme/page.tsx,
// settings/card-back/page.tsx, settings/card-face/page.tsx.

import type { SupabaseClient } from "@supabase/supabase-js";
import { Difficulty } from "@/types";
import {
  applyCardBack,
  CardBackId,
  DEFAULT_CARD_BACK,
  loadLocalCardBack,
  saveLocalCardBack,
} from "./cardBackStore";
import { CardFaceId, DEFAULT_CARD_FACE, loadLocalCardFace, saveLocalCardFace } from "./cardFaceStore";
import {
  applyColorblindMode,
  ColorblindMode,
  DEFAULT_COLORBLIND_MODE,
  loadLocalColorblindMode,
  saveLocalColorblindMode,
} from "./colorblindStore";
import { updateShowcaseCardBack, updateShowcaseCardFace } from "./leaderboardStore";
import { AmbientTrackChoice, DEFAULT_SETTINGS, HouseSettings, loadLocalSettings, saveLocalSettings } from "./settingsStore";
import { applyTheme, DEFAULT_THEME, loadLocalTheme, saveLocalTheme, ThemeId } from "./themeStore";

export interface AccountSettingsRow {
  theme: string | null;
  card_back: string | null;
  card_face: string | null;
  colorblind_mode: string | null;
  preferred_ai_difficulty_default: string | null;
  sound_on: boolean;
  sound_volume: number | null;
  highlight_layoffs: boolean | null;
  show_whose_turn: boolean | null;
  ambient_music_enabled: boolean | null;
  ambient_volume: number | null;
  ambient_track: string | null;
}

/** Stand-in for "this account has no `settings` row at all yet" (a brand
 * new account, or one that's never had any preference synced) — every
 * field reads as unset, same as a real row where nothing's ever been
 * pushed. Lets bootstrapMissingAccountSettings treat "no row" and "a row
 * full of nulls" identically. */
export const EMPTY_ACCOUNT_SETTINGS_ROW: AccountSettingsRow = {
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

const SELECT_COLUMNS =
  "theme, card_back, card_face, colorblind_mode, preferred_ai_difficulty_default, sound_on, sound_volume, highlight_layoffs, show_whose_turn, ambient_music_enabled, ambient_volume, ambient_track";

const SYNCED_EVENT = "br:settings-synced";

export async function fetchAccountSettings(supabase: SupabaseClient, userId: string): Promise<AccountSettingsRow | null> {
  const { data, error } = await supabase
    .from("settings")
    .select(SELECT_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle<AccountSettingsRow>();
  if (error) throw error;
  return data;
}

/**
 * Applies whatever the account has saved onto this device's local stores —
 * only fields the account has actually set (non-null); a preference the
 * account has never touched leaves this device's own value alone rather
 * than overwriting it with a guessed default. Fires SYNCED_EVENT afterward
 * so an already-mounted Settings/Theme/Card back/Card face page picks the
 * change up live instead of only on next visit.
 */
export function applyAccountSettings(row: AccountSettingsRow): void {
  const localTheme = loadLocalTheme();
  if (row.theme) {
    saveLocalTheme(row.theme as ThemeId);
    applyTheme(row.theme as ThemeId);
  }
  if (row.card_back) {
    const cardBack = row.card_back as CardBackId;
    saveLocalCardBack(cardBack);
    applyCardBack(cardBack, (row.theme as ThemeId | null) ?? localTheme);
  } else if (row.theme) {
    // Card back may be "match table theme" — re-apply it against the newly
    // synced theme even when the account never set a card back of its own.
    applyCardBack(loadLocalCardBack(), row.theme as ThemeId);
  }
  if (row.card_face) {
    saveLocalCardFace(row.card_face as CardFaceId);
  }
  if (row.colorblind_mode) {
    const mode = row.colorblind_mode as ColorblindMode;
    saveLocalColorblindMode(mode);
    applyColorblindMode(mode);
  }

  const current = loadLocalSettings();
  saveLocalSettings({
    preferredAiDifficulty: (row.preferred_ai_difficulty_default as Difficulty | null) ?? current.preferredAiDifficulty,
    soundEnabled: row.sound_on,
    highlightLayoffs: row.highlight_layoffs ?? current.highlightLayoffs,
    showWhoseTurn: row.show_whose_turn ?? current.showWhoseTurn,
    soundVolume: row.sound_volume ?? current.soundVolume,
    ambientMusicEnabled: row.ambient_music_enabled ?? current.ambientMusicEnabled,
    ambientVolume: row.ambient_volume ?? current.ambientVolume,
    ambientTrack: (row.ambient_track as AmbientTrackChoice | null) ?? current.ambientTrack,
  });

  if (typeof window !== "undefined") window.dispatchEvent(new Event(SYNCED_EVENT));
}

/** Subscribes to "the account's settings just got pulled down and applied
 * locally" — lets a page already mounted when sign-in resolves re-read its
 * local state instead of only picking the change up on next visit. */
export function onAccountSettingsSynced(cb: () => void): () => void {
  window.addEventListener(SYNCED_EVENT, cb);
  return () => window.removeEventListener(SYNCED_EVENT, cb);
}

/**
 * Resets every local Settings/Theme/Card back/Card face store to its
 * default — the *local-only* half of "Reset to defaults" on the Settings
 * page, factored out so AccountSwitchGuard.tsx can also call it when a
 * genuinely different account signs in on this device, before that
 * account's own AccountSettingsSync pull has a chance to run. Deliberately
 * never pushes anything to the cloud (unlike the Settings page's own
 * button, via pushAllDefaults) — the point here is only to stop the
 * *previous* account's local values from leaking into the new account's
 * session; what the new account's own pull then applies on top of these
 * defaults is real data it already has, not something this function
 * should overwrite in Supabase.
 */
export function resetLocalPreferencesToDefaults(): void {
  saveLocalSettings(DEFAULT_SETTINGS);
  saveLocalTheme(DEFAULT_THEME);
  applyTheme(DEFAULT_THEME);
  saveLocalCardBack(DEFAULT_CARD_BACK);
  applyCardBack(DEFAULT_CARD_BACK, DEFAULT_THEME);
  saveLocalCardFace(DEFAULT_CARD_FACE);
  saveLocalColorblindMode(DEFAULT_COLORBLIND_MODE);
  applyColorblindMode(DEFAULT_COLORBLIND_MODE);
}

/**
 * For any field the account has never set (null in the just-fetched row),
 * pushes this device's own current local value up as a baseline. Without
 * this, a value that was only ever set locally — typically: chosen before
 * this sync feature existed, or on a device that's never triggered a push
 * of its own — stays null in the cloud forever, so a second, later device
 * signing into the same account never has anything to pull and the two
 * permanently disagree despite the sync feature being in place (the actual
 * cause of a since-reported "my theme doesn't match between my phone's
 * browser and its home-screen install" bug — both are the same account,
 * but whichever one was set up first never pushed anything, since a push
 * only ever fires on a *new* change, not retroactively for whatever was
 * already selected). Whichever device happens to call this first "wins"
 * and becomes every other device's value going forward — the same
 * self-reported-snapshot model every other sync in this app already uses
 * (see e.g. favoriteGameConfig.ts's own doc), just applied retroactively
 * here instead of only for new changes.
 */
export function bootstrapMissingAccountSettings(
  supabase: SupabaseClient,
  userId: string,
  row: AccountSettingsRow
): void {
  const local = loadLocalSettings();
  const patch: SettingsPatch = {};
  if (row.theme === null) patch.theme = loadLocalTheme();
  if (row.card_back === null) patch.card_back = loadLocalCardBack();
  if (row.card_face === null) patch.card_face = loadLocalCardFace();
  if (row.colorblind_mode === null) patch.colorblind_mode = loadLocalColorblindMode();
  if (row.preferred_ai_difficulty_default === null) patch.preferred_ai_difficulty_default = local.preferredAiDifficulty;
  if (row.sound_volume === null) patch.sound_volume = local.soundVolume;
  if (row.highlight_layoffs === null) patch.highlight_layoffs = local.highlightLayoffs;
  if (row.show_whose_turn === null) patch.show_whose_turn = local.showWhoseTurn;
  if (row.ambient_music_enabled === null) patch.ambient_music_enabled = local.ambientMusicEnabled;
  if (row.ambient_volume === null) patch.ambient_volume = local.ambientVolume;
  if (row.ambient_track === null) patch.ambient_track = local.ambientTrack;
  if (Object.keys(patch).length === 0) return;
  upsertSettingsPatch(supabase, userId, patch).catch((err) =>
    console.error("Failed to bootstrap account settings from this device:", err.message)
  );
}

type SettingsPatch = Partial<{
  theme: string;
  card_back: string;
  card_face: string;
  colorblind_mode: string;
  preferred_ai_difficulty_default: string;
  sound_on: boolean;
  sound_volume: number;
  highlight_layoffs: boolean;
  show_whose_turn: boolean;
  ambient_music_enabled: boolean;
  ambient_volume: number;
  ambient_track: string;
}>;

async function upsertSettingsPatch(supabase: SupabaseClient, userId: string, patch: SettingsPatch): Promise<void> {
  const { error } = await supabase.from("settings").upsert({
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// Volume sliders fire on every drag tick — pushing each one to the account
// immediately would mean dozens of writes per drag. Debounced per field key
// so only the value you actually settle on gets sent, ~600ms after you stop
// moving it.
const debounceTimers: Partial<Record<string, ReturnType<typeof setTimeout>>> = {};
function debounced(key: string, fn: () => void, delayMs = 600): void {
  clearTimeout(debounceTimers[key]);
  debounceTimers[key] = setTimeout(fn, delayMs);
}

/** Called from settings/page.tsx's updateSettings — pushes exactly the
 * fields that changed, debouncing the two volume sliders and firing
 * everything else immediately. Errors are logged, not thrown: a failed
 * push just means this one device's change didn't reach the account this
 * time, never something worth interrupting the (already-applied-locally)
 * change over. */
export function pushHouseSettingsPatch(supabase: SupabaseClient | null, userId: string | null, patch: Partial<HouseSettings>): void {
  if (!supabase || !userId) return;
  const immediate: SettingsPatch = {};
  if (patch.preferredAiDifficulty !== undefined) immediate.preferred_ai_difficulty_default = patch.preferredAiDifficulty;
  if (patch.soundEnabled !== undefined) immediate.sound_on = patch.soundEnabled;
  if (patch.highlightLayoffs !== undefined) immediate.highlight_layoffs = patch.highlightLayoffs;
  if (patch.showWhoseTurn !== undefined) immediate.show_whose_turn = patch.showWhoseTurn;
  if (patch.ambientMusicEnabled !== undefined) immediate.ambient_music_enabled = patch.ambientMusicEnabled;
  if (patch.ambientTrack !== undefined) immediate.ambient_track = patch.ambientTrack;
  if (Object.keys(immediate).length > 0) {
    upsertSettingsPatch(supabase, userId, immediate).catch((err) =>
      console.error("Failed to sync settings to account:", err.message)
    );
  }
  if (patch.soundVolume !== undefined) {
    const value = patch.soundVolume;
    debounced(`${userId}:sound_volume`, () => {
      upsertSettingsPatch(supabase, userId, { sound_volume: value }).catch((err) =>
        console.error("Failed to sync sound volume to account:", err.message)
      );
    });
  }
  if (patch.ambientVolume !== undefined) {
    const value = patch.ambientVolume;
    debounced(`${userId}:ambient_volume`, () => {
      upsertSettingsPatch(supabase, userId, { ambient_volume: value }).catch((err) =>
        console.error("Failed to sync ambient volume to account:", err.message)
      );
    });
  }
}

export function pushColorblindMode(supabase: SupabaseClient | null, userId: string | null, mode: ColorblindMode): void {
  if (!supabase || !userId) return;
  upsertSettingsPatch(supabase, userId, { colorblind_mode: mode }).catch((err) =>
    console.error("Failed to sync colorblind mode to account:", err.message)
  );
}

export function pushTheme(supabase: SupabaseClient | null, userId: string | null, theme: ThemeId): void {
  if (!supabase || !userId) return;
  upsertSettingsPatch(supabase, userId, { theme }).catch((err) =>
    console.error("Failed to sync theme to account:", err.message)
  );
}

export function pushCardBack(supabase: SupabaseClient | null, userId: string | null, cardBack: CardBackId): void {
  if (!supabase || !userId) return;
  upsertSettingsPatch(supabase, userId, { card_back: cardBack }).catch((err) =>
    console.error("Failed to sync card back to account:", err.message)
  );
  // Public mirror, for showing off on the profile page (migration 0028) —
  // see updateShowcaseCardBack's own doc for why this is a separate write
  // from the private settings upsert above, not a read policy on it.
  updateShowcaseCardBack(supabase, userId, cardBack).catch((err) =>
    console.error("Failed to sync showcased card back:", err.message)
  );
}

export function pushCardFace(supabase: SupabaseClient | null, userId: string | null, cardFace: CardFaceId): void {
  if (!supabase || !userId) return;
  upsertSettingsPatch(supabase, userId, { card_face: cardFace }).catch((err) =>
    console.error("Failed to sync card face to account:", err.message)
  );
  updateShowcaseCardFace(supabase, userId, cardFace).catch((err) =>
    console.error("Failed to sync showcased card face:", err.message)
  );
}

/** Pushes every default value at once — "Reset to defaults" on Settings
 * resets the account's copy too, so it can't silently re-sync the old
 * values back down on another device later. */
export function pushAllDefaults(supabase: SupabaseClient | null, userId: string | null, defaultTheme: ThemeId): void {
  if (!supabase || !userId) return;
  upsertSettingsPatch(supabase, userId, {
    theme: defaultTheme,
    card_back: DEFAULT_CARD_BACK,
    card_face: DEFAULT_CARD_FACE,
    colorblind_mode: DEFAULT_COLORBLIND_MODE,
    preferred_ai_difficulty_default: DEFAULT_SETTINGS.preferredAiDifficulty,
    sound_on: DEFAULT_SETTINGS.soundEnabled,
    sound_volume: DEFAULT_SETTINGS.soundVolume,
    highlight_layoffs: DEFAULT_SETTINGS.highlightLayoffs,
    show_whose_turn: DEFAULT_SETTINGS.showWhoseTurn,
    ambient_music_enabled: DEFAULT_SETTINGS.ambientMusicEnabled,
    ambient_volume: DEFAULT_SETTINGS.ambientVolume,
    ambient_track: DEFAULT_SETTINGS.ambientTrack,
  }).catch((err) => console.error("Failed to sync reset settings to account:", err.message));
}
