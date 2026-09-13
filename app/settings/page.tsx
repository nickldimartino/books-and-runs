"use client";

// The Settings page: house rules and preferences. Everything here is kept
// in localStorage (the actual source of truth for rendering) and, when
// signed in, also mirrored to the account via accountSettingsSync.ts — see
// AccountSettingsSync.tsx for the pull side. Links out to the theme,
// card-back, and card-face pickers and to the Account page.

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { LoadingSpinner } from "../components/LoadingSpinner";
import {
  onAccountSettingsSynced,
  pushAllDefaults,
  pushColorblindMode,
  pushHouseSettingsPatch,
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
import { DEFAULT_SETTINGS, HouseSettings, loadLocalSettings, saveLocalSettings } from "../lib/settingsStore";
import { applyTheme, DEFAULT_THEME, loadLocalTheme, saveLocalTheme, THEMES, ThemeId } from "../lib/themeStore";
import {
  applyColorblindMode,
  ColorblindMode,
  COLORBLIND_MODES,
  DEFAULT_COLORBLIND_MODE,
  loadLocalColorblindMode,
  saveLocalColorblindMode,
} from "../lib/colorblindStore";
import { supabase } from "../lib/supabaseClient";
import { THEME_SWATCHES } from "./themeSwatches";
import { Difficulty } from "@/types";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];

// Rendering the actual capitalized label, rather than lowercase text plus a
// CSS text-transform, avoids a real cross-platform bug: iOS Safari's native
// picker wheel (the opened <select> list) doesn't apply text-transform to
// <option> text, so it showed "easy" while the closed box — rendered by the
// page itself, which does honor the CSS — showed "Easy".
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
  return (
    <details>
      <summary
        className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-[var(--muted)] [&::-webkit-details-marker]:hidden"
        title="What does this do?"
      >
        <span>{label}</span>
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="4.7" r="0.9" fill="currentColor" />
          <path d="M8 7.2v4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span className="sr-only">What does this do?</span>
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
  return (
    <section className="flex flex-col gap-2">
      <InfoDetails label={label}>{description}</InfoDetails>
      <div className="flex gap-2">
        {(
          [
            [true, "On"],
            [false, "Off"],
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
  label = "Volume",
  description = "How loud the sound effects are. The Sound effects toggle above is the master on/off.",
  ariaLabel = "Sound effects volume",
}: {
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
  label?: string;
  description?: string;
  ariaLabel?: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <InfoDetails label={label}>{description}</InfoDetails>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(value * 100)}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          aria-label={ariaLabel}
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
    <section className="flex flex-col gap-2">
      <label className="text-sm font-medium text-[var(--muted)]">{label}</label>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-lg bg-[var(--panel)] px-3 py-2.5 transition hover:bg-[var(--panel-soft)]"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--accent)]"
          style={{ background: swatch.bg }}
          aria-hidden="true"
        >
          <span className="h-5 w-5 rounded-full border" style={{ background: swatch.panel, borderColor: swatch.accent }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--heading)]">{name}</span>
          <span className="block text-xs text-[var(--muted)]">Tap to change</span>
        </span>
        <ChevronRightIcon />
      </Link>
    </section>
  );
}

// The same "current selection, tap to change" row as SwatchLinkRow, but
// previewing an actual small rendered card instead of a flat color circle —
// what's being chosen here is a drawing, not a color, so a real preview of
// it is more honest than a swatch.
function CardFaceLinkRow({ name, cardFace }: { name: string; cardFace: CardFaceId }) {
  return (
    <section className="flex flex-col gap-2">
      <label className="text-sm font-medium text-[var(--muted)]">Card face</label>
      <Link
        href="/settings/card-face"
        className="flex items-center gap-3 rounded-lg bg-[var(--panel)] px-3 py-2.5 transition hover:bg-[var(--panel-soft)]"
      >
        <span
          className="card-face flex h-9 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md"
          aria-hidden="true"
        >
          <CardFace card={{ id: "preview", suit: "hearts", rank: "7", isWild: false }} style={cardFace} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--heading)]">{name}</span>
          <span className="block text-xs text-[var(--muted)]">Tap to change</span>
        </span>
        <ChevronRightIcon />
      </Link>
    </section>
  );
}

// The same "current selection, tap to change" row as SwatchLinkRow/
// CardFaceLinkRow, but with a plain music-note glyph instead of a swatch
// or a card preview — there's no color or drawing to show off here.
function AmbientSongLinkRow({ name, disabled }: { name: string; disabled: boolean }) {
  return (
    <section className="flex flex-col gap-2">
      <label className="text-sm font-medium text-[var(--muted)]">Ambient song</label>
      <Link
        href={disabled ? "#" : "/settings/ambient-song"}
        aria-disabled={disabled}
        className={`flex items-center gap-3 rounded-lg bg-[var(--panel)] px-3 py-2.5 transition ${
          disabled ? "pointer-events-none opacity-50" : "hover:bg-[var(--panel-soft)]"
        }`}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--panel-soft)] text-[var(--accent)]"
          aria-hidden="true"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path d="M8 3v9.28a3 3 0 1 0 1.5 2.6V6.5l6-1.2v6.98a3 3 0 1 0 1.5 2.6V2L8 3.6V3Z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--heading)]">{name}</span>
          <span className="block text-xs text-[var(--muted)]">Tap to change</span>
        </span>
        <ChevronRightIcon />
      </Link>
    </section>
  );
}

export default function SettingsPage() {
  const { configured, user } = useAuth();
  const [settings, setSettings] = useState<HouseSettings>(DEFAULT_SETTINGS);
  const [theme, setTheme] = useState<ThemeId>("midnight");
  const [cardBack, setCardBack] = useState<CardBackId>(DEFAULT_CARD_BACK);
  const [cardFace, setCardFace] = useState<CardFaceId>(DEFAULT_CARD_FACE);
  const [colorblindMode, setColorblindMode] = useState<ColorblindMode>(DEFAULT_COLORBLIND_MODE);
  const [loading, setLoading] = useState(true);
  const [confirmingReset, setConfirmingReset] = useState(false);
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
  }

  useEffect(() => {
    loadAllFromLocal();
    const permission = getPushPermission();
    if (permission === "unsupported") setPushState("unsupported");
    else if (permission === "denied") setPushState("denied");
    else isPushSubscribed().then((subbed) => setPushState(subbed ? "on" : "off"));
    setLoading(false);
    return onAccountSettingsSynced(loadAllFromLocal);
  }, []);

  function handleColorblindModeChange(mode: ColorblindMode) {
    setColorblindMode(mode);
    saveLocalColorblindMode(mode);
    applyColorblindMode(mode);
    pushColorblindMode(supabase, user?.id ?? null, mode);
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
    setConfirmingReset(false);
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
      setPushError(result.reason ?? "Couldn't turn on notifications.");
    }
  }

  const activeThemeOption = THEMES.find((t) => t.id === theme);
  const activeCardBackOption = cardBack === "match" ? undefined : THEMES.find((t) => t.id === cardBack);
  const currentSongLabel = AMBIENT_SONGS.find((s) => s.id === settings.ambientTrack)?.label ?? "Arpeggio";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-10">
      <Link
        href="/"
        className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Home
      </Link>
      <h1 className="-mt-4 text-2xl font-bold text-[var(--heading)]">Settings</h1>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <PageTip id="settings" title="Carries over automatically when signed in">
            Theme, card face, sound, AI difficulty, and every toggle below sync to your account —
            sign in on another device (or a fresh &quot;Add to Home Screen&quot; install) and they show
            up there too. Playing signed out keeps everything on this browser only. Not sure what
            something does? Tap the ⓘ next to it.
          </PageTip>

          <SettingsSection title="Appearance">
          {activeThemeOption && (
            <SwatchLinkRow
              href="/settings/theme"
              label="Theme"
              name={activeThemeOption.name}
              swatch={THEME_SWATCHES[activeThemeOption.id]}
            />
          )}

          {/* "Match table theme" has no swatch of its own — it resolves to
              whichever theme is currently active, so that's exactly what
              this row shows. */}
          <SwatchLinkRow
            href="/settings/card-back"
            label="Card back"
            name={activeCardBackOption ? activeCardBackOption.name : "Match table theme"}
            swatch={THEME_SWATCHES[activeCardBackOption ? activeCardBackOption.id : theme]}
          />

          <CardFaceLinkRow
            name={CARD_FACES.find((f) => f.id === cardFace)?.name ?? "Classic"}
            cardFace={cardFace}
          />

          <section className="flex flex-col gap-2">
            <InfoDetails label="Colorblind-friendly cards">
              Shifts red and/or wild card colors to be easier to tell apart, for the color blindness
              type you pick. Suit symbols (♥ ♦ ♣ ♠) always show regardless of this setting.
            </InfoDetails>
            <div className="grid grid-cols-2 gap-2">
              {COLORBLIND_MODES.map((m) => {
                const swatch = COLORBLIND_SWATCHES[m.id];
                return (
                  <button
                    key={m.id}
                    onClick={() => handleColorblindModeChange(m.id)}
                    title={m.description}
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
                        title="Red card color"
                      />
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                        style={{ background: swatch.wildBg }}
                        title="Wild card color"
                      />
                    </span>
                    {m.name}
                  </button>
                );
              })}
            </div>
          </section>
          </SettingsSection>

          <SettingsSection title="Sound & haptics">
          <BoolToggle
            label="Sound effects"
            value={settings.soundEnabled}
            onChange={(v) => updateSettings({ soundEnabled: v })}
            description="Short tap/slide/chime sounds for draws, discards, melds, and round/game wins."
          />
          <VolumeSlider
            value={settings.soundVolume}
            disabled={!settings.soundEnabled}
            onChange={(v) => updateSettings({ soundVolume: v })}
          />
          <BoolToggle
            label="Haptics"
            value={settings.hapticsEnabled}
            onChange={(v) => updateSettings({ hapticsEnabled: v })}
            description="Short vibration taps at the same moments — independent of sound, so you can have one without the other."
          />
          <BoolToggle
            label="Ambient music"
            value={settings.ambientMusicEnabled}
            onChange={(v) => updateSettings({ ambientMusicEnabled: v })}
            description="A soft generative background pad while a game screen is open — separate from sound effects, so you can have one without the other. Off by default."
          />
          <VolumeSlider
            value={settings.ambientVolume}
            disabled={!settings.ambientMusicEnabled}
            onChange={(v) => {
              updateSettings({ ambientVolume: v });
              setAmbienceVolume(v);
            }}
            label="Ambient volume"
            description="How loud the background pad is. Kept subtle even at 100% — it's meant to sit behind everything else."
            ariaLabel="Ambient music volume"
          />
          <AmbientSongLinkRow
            name={settings.ambientTrack === "rotate" ? "All songs" : currentSongLabel}
            disabled={!settings.ambientMusicEnabled}
          />
          </SettingsSection>

          <SettingsSection title="Gameplay">
          <section className="flex flex-col gap-2">
            <InfoDetails label="Default AI difficulty">
              Used as the starting difficulty when you add an AI opponent on the New Game screen.
            </InfoDetails>
            <select
              value={settings.preferredAiDifficulty}
              onChange={(e) => updateSettings({ preferredAiDifficulty: e.target.value as Difficulty })}
              aria-label="Default AI difficulty"
              className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {capitalize(d)}
                </option>
              ))}
            </select>
          </section>

          <BoolToggle
            label="Highlight possible lay-offs"
            value={settings.highlightLayoffs}
            onChange={(v) => updateSettings({ highlightLayoffs: v })}
            description="Badge hand cards and the top discard-pile card that fit a meld already on the table, so you can plan ahead even before you've melded your own contract."
          />

          <BoolToggle
            label="“Whose turn is it?” button"
            value={settings.showWhoseTurn}
            onChange={(v) => updateSettings({ showWhoseTurn: v })}
            description="Show a button on the game board that pops up a quick reminder of whose turn it is, for a few seconds."
          />
          </SettingsSection>

          {configured && user && (
            <SettingsSection title="Notifications">
              <section className="flex flex-col gap-2">
                <InfoDetails label="Turn notifications">
                  A push notification when it&apos;s your move in a multiplayer game, and — if your
                  Daily Deal streak is about to lapse — a reminder to play before you lose it.
                  Works once this page is added to your home screen or installed as an app; your
                  browser controls the actual permission. Off by default.
                </InfoDetails>
                <details>
                  <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-[var(--muted)] [&::-webkit-details-marker]:hidden">
                    <span>How do I add it to my home screen?</span>
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" aria-hidden="true">
                      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  <div className="mt-2 flex flex-col gap-3 text-xs text-[var(--faint)]">
                    <div>
                      <p className="font-semibold text-[var(--muted)]">Android (Chrome)</p>
                      <ol className="mt-0.5 list-decimal space-y-0.5 pl-4">
                        <li>Tap the ⋮ menu (top right).</li>
                        <li>Tap &quot;Add to Home screen.&quot;</li>
                        <li>Tap &quot;Add&quot; to confirm.</li>
                      </ol>
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--muted)]">iPhone/iPad (Safari)</p>
                      <ol className="mt-0.5 list-decimal space-y-0.5 pl-4">
                        <li>Tap the Share icon (square with an arrow, at the bottom).</li>
                        <li>Scroll down and tap &quot;Add to Home Screen.&quot;</li>
                        <li>Tap &quot;Add&quot; (top right) to confirm.</li>
                      </ol>
                    </div>
                    <p>
                      Either way, open the game from the new icon on your home screen — not the
                      browser — from then on.
                    </p>
                  </div>
                </details>
                {pushState === "unsupported" ? (
                  <p className="text-xs text-[var(--faint)]">
                    {isIosSafariNonStandalone()
                      ? "iPhone/iPad only supports this once the page is added to your Home Screen — tap the Share icon, then \"Add to Home Screen\", then open it from there."
                      : "Not supported in this browser."}
                  </p>
                ) : pushState === "denied" ? (
                  <p className="text-xs text-[var(--faint)]">
                    Blocked in your browser&apos;s notification settings for this site — allow them
                    there to turn this back on.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    {(
                      [
                        [true, "On"],
                        [false, "Off"],
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
              </section>
            </SettingsSection>
          )}

          <SettingsSection title="Help">
            <section className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--heading)]">First-visit tips</p>
                <p className="text-xs text-[var(--faint)]">
                  Bring back the dismissed tips on Home, New Game, and a few other pages.
                </p>
              </div>
              <button
                onClick={() => {
                  resetSeenTips();
                  setTipsReset(true);
                }}
                className="shrink-0 rounded-lg bg-[var(--panel)] px-3 py-2 text-sm font-medium text-[var(--heading)] hover:bg-[var(--panel-soft)]"
              >
                {tipsReset ? "Done ✓" : "Show again"}
              </button>
            </section>

            <section className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--heading)]">Found a bug? Have an idea?</p>
                <p className="text-xs text-[var(--faint)]">Send a report or feature request.</p>
              </div>
              <Link
                href="/support"
                className="shrink-0 rounded-lg bg-[var(--panel)] px-3 py-2 text-sm font-medium text-[var(--heading)] hover:bg-[var(--panel-soft)]"
              >
                Contact us
              </Link>
            </section>
          </SettingsSection>

          {confirmingReset ? (
            <div className="flex flex-col gap-3 rounded-lg border border-[var(--danger)]/50 bg-[var(--panel)] p-3">
              <p className="text-sm text-[var(--muted)]">
                Reset theme, card back, colorblind mode, and every toggle on this page back to their
                defaults?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmingReset(false)}
                  className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetToDefaults}
                  className="flex-1 rounded-lg border border-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-[var(--danger)] hover:bg-[var(--panel-soft)]"
                >
                  Yes, reset
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingReset(true)}
              className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
            >
              Reset to defaults
            </button>
          )}
        </>
      )}

      <Link href="/" className="text-center text-sm text-[var(--muted)] hover:text-[var(--text)]">
        Back to Home
      </Link>
    </main>
  );
}
