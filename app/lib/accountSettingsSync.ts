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
  isSignatureCardBack,
  loadLocalCardBack,
  saveLocalCardBack,
} from "./cardBackStore";
import { CARD_FACES, CardFaceId, DEFAULT_CARD_FACE, loadLocalCardFace, saveLocalCardFace } from "./cardFaceStore";
import {
  applyColorblindMode,
  COLORBLIND_MODES,
  ColorblindMode,
  DEFAULT_COLORBLIND_MODE,
  loadLocalColorblindMode,
  saveLocalColorblindMode,
} from "./colorblindStore";
import { applyLocale, DEFAULT_LOCALE, LocaleId, loadLocalLocale, LOCALES, saveLocalLocale } from "./localeStore";
import { AmbientTrackChoice, DEFAULT_SETTINGS, HouseSettings, loadLocalSettings, saveLocalSettings } from "./settingsStore";
import { applyTextScale, DEFAULT_TEXT_SCALE, loadLocalTextScale, saveLocalTextScale, TEXT_SCALES, TextScale } from "./textScaleStore";
import { applyTheme, DEFAULT_THEME, loadLocalTheme, saveLocalTheme, THEMES, ThemeId } from "./themeStore";

export interface AccountSettingsRow {
  theme: string | null;
  card_back: string | null;
  card_face: string | null;
  colorblind_mode: string | null;
  text_scale: string | null;
  preferred_ai_difficulty_default: string | null;
  sound_on: boolean;
  haptics_on: boolean | null;
  sound_volume: number | null;
  highlight_layoffs: boolean | null;
  show_whose_turn: boolean | null;
  show_meld_hint: boolean | null;
  ambient_music_enabled: boolean | null;
  ambient_volume: number | null;
  ambient_track: string | null;
  language: string | null;
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
  text_scale: null,
  preferred_ai_difficulty_default: null,
  sound_on: true,
  haptics_on: null,
  sound_volume: null,
  highlight_layoffs: null,
  show_whose_turn: null,
  show_meld_hint: null,
  ambient_music_enabled: null,
  ambient_volume: null,
  ambient_track: null,
  language: null,
};

const SELECT_COLUMNS =
  "theme, card_back, card_face, colorblind_mode, text_scale, preferred_ai_difficulty_default, sound_on, haptics_on, sound_volume, highlight_layoffs, show_whose_turn, show_meld_hint, ambient_music_enabled, ambient_volume, ambient_track, language";

const SYNCED_EVENT = "br:settings-synced";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];

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
  // Every field below is a plain, server-writable string with no enum check
  // visible from the client — the same "untrusted external value" shape
  // every *local* loader in this app (loadLocalTheme, loadLocalCardBack,
  // etc.) already validates against its own known option list before
  // trusting it. A stale row (e.g. a theme id retired in a later release,
  // or a hand-edited settings row) must fail the same way a bad value in
  // localStorage already does — falling back to this device's current
  // value — rather than getting applied to <html> and written into
  // localStorage unvalidated for the rest of the session.
  const validTheme = row.theme && THEMES.some((t) => t.id === row.theme) ? (row.theme as ThemeId) : null;
  const localTheme = loadLocalTheme();
  if (validTheme) {
    saveLocalTheme(validTheme);
    applyTheme(validTheme);
  }
  const validCardBack =
    row.card_back &&
    (row.card_back === "match" ||
      THEMES.some((t) => t.id === row.card_back) ||
      isSignatureCardBack(row.card_back as CardBackId))
      ? (row.card_back as CardBackId)
      : null;
  if (validCardBack) {
    saveLocalCardBack(validCardBack);
    applyCardBack(validCardBack, validTheme ?? localTheme);
  } else if (validTheme) {
    // Card back may be "match table theme" — re-apply it against the newly
    // synced theme even when the account never set a card back of its own.
    applyCardBack(loadLocalCardBack(), validTheme);
  }
  if (row.card_face && CARD_FACES.some((f) => f.id === row.card_face)) {
    saveLocalCardFace(row.card_face as CardFaceId);
  }
  if (row.colorblind_mode && COLORBLIND_MODES.some((m) => m.id === row.colorblind_mode)) {
    const mode = row.colorblind_mode as ColorblindMode;
    saveLocalColorblindMode(mode);
    applyColorblindMode(mode);
  }
  if (row.text_scale && TEXT_SCALES.some((s) => s.id === row.text_scale)) {
    const scale = row.text_scale as TextScale;
    saveLocalTextScale(scale);
    applyTextScale(scale);
  }
  if (row.language && LOCALES.some((l) => l.id === row.language)) {
    const locale = row.language as LocaleId;
    saveLocalLocale(locale);
    applyLocale(locale);
  }

  const current = loadLocalSettings();
  saveLocalSettings({
    preferredAiDifficulty:
      row.preferred_ai_difficulty_default && DIFFICULTIES.includes(row.preferred_ai_difficulty_default as Difficulty)
        ? (row.preferred_ai_difficulty_default as Difficulty)
        : current.preferredAiDifficulty,
    soundEnabled: row.sound_on,
    hapticsEnabled: row.haptics_on ?? current.hapticsEnabled,
    highlightLayoffs: row.highlight_layoffs ?? current.highlightLayoffs,
    showWhoseTurn: row.show_whose_turn ?? current.showWhoseTurn,
    showMeldHint: row.show_meld_hint ?? current.showMeldHint,
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
  saveLocalTextScale(DEFAULT_TEXT_SCALE);
  applyTextScale(DEFAULT_TEXT_SCALE);
  saveLocalLocale(DEFAULT_LOCALE);
  applyLocale(DEFAULT_LOCALE);
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
  if (row.text_scale === null) patch.text_scale = loadLocalTextScale();
  if (row.language === null) patch.language = loadLocalLocale();
  if (row.preferred_ai_difficulty_default === null) patch.preferred_ai_difficulty_default = local.preferredAiDifficulty;
  if (row.sound_volume === null) patch.sound_volume = local.soundVolume;
  if (row.highlight_layoffs === null) patch.highlight_layoffs = local.highlightLayoffs;
  if (row.show_whose_turn === null) patch.show_whose_turn = local.showWhoseTurn;
  if (row.show_meld_hint === null) patch.show_meld_hint = local.showMeldHint;
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
  text_scale: string;
  language: string;
  preferred_ai_difficulty_default: string;
  sound_on: boolean;
  haptics_on: boolean;
  sound_volume: number;
  highlight_layoffs: boolean;
  show_whose_turn: boolean;
  show_meld_hint: boolean;
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
  if (patch.hapticsEnabled !== undefined) immediate.haptics_on = patch.hapticsEnabled;
  if (patch.highlightLayoffs !== undefined) immediate.highlight_layoffs = patch.highlightLayoffs;
  if (patch.showWhoseTurn !== undefined) immediate.show_whose_turn = patch.showWhoseTurn;
  if (patch.showMeldHint !== undefined) immediate.show_meld_hint = patch.showMeldHint;
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

export function pushTextScale(supabase: SupabaseClient | null, userId: string | null, scale: TextScale): void {
  if (!supabase || !userId) return;
  upsertSettingsPatch(supabase, userId, { text_scale: scale }).catch((err) =>
    console.error("Failed to sync text size to account:", err.message)
  );
}

export function pushLocale(supabase: SupabaseClient | null, userId: string | null, locale: LocaleId): void {
  if (!supabase || !userId) return;
  upsertSettingsPatch(supabase, userId, { language: locale }).catch((err) =>
    console.error("Failed to sync language to account:", err.message)
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
}

export function pushCardFace(supabase: SupabaseClient | null, userId: string | null, cardFace: CardFaceId): void {
  if (!supabase || !userId) return;
  upsertSettingsPatch(supabase, userId, { card_face: cardFace }).catch((err) =>
    console.error("Failed to sync card face to account:", err.message)
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
    text_scale: DEFAULT_TEXT_SCALE,
    language: DEFAULT_LOCALE,
    preferred_ai_difficulty_default: DEFAULT_SETTINGS.preferredAiDifficulty,
    sound_on: DEFAULT_SETTINGS.soundEnabled,
    haptics_on: DEFAULT_SETTINGS.hapticsEnabled,
    sound_volume: DEFAULT_SETTINGS.soundVolume,
    highlight_layoffs: DEFAULT_SETTINGS.highlightLayoffs,
    show_whose_turn: DEFAULT_SETTINGS.showWhoseTurn,
    show_meld_hint: DEFAULT_SETTINGS.showMeldHint,
    ambient_music_enabled: DEFAULT_SETTINGS.ambientMusicEnabled,
    ambient_volume: DEFAULT_SETTINGS.ambientVolume,
    ambient_track: DEFAULT_SETTINGS.ambientTrack,
  }).catch((err) => console.error("Failed to sync reset settings to account:", err.message));
}
