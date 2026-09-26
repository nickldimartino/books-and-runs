"use client";

// The Settings page: house rules and preferences. Everything here is kept
// in localStorage (the actual source of truth for rendering) and, when
// signed in, also mirrored to the account via accountSettingsSync.ts — see
// AccountSettingsSync.tsx for the pull side. Links out to the theme,
// card-back, and card-face pickers and to the Account page.

import Link from "next/link";
import { NotificationPrefs } from "../components/NotificationPrefs";
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { BackLink, BottomBackLink } from "../components/BackLink";
import { LoadingSpinner } from "../components/LoadingSpinner";
import {
  onAccountSettingsSynced,
  pushAllDefaults,
  pushColorblindMode,
  pushHouseSettingsPatch,
  pushCardBack,
  pushCardFace,
  pushLocale,
  pushTheme,
  pushTextScale,
  resetLocalPreferencesToDefaults,
} from "../lib/accountSettingsSync";
import {
  applyCardBack,
  CardBackId,
  DEFAULT_CARD_BACK,
  loadLocalCardBack,
  saveLocalCardBack,
} from "../lib/cardBackStore";
import { AMBIENT_SONGS, setAmbienceVolume } from "../lib/ambience";
import {
  CARD_FACES,
  CardFaceId,
  DEFAULT_CARD_FACE,
  loadLocalCardFace,
  saveLocalCardFace,
} from "../lib/cardFaceStore";
import { CardFace } from "../components/CardFace";
import { PageTip } from "../components/PageTip";
import { resetSeenTips } from "../lib/tipsStore";
import {
  getPushPermission,
  isIosSafariNonStandalone,
  isPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from "../lib/pushSubscriptions";
import {
  DEFAULT_SETTINGS,
  GAME_SPEEDS,
  HouseSettings,
  loadLocalSettings,
  REDUCE_MOTION_PREFS,
  saveLocalSettings,
} from "../lib/settingsStore";
import { applyReduceMotion } from "../lib/motion";
import { applyTheme, DEFAULT_THEME, loadLocalTheme, saveLocalTheme, THEMES, ThemeId } from "../lib/themeStore";
import {
  applyColorblindMode,
  ColorblindMode,
  COLORBLIND_MODES,
  DEFAULT_COLORBLIND_MODE,
  loadLocalColorblindMode,
  saveLocalColorblindMode,
} from "../lib/colorblindStore";
import {
  applyTextScale,
  DEFAULT_TEXT_SCALE,
  loadLocalTextScale,
  saveLocalTextScale,
  TEXT_SCALES,
  TextScale,
} from "../lib/textScaleStore";
import { DEFAULT_LOCALE, LocaleId, loadLocalLocale, LOCALES } from "../lib/localeStore";
import { useT } from "../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../lib/i18n/keys";
import { supabase } from "../lib/supabaseClient";
import { capitalize } from "../lib/text";
import { THEME_SWATCHES } from "./themeSwatches";
import { Difficulty } from "@/types";
import { translateError } from "../lib/i18n/serverErrors";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];

// Collapsed by default so a settings screen full of toggles doesn't read as
// a wall of explanatory paragraphs — the description is still one tap away
// for anyone who wants it, same disclosure pattern this app already uses
// elsewhere (native <details>, so it needs no extra state and works
// identically on touch and desktop). The whole label row is the summary (not
// just the icon) so the tap target is bigger than a bare 14px glyph, and the
// icon — the familiar circled-"i" convention rather than a text link — sits
// right after the label text. list-none plus hiding the WebKit-specific
// marker pseudo-element strip the browser's own default disclosure triangle
// in both Firefox and Chrome/Safari so only this icon shows; "What does this
// do?" moves to an sr-only span so screen readers still get something to
// announce beyond the label itself.
function InfoDetails({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useT();
  return (
    <details>
      <summary
        className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-[var(--muted)] [&::-webkit-details-marker]:hidden"
        title={t("settings.whatDoesThisDo")}
      >
        <span>{label}</span>
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="4.7" r="0.9" fill="currentColor" />
          <path d="M8 7.2v4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span className="sr-only">{t("settings.whatDoesThisDo")}</span>
      </summary>
      <p className="mt-1 text-xs text-[var(--faint)]">{children}</p>
    </details>
  );
}

function BoolToggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useT();
  return (
    <section className="flex flex-col gap-2">
      <InfoDetails label={label}>{description}</InfoDetails>
      <div className="flex gap-2">
        {(
          [
            [true, t("common.on")],
            [false, t("common.off")],
          ] as [boolean, string][]
        ).map(([v, l]) => (
          <button
            key={l}
            onClick={() => onChange(v)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
              value === v
                ? "bg-[var(--accent)] text-[var(--on-accent)]"
                : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </section>
  );
}

// Representative preview colors per colorblind mode, so the Settings page
// can show what each mode actually does without needing a real card on
// screen (a wild card especially — Tritanopia's only visible change is on
// those, so without this preview, checking it meant hunting for a 2 or
// Joker in an active game). Hand-maintained against globals.css's
// [data-colorblind] blocks, same reasoning as THEME_SWATCHES — these
// render outside the current [data-colorblind] context (so every option can
// be compared side by side at once), so they can't just read the live CSS
// variables the way an actual card does.
const COLORBLIND_SWATCHES: Record<ColorblindMode, { red: string; wildBg: string; wildText: string }> = {
  off: { red: "#b91c1c", wildBg: "#fef3c7", wildText: "#92400e" },
  protanopia: { red: "#1d4ed8", wildBg: "#fef3c7", wildText: "#92400e" },
  deuteranopia: { red: "#d55e00", wildBg: "#fef3c7", wildText: "#92400e" },
  tritanopia: { red: "#b91c1c", wildBg: "#f3d0ec", wildText: "#7a1f6b" },
};

// COLORBLIND_MODES/TEXT_SCALES (colorblindStore.ts/textScaleStore.ts) carry
// their name/description in English only — only this page ever displays
// them (layout.tsx and accountSettingsSync.ts only validate the id), so
// translating them is just a local id → key lookup here rather than
// threading t() through those stores.
const COLORBLIND_LABEL_KEYS: Record<ColorblindMode, TranslationKey> = {
  off: "settings.colorblind.off",
  protanopia: "settings.colorblind.protanopia",
  deuteranopia: "settings.colorblind.deuteranopia",
  tritanopia: "settings.colorblind.tritanopia",
};
const COLORBLIND_DESCRIPTION_KEYS: Record<ColorblindMode, TranslationKey> = {
  off: "settings.colorblind.offDescription",
  protanopia: "settings.colorblind.protanopiaDescription",
  deuteranopia: "settings.colorblind.deuteranopiaDescription",
  tritanopia: "settings.colorblind.tritanopiaDescription",
};
const TEXT_SCALE_LABEL_KEYS: Record<TextScale, TranslationKey> = {
  default: "settings.textScale.default",
  large: "settings.textScale.large",
  xlarge: "settings.textScale.xlarge",
};
const TEXT_SCALE_DESCRIPTION_KEYS: Record<TextScale, TranslationKey> = {
  default: "settings.textScale.defaultDescription",
  large: "settings.textScale.largeDescription",
  xlarge: "settings.textScale.xlargeDescription",
};

const TABS = ["general", "display", "audio", "gameplay", "accessibility"] as const;
type SettingsTab = (typeof TABS)[number];
const TAB_LABEL_KEYS: Record<SettingsTab, TranslationKey> = {
  general: "settings.tab.general",
  display: "settings.tab.display",
  audio: "settings.tab.audio",
  gameplay: "settings.tab.gameplay",
  accessibility: "settings.tab.accessibility",
};

// The per-tab "Reset this section" control — same inline confirm shape as
// the global reset at the bottom of General.
function SectionReset({
  confirming,
  onAsk,
  onCancel,
  onConfirm,
  label,
  confirmText,
}: {
  label?: string;
  confirmText?: string;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  if (!confirming) {
    return (
      <button
        onClick={onAsk}
        className="self-start rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        {label ?? t("settings.resetSection")}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--danger)]/50 bg-[var(--panel)] p-3">
      <p className="text-sm text-[var(--muted)]">{confirmText ?? t("settings.resetSectionConfirm")}</p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          {t("common.cancel")}
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 rounded-lg border border-[var(--danger)] px-4 py-2 text-sm font-semibold text-[var(--danger)] hover:bg-[var(--panel-soft)]"
        >
          {t("settings.yesReset")}
        </button>
      </div>
    </div>
  );
}

/** A language's name in the *active* UI language (falls back to the English
 * name if Intl.DisplayNames doesn't know it). */
function languageDisplayName(uiLocale: string, id: string, fallback: string): string {
  try {
    return new Intl.DisplayNames([uiLocale], { type: "language" }).of(id) ?? fallback;
  } catch {
    return fallback;
  }
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="border-b border-[var(--border)] pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function VolumeSlider({
  value,
  disabled,
  onChange,
  label,
  description,
  ariaLabel,
}: {
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
  label?: string;
  description?: string;
  ariaLabel?: string;
}) {
  const { t } = useT();
  const resolvedLabel = label ?? t("settings.sound.volume");
  const resolvedDescription = description ?? t("settings.sound.volumeDescription");
  const resolvedAriaLabel = ariaLabel ?? t("settings.sound.volumeAriaLabel");
  return (
    <section className="flex flex-col gap-2">
      <InfoDetails label={resolvedLabel}>{resolvedDescription}</InfoDetails>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(value * 100)}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          aria-label={resolvedAriaLabel}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--panel)] accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
        />
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-[var(--muted)]">
          {Math.round(value * 100)}%
        </span>
      </div>
    </section>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-[var(--faint)]" fill="none" aria-hidden="true">
      <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A compact "current selection, tap to change" row — Theme and Card back
// both used to be a full picker grid inline on this page; together they
// were pushing Settings to roughly 4 phone-screens of scrolling before
// reaching a single toggle, so both now live on their own dedicated pages
// (see SwatchPicker's own doc) and this is all that's left of them here.
// The shared "current selection, tap to change" row shape behind
// SwatchLinkRow/CardFaceLinkRow/AmbientSongLinkRow below — same label +
// link + name/"Tap to change" + chevron shell, differing only in what
// `preview` shows for that particular setting (a swatch circle, a real
// rendered card, or a plain glyph) and whether the row can be disabled.
function SettingsLinkRow({
  label,
  href,
  name,
  disabled,
  preview,
}: {
  label: string;
  href: string;
  name: string;
  disabled?: boolean;
  preview: ReactNode;
}) {
  const { t } = useT();
  return (
    <section className="flex flex-col gap-2">
      <label className="text-sm font-medium text-[var(--muted)]">{label}</label>
      <Link
        href={disabled ? "#" : href}
        aria-disabled={disabled}
        className={`flex items-center gap-3 rounded-lg bg-[var(--panel)] px-3 py-2.5 transition ${
          disabled ? "pointer-events-none opacity-50" : "hover:bg-[var(--panel-soft)]"
        }`}
      >
        {preview}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--heading)]">{name}</span>
          <span className="block text-xs text-[var(--muted)]">{t("settings.tapToChange")}</span>
        </span>
        <ChevronRightIcon />
      </Link>
    </section>
  );
}

function SwatchLinkRow({
  href,
  label,
  name,
  swatch,
}: {
  href: string;
  label: string;
  name: string;
  swatch: { bg: string; panel: string; accent: string };
}) {
  return (
    <SettingsLinkRow
      label={label}
      href={href}
      name={name}
      preview={
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--accent)]"
          style={{ background: swatch.bg }}
          aria-hidden="true"
        >
          <span className="h-5 w-5 rounded-full border" style={{ background: swatch.panel, borderColor: swatch.accent }} />
        </span>
      }
    />
  );
}

// The same row as SwatchLinkRow, but previewing an actual small rendered
// card instead of a flat color circle — what's being chosen here is a
// drawing, not a color, so a real preview of it is more honest than a
// swatch.
function CardFaceLinkRow({ name, cardFace }: { name: string; cardFace: CardFaceId }) {
  const { t } = useT();
  return (
    <SettingsLinkRow
      label={t("settings.cardFace")}
      href="/settings/card-face"
      name={name}
      preview={
        <span
          className="card-face flex h-9 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md"
          aria-hidden="true"
        >
          <CardFace card={{ id: "preview", suit: "hearts", rank: "7", isWild: false }} style={cardFace} />
        </span>
      }
    />
  );
}

// The same row as SwatchLinkRow/CardFaceLinkRow, but with a plain
// music-note glyph instead of a swatch or a card preview — there's no
// color or drawing to show off here.
function AmbientSongLinkRow({ name, disabled }: { name: string; disabled: boolean }) {
  const { t } = useT();
  return (
    <SettingsLinkRow
      label={t("settings.ambientSong")}
      href="/settings/ambient-song"
      name={name}
      disabled={disabled}
      preview={
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--panel-soft)] text-[var(--accent)]"
          aria-hidden="true"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path d="M8 3v9.28a3 3 0 1 0 1.5 2.6V6.5l6-1.2v6.98a3 3 0 1 0 1.5 2.6V2L8 3.6V3Z" />
          </svg>
        </span>
      }
    />
  );
}

export default function SettingsPage() {
  const { configured, user } = useAuth();
  const { t, setLocale: setActiveLocale } = useT();
  const [settings, setSettings] = useState<HouseSettings>(DEFAULT_SETTINGS);
  const [theme, setTheme] = useState<ThemeId>("midnight");
  const [cardBack, setCardBack] = useState<CardBackId>(DEFAULT_CARD_BACK);
  const [cardFace, setCardFace] = useState<CardFaceId>(DEFAULT_CARD_FACE);
  const [colorblindMode, setColorblindMode] = useState<ColorblindMode>(DEFAULT_COLORBLIND_MODE);
  const [textScale, setTextScale] = useState<TextScale>(DEFAULT_TEXT_SCALE);
  const [locale, setLocale] = useState<LocaleId>(DEFAULT_LOCALE);
  const [loading, setLoading] = useState(true);
  const [confirmingReset, setConfirmingReset] = useState<"global" | SettingsTab | null>(null);
  const [tab, setTab] = useState<SettingsTab>("general");
  const [tipsReset, setTipsReset] = useState(false);
  const [pushState, setPushState] = useState<"unsupported" | "off" | "on" | "denied" | "busy">("off");
  const [pushError, setPushError] = useState<string | null>(null);

  // Re-reads every local store — called on mount, and again whenever
  // AccountSettingsSync pulls the account's copy down while this page is
  // already open (a sign-in that resolves right here, most commonly),
  // since that sync writes straight to localStorage without going through
  // this page's own React state.
  function loadAllFromLocal() {
    setSettings(loadLocalSettings());
    setTheme(loadLocalTheme());
    setCardBack(loadLocalCardBack());
    setCardFace(loadLocalCardFace());
    setColorblindMode(loadLocalColorblindMode());
    setTextScale(loadLocalTextScale());
    setLocale(loadLocalLocale());
  }

  useEffect(() => {
    loadAllFromLocal();
    const fromHash = window.location.hash.slice(1);
    if ((TABS as readonly string[]).includes(fromHash)) setTab(fromHash as SettingsTab);
    const permission = getPushPermission();
    if (permission === "unsupported") setPushState("unsupported");
    else if (permission === "denied") setPushState("denied");
    else isPushSubscribed().then((subbed) => setPushState(subbed ? "on" : "off"));
    setLoading(false);
    const onHashChange = () => {
      const h = window.location.hash.slice(1);
      if ((TABS as readonly string[]).includes(h)) setTab(h as SettingsTab);
    };
    window.addEventListener("hashchange", onHashChange);
    const stopSync = onAccountSettingsSynced(loadAllFromLocal);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      stopSync();
    };
  }, []);

  // The active tab lives in the URL hash (replaceState, so tabs don't pile
  // up in history) — the theme/card-back/card-face/ambient-song sub-pages'
  // back links point at "/settings#display" / "#audio", so returning from
  // one lands on the tab it was opened from instead of General.
  function selectTab(next: SettingsTab) {
    setTab(next);
    setConfirmingReset(null);
    try {
      window.history.replaceState(null, "", `#${next}`);
    } catch {
      // history unavailable — the tab still switches
    }
  }

  // Resets only the controls on one tab (the global "Reset to defaults" on
  // General still resets everything), pushing to the account like the
  // individual controls do.
  function resetSection(which: SettingsTab) {
    const uid = user?.id ?? null;
    if (which === "display") {
      setTheme(DEFAULT_THEME);
      saveLocalTheme(DEFAULT_THEME);
      applyTheme(DEFAULT_THEME);
      pushTheme(supabase, uid, DEFAULT_THEME);
      setCardBack(DEFAULT_CARD_BACK);
      saveLocalCardBack(DEFAULT_CARD_BACK);
      applyCardBack(DEFAULT_CARD_BACK, DEFAULT_THEME);
      pushCardBack(supabase, uid, DEFAULT_CARD_BACK);
      setCardFace(DEFAULT_CARD_FACE);
      saveLocalCardFace(DEFAULT_CARD_FACE);
      pushCardFace(supabase, uid, DEFAULT_CARD_FACE);
    } else if (which === "audio") {
      updateSettings({
        soundEnabled: DEFAULT_SETTINGS.soundEnabled,
        soundVolume: DEFAULT_SETTINGS.soundVolume,
        ambientMusicEnabled: DEFAULT_SETTINGS.ambientMusicEnabled,
        ambientVolume: DEFAULT_SETTINGS.ambientVolume,
        ambientTrack: DEFAULT_SETTINGS.ambientTrack,
      });
      setAmbienceVolume(DEFAULT_SETTINGS.ambientVolume);
    } else if (which === "gameplay") {
      updateSettings({
        preferredAiDifficulty: DEFAULT_SETTINGS.preferredAiDifficulty,
        highlightLayoffs: DEFAULT_SETTINGS.highlightLayoffs,
        showWhoseTurn: DEFAULT_SETTINGS.showWhoseTurn,
        showMeldHint: DEFAULT_SETTINGS.showMeldHint,
        gameSpeed: DEFAULT_SETTINGS.gameSpeed,
        showLegalMoves: DEFAULT_SETTINGS.showLegalMoves,
        confirmDiscard: DEFAULT_SETTINGS.confirmDiscard,
      });
    } else if (which === "accessibility") {
      handleColorblindModeChange(DEFAULT_COLORBLIND_MODE);
      handleTextScaleChange(DEFAULT_TEXT_SCALE);
      updateSettings({
        hapticsEnabled: DEFAULT_SETTINGS.hapticsEnabled,
        reduceMotion: DEFAULT_SETTINGS.reduceMotion,
      });
    }
    setConfirmingReset(null);
  }

  function handleColorblindModeChange(mode: ColorblindMode) {
    setColorblindMode(mode);
    saveLocalColorblindMode(mode);
    applyColorblindMode(mode);
    pushColorblindMode(supabase, user?.id ?? null, mode);
  }

  function handleTextScaleChange(scale: TextScale) {
    setTextScale(scale);
    saveLocalTextScale(scale);
    applyTextScale(scale);
    pushTextScale(supabase, user?.id ?? null, scale);
  }

  function handleLocaleChange(id: LocaleId) {
    setLocale(id);
    // Persists + applies the <html lang>/data-lang attribute + loads the
    // new dictionary — see LocaleProvider.tsx's own setLocale.
    setActiveLocale(id);
    pushLocale(supabase, user?.id ?? null, id);
  }

  // Covers everything on this page that's local-only-but-account-synced —
  // theme and colorblind mode live in their own separate stores (see their
  // own handlers above), not HouseSettings, so a plain updateSettings(
  // DEFAULT_SETTINGS) alone wouldn't touch them; this calls all three
  // reset paths together so "Reset to defaults" really means the whole
  // page, not just the toggles, even though Theme/Card back/Card face's
  // own pickers no longer live on this page directly. pushAllDefaults
  // resets the account's copy too (when signed in), so a reset here can't
  // get silently undone by a sync from another device later.
  function handleResetToDefaults() {
    resetLocalPreferencesToDefaults();
    setSettings(DEFAULT_SETTINGS);
    setTheme(DEFAULT_THEME);
    setCardBack(DEFAULT_CARD_BACK);
    setCardFace(DEFAULT_CARD_FACE);
    setColorblindMode(DEFAULT_COLORBLIND_MODE);
    setTextScale(DEFAULT_TEXT_SCALE);
    setLocale(DEFAULT_LOCALE);
    setActiveLocale(DEFAULT_LOCALE);
    setConfirmingReset(null);
    pushAllDefaults(supabase, user?.id ?? null, DEFAULT_THEME);
  }

  // Applies and persists a change to any setting on this page immediately —
  // same instant-apply behavior Theme and Colorblind mode already have —
  // and, when signed in, mirrors it to the account (pushHouseSettingsPatch
  // debounces the two volume sliders itself; everything else pushes right
  // away). There's nothing an explicit "Save" step was ever protecting
  // here; requiring one just meant a toggle flipped and then navigated
  // away from — without noticing a button lower on the page — silently
  // reverted on the next visit.
  function updateSettings(patch: Partial<HouseSettings>) {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveLocalSettings(next);
      return next;
    });
    // Reduce motion is also a <html> attribute (CSS + init.js key off it), so
    // it applies live like text size / colorblind mode do.
    if (patch.reduceMotion !== undefined) applyReduceMotion(patch.reduceMotion);
    pushHouseSettingsPatch(supabase, user?.id ?? null, patch);
  }

  async function handleTogglePush(next: boolean) {
    if (!supabase || !user) return;
    if (!next) {
      setPushState("busy");
      await unsubscribeFromPush(supabase);
      setPushState("off");
      return;
    }
    setPushState("busy");
    setPushError(null);
    const result = await subscribeToPush(supabase, user.id);
    if (result.ok) setPushState("on");
    else if (result.reason === "denied") setPushState("denied");
    else {
      setPushState("off");
      setPushError(translateError(result.reason ?? "Couldn't turn on notifications.", t));
    }
  }

  const activeThemeOption = THEMES.find((t) => t.id === theme);
  const activeCardBackOption = cardBack === "match" ? undefined : THEMES.find((t) => t.id === cardBack);
  const currentSongLabel = AMBIENT_SONGS.find((s) => s.id === settings.ambientTrack)?.label ?? "Arpeggio";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-10">
      <BackLink href="/profile" smart />
      <h1 className="-mt-4 text-2xl font-bold text-[var(--heading)]">{t("home.settings")}</h1>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <PageTip id="settings" title={t("settings.tip.title")}>
            {t("settings.tip.body")}
          </PageTip>

          <div role="tablist" aria-label={t("settings.tabsLabel")} className="sticky top-0 z-10 -mx-6 flex gap-1 overflow-x-auto bg-[var(--bg)] px-6 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((id) => (
              <button
                key={id}
                role="tab"
                id={`settings-tab-${id}`}
                aria-selected={tab === id}
                aria-controls="settings-panel"
                onClick={() => selectTab(id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${
                  tab === id
                    ? "bg-[var(--accent)] text-[var(--on-accent)]"
                    : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                }`}
              >
                {t(TAB_LABEL_KEYS[id])}
              </button>
            ))}
          </div>

          <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`} className="flex flex-col gap-8">
          {tab === "general" && (
            <>
              <SettingsSection title={t("settings.tab.general")}>
          <section className="flex flex-col gap-2">
            <InfoDetails label={t("settings.language.title")}>{t("settings.language.description")}</InfoDetails>
            <div className="grid grid-cols-2 gap-2">
              {LOCALES.map((l) => (
                <button
                  key={l.id}
                  onClick={() => handleLocaleChange(l.id)}
                  aria-label={`${languageDisplayName(locale, l.id, l.name)} (${l.nativeName})`}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                    locale === l.id
                      ? "bg-[var(--accent)] text-[var(--on-accent)]"
                      : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                  }`}
                >
                  <span aria-hidden="true" className="text-lg leading-none">
                    {l.flag}
                  </span>
                  {l.nativeName}
                </button>
              ))}
            </div>
          </section>
              </SettingsSection>

          {configured && user && (
            <SettingsSection title={t("settings.section.notifications")}>
              <section className="flex flex-col gap-2">
                <InfoDetails label={t("settings.turnNotifications")}>
                  {t("settings.turnNotificationsDescription")}
                </InfoDetails>
                <details>
                  <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-[var(--muted)] [&::-webkit-details-marker]:hidden">
                    <span>{t("settings.howToAddToHomeScreen")}</span>
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" aria-hidden="true">
                      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  <div className="mt-2 flex flex-col gap-3 text-xs text-[var(--faint)]">
                    <div>
                      <p className="font-semibold text-[var(--muted)]">{t("settings.androidChrome")}</p>
                      <ol className="mt-0.5 list-decimal space-y-0.5 pl-4">
                        <li>{t("settings.android.step1")}</li>
                        <li>{t("settings.android.step2")}</li>
                        <li>{t("settings.android.step3")}</li>
                      </ol>
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--muted)]">{t("settings.iosSafari")}</p>
                      <ol className="mt-0.5 list-decimal space-y-0.5 pl-4">
                        <li>{t("settings.ios.step1")}</li>
                        <li>{t("settings.ios.step2")}</li>
                        <li>{t("settings.ios.step3")}</li>
                      </ol>
                    </div>
                    <p>{t("settings.homeScreenNote")}</p>
                  </div>
                </details>
                {pushState === "unsupported" ? (
                  <p className="text-xs text-[var(--faint)]">
                    {isIosSafariNonStandalone() ? t("settings.push.iosUnsupported") : t("settings.push.unsupported")}
                  </p>
                ) : pushState === "denied" ? (
                  <p className="text-xs text-[var(--faint)]">{t("settings.push.blocked")}</p>
                ) : (
                  <div className="flex gap-2">
                    {(
                      [
                        [true, t("common.on")],
                        [false, t("common.off")],
                      ] as [boolean, string][]
                    ).map(([v, l]) => (
                      <button
                        key={l}
                        onClick={() => handleTogglePush(v)}
                        disabled={pushState === "busy"}
                        className={`flex-1 rounded-md px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                          (pushState === "on") === v
                            ? "bg-[var(--accent)] text-[var(--on-accent)]"
                            : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                )}
                {pushError && <p className="text-xs text-[var(--danger)]">{pushError}</p>}
                <NotificationPrefs settings={settings} onChange={updateSettings} />
              </section>
            </SettingsSection>
          )}

          <SettingsSection title={t("settings.section.help")}>
            <section className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--heading)]">{t("settings.firstVisitTips")}</p>
                <p className="text-xs text-[var(--faint)]">{t("settings.firstVisitTipsDescription")}</p>
              </div>
              <button
                onClick={() => {
                  resetSeenTips();
                  setTipsReset(true);
                }}
                className="shrink-0 rounded-lg bg-[var(--panel)] px-3 py-2 text-sm font-medium text-[var(--heading)] hover:bg-[var(--panel-soft)]"
              >
                {tipsReset ? t("settings.doneCheck") : t("settings.showAgain")}
              </button>
            </section>

            <section className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--heading)]">{t("settings.foundBug")}</p>
                <p className="text-xs text-[var(--faint)]">{t("settings.foundBugDescription")}</p>
              </div>
              <Link
                href="/support"
                className="shrink-0 rounded-lg bg-[var(--panel)] px-3 py-2 text-sm font-medium text-[var(--heading)] hover:bg-[var(--panel-soft)]"
              >
                {t("settings.contactUs")}
              </Link>
            </section>

            <section className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--heading)]">{t("settings.enjoying")}</p>
                <p className="text-xs text-[var(--faint)]">{t("settings.enjoyingDescription")}</p>
              </div>
              <Link
                href="/tip"
                className="shrink-0 rounded-lg bg-[var(--panel)] px-3 py-2 text-sm font-medium text-[var(--heading)] hover:bg-[var(--panel-soft)]"
              >
                {t("settings.supportDeveloper")}
              </Link>
            </section>
          </SettingsSection>

          <SectionReset
                label={t("settings.resetToDefaults")}
                confirmText={t("settings.resetConfirm")}
                confirming={confirmingReset === "global"}
                onAsk={() => setConfirmingReset("global")}
                onCancel={() => setConfirmingReset(null)}
                onConfirm={handleResetToDefaults}
              />
            </>
          )}

          {tab === "display" && (
            <SettingsSection title={t("settings.tab.display")}>
          {activeThemeOption && (
            <SwatchLinkRow
              href="/settings/theme"
              label={t("settings.theme")}
              name={activeThemeOption.name}
              swatch={THEME_SWATCHES[activeThemeOption.id]}
            />
          )}

          {/* "Match table theme" has no swatch of its own — it resolves to
              whichever theme is currently active, so that's exactly what
              this row shows. */}
          <SwatchLinkRow
            href="/settings/card-back"
            label={t("settings.cardBack")}
            name={activeCardBackOption ? activeCardBackOption.name : t("settings.matchTableTheme")}
            swatch={THEME_SWATCHES[activeCardBackOption ? activeCardBackOption.id : theme]}
          />

          <CardFaceLinkRow
            name={CARD_FACES.find((f) => f.id === cardFace)?.name ?? "Classic"}
            cardFace={cardFace}
          />
          <SectionReset
            confirming={confirmingReset === "display"}
            onAsk={() => setConfirmingReset("display")}
            onCancel={() => setConfirmingReset(null)}
            onConfirm={() => resetSection("display")}
          />
            </SettingsSection>
          )}

          {tab === "audio" && (
            <SettingsSection title={t("settings.tab.audio")}>
          <BoolToggle
            label={t("settings.soundEffects")}
            value={settings.soundEnabled}
            onChange={(v) => updateSettings({ soundEnabled: v })}
            description={t("settings.soundEffectsDescription")}
          />
          <VolumeSlider
            value={settings.soundVolume}
            disabled={!settings.soundEnabled}
            onChange={(v) => updateSettings({ soundVolume: v })}
          />
          <BoolToggle
            label={t("settings.ambientMusic")}
            value={settings.ambientMusicEnabled}
            onChange={(v) => updateSettings({ ambientMusicEnabled: v })}
            description={t("settings.ambientMusicDescription")}
          />
          <VolumeSlider
            value={settings.ambientVolume}
            disabled={!settings.ambientMusicEnabled}
            onChange={(v) => {
              updateSettings({ ambientVolume: v });
              setAmbienceVolume(v);
            }}
            label={t("settings.ambientVolume")}
            description={t("settings.ambientVolumeDescription")}
            ariaLabel={t("settings.ambientVolumeAriaLabel")}
          />
          <AmbientSongLinkRow
            name={settings.ambientTrack === "rotate" ? t("settings.allSongs") : currentSongLabel}
            disabled={!settings.ambientMusicEnabled}
          />
          <SectionReset
            confirming={confirmingReset === "audio"}
            onAsk={() => setConfirmingReset("audio")}
            onCancel={() => setConfirmingReset(null)}
            onConfirm={() => resetSection("audio")}
          />
            </SettingsSection>
          )}

          {tab === "gameplay" && (
            <SettingsSection title={t("settings.tab.gameplay")}>
          <section className="flex flex-col gap-2">
            <InfoDetails label={t("settings.defaultAiDifficulty")}>
              {t("settings.defaultAiDifficultyDescription")}
            </InfoDetails>
            <select
              value={settings.preferredAiDifficulty}
              onChange={(e) => updateSettings({ preferredAiDifficulty: e.target.value as Difficulty })}
              aria-label={t("settings.defaultAiDifficulty")}
              className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {capitalize(t(`common.difficulty.${d}` as TranslationKey))}
                </option>
              ))}
            </select>
          </section>

          <BoolToggle
            label={t("settings.highlightLayoffs")}
            value={settings.highlightLayoffs}
            onChange={(v) => updateSettings({ highlightLayoffs: v })}
            description={t("settings.highlightLayoffsDescription")}
          />

          <BoolToggle
            label={t("settings.showWhoseTurn")}
            value={settings.showWhoseTurn}
            onChange={(v) => updateSettings({ showWhoseTurn: v })}
            description={t("settings.showWhoseTurnDescription")}
          />

          <BoolToggle
            label={t("settings.showMeldHint")}
            value={settings.showMeldHint}
            onChange={(v) => updateSettings({ showMeldHint: v })}
            description={t("settings.showMeldHintDescription")}
          />

          <BoolToggle
            label={t("settings.showLegalMoves")}
            value={settings.showLegalMoves}
            onChange={(v) => updateSettings({ showLegalMoves: v })}
            description={t("settings.showLegalMovesDescription")}
          />

          <BoolToggle
            label={t("settings.confirmDiscard")}
            value={settings.confirmDiscard}
            onChange={(v) => updateSettings({ confirmDiscard: v })}
            description={t("settings.confirmDiscardDescription")}
          />

          <section className="flex flex-col gap-2">
            <InfoDetails label={t("settings.gameSpeed")}>{t("settings.gameSpeedDescription")}</InfoDetails>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t("settings.gameSpeed")}>
              {GAME_SPEEDS.map((sp) => (
                <button
                  key={sp}
                  onClick={() => updateSettings({ gameSpeed: sp })}
                  aria-pressed={settings.gameSpeed === sp}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${
                    settings.gameSpeed === sp
                      ? "bg-[var(--accent)] text-[var(--on-accent)]"
                      : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                  }`}
                >
                  {t(`settings.gameSpeed.${sp}` as TranslationKey)}
                </button>
              ))}
            </div>
          </section>
          <SectionReset
            confirming={confirmingReset === "gameplay"}
            onAsk={() => setConfirmingReset("gameplay")}
            onCancel={() => setConfirmingReset(null)}
            onConfirm={() => resetSection("gameplay")}
          />
            </SettingsSection>
          )}

          {tab === "accessibility" && (
            <SettingsSection title={t("settings.tab.accessibility")}>
          <section className="flex flex-col gap-2">
            <InfoDetails label={t("settings.colorblind.title")}>{t("settings.colorblind.description")}</InfoDetails>
            <div className="grid grid-cols-2 gap-2">
              {COLORBLIND_MODES.map((m) => {
                const swatch = COLORBLIND_SWATCHES[m.id];
                return (
                  <button
                    key={m.id}
                    onClick={() => handleColorblindModeChange(m.id)}
                    title={t(COLORBLIND_DESCRIPTION_KEYS[m.id])}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                      colorblindMode === m.id
                        ? "bg-[var(--accent)] text-[var(--on-accent)]"
                        : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                    }`}
                  >
                    <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                        style={{ background: swatch.red }}
                        title={t("settings.colorblind.redSwatch")}
                      />
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                        style={{ background: swatch.wildBg }}
                        title={t("settings.colorblind.wildSwatch")}
                      />
                    </span>
                    {t(COLORBLIND_LABEL_KEYS[m.id])}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <InfoDetails label={t("settings.textScale.title")}>{t("settings.textScale.description")}</InfoDetails>
            <div className="flex gap-2">
              {TEXT_SCALES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleTextScaleChange(s.id)}
                  title={t(TEXT_SCALE_DESCRIPTION_KEYS[s.id])}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                    textScale === s.id
                      ? "bg-[var(--accent)] text-[var(--on-accent)]"
                      : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                  }`}
                >
                  {t(TEXT_SCALE_LABEL_KEYS[s.id])}
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <InfoDetails label={t("settings.reduceMotion")}>{t("settings.reduceMotionDescription")}</InfoDetails>
            <div className="flex gap-2" role="group" aria-label={t("settings.reduceMotion")}>
              {REDUCE_MOTION_PREFS.map((m) => (
                <button
                  key={m}
                  onClick={() => updateSettings({ reduceMotion: m })}
                  aria-pressed={settings.reduceMotion === m}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                    settings.reduceMotion === m
                      ? "bg-[var(--accent)] text-[var(--on-accent)]"
                      : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                  }`}
                >
                  {t(`settings.reduceMotion.${m}` as TranslationKey)}
                </button>
              ))}
            </div>
          </section>

          <BoolToggle
            label={t("settings.haptics")}
            value={settings.hapticsEnabled}
            onChange={(v) => updateSettings({ hapticsEnabled: v })}
            description={t("settings.hapticsDescription")}
          />
          <SectionReset
            confirming={confirmingReset === "accessibility"}
            onAsk={() => setConfirmingReset("accessibility")}
            onCancel={() => setConfirmingReset(null)}
            onConfirm={() => resetSection("accessibility")}
          />
            </SettingsSection>
          )}
          </div>
        </>
      )}

      <BottomBackLink fallback="/profile" className="text-center text-sm text-[var(--muted)] hover:text-[var(--text)]" />
    </main>
  );
}
