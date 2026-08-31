"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { DEFAULT_SETTINGS, HouseSettings, loadLocalSettings, saveLocalSettings } from "../lib/settingsStore";
import {
  applyTheme,
  DEFAULT_THEME,
  loadLocalTheme,
  saveLocalTheme,
  THEMES,
  ThemeId,
  ThemeOption,
} from "../lib/themeStore";
import {
  applyColorblindMode,
  ColorblindMode,
  COLORBLIND_MODES,
  DEFAULT_COLORBLIND_MODE,
  loadLocalColorblindMode,
  saveLocalColorblindMode,
} from "../lib/colorblindStore";
import { supabase } from "../lib/supabaseClient";
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

interface SettingsRow {
  preferred_ai_difficulty_default: string | null;
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

// Small static preview swatches per theme — kept in sync by hand with
// globals.css's [data-theme] blocks since these render outside the current
// page's own theme context (so the picker can show every option at once,
// not just whichever one happens to be active right now).
const THEME_SWATCHES: Record<ThemeId, { bg: string; panel: string; accent: string; heading: string }> = {
  midnight: { bg: "#0a2b20", panel: "#123c2c", accent: "#fbbf24", heading: "#fef3c7" },
  daylight: { bg: "#f4f1ea", panel: "#ffffff", accent: "#d97706", heading: "#1f3d2e" },
  pastel: { bg: "#eef1fb", panel: "#ffffff", accent: "#ef8b6b", heading: "#3c5e82" },
  casino: { bg: "#170a0a", panel: "#2b1010", accent: "#d4af37", heading: "#e9c46a" },
  arcade: { bg: "#14092b", panel: "#1f1147", accent: "#33e6c9", heading: "#ff5fb0" },
  noir: { bg: "#0d0d0d", panel: "#1c1c1c", accent: "#e8e8e8", heading: "#f5f5f5" },
  sakura: { bg: "#fdf1f5", panel: "#ffffff", accent: "#d63868", heading: "#7a2142" },
  ember: { bg: "#0f0906", panel: "#1e120a", accent: "#ff5a1f", heading: "#ff9552" },
  lagoon: { bg: "#04211f", panel: "#0a3634", accent: "#ff6f91", heading: "#ffe3ec" },
  sahara: { bg: "#2a1810", panel: "#3d2517", accent: "#2fb6a8", heading: "#f4c78a" },
  aurora: { bg: "#060b14", panel: "#0f1d2e", accent: "#c084fc", heading: "#86efac" },
  jade: { bg: "#0b1210", panel: "#132019", accent: "#2fae72", heading: "#f0d78c" },
  verdigris: { bg: "#0c1613", panel: "#16241f", accent: "#d97b45", heading: "#8fd4bd" },
  alabaster: { bg: "#f2f1ef", panel: "#ffffff", accent: "#2b2a27", heading: "#2b2a27" },
  citrus: { bg: "#fff8ee", panel: "#ffffff", accent: "#f2711d", heading: "#7a3b12" },
  frost: { bg: "#f4f9fc", panel: "#ffffff", accent: "#2ba7d9", heading: "#0f3a5f" },
  meadow: { bg: "#f9f8ec", panel: "#ffffff", accent: "#d6a419", heading: "#2f4a1e" },
  coralsand: { bg: "#fdf3e7", panel: "#ffffff", accent: "#ff7a5c", heading: "#8a4a1e" },
  lilac: { bg: "#f4f1f6", panel: "#ffffff", accent: "#8654a3", heading: "#4a2c5e" },
  champagne: { bg: "#faf3e4", panel: "#ffffff", accent: "#c9972f", heading: "#6b4f12" },
  valentines: { bg: "#2b0a14", panel: "#3d1220", accent: "#e0245e", heading: "#ff8fab" },
  stpatricks: { bg: "#052e16", panel: "#0c3f1f", accent: "#2fbf6f", heading: "#ffd93d" },
  easter: { bg: "#fdf6fb", panel: "#ffffff", accent: "#6fb88a", heading: "#7a3d70" },
  july4th: { bg: "#050e2e", panel: "#0d1a44", accent: "#d9263a", heading: "#ffffff" },
  halloween: { bg: "#0d0710", panel: "#1c1020", accent: "#9d5cff", heading: "#ff8c1a" },
  thanksgiving: { bg: "#2a1608", panel: "#3d2410", accent: "#c1541f", heading: "#e08a2e" },
  hanukkah: { bg: "#0a1230", panel: "#121c42", accent: "#d4af37", heading: "#e8ecff" },
  christmas: { bg: "#0a2818", panel: "#123821", accent: "#c8102e", heading: "#f4c95d" },
  newyears: { bg: "#0a0a0c", panel: "#18161c", accent: "#d4af37", heading: "#f0d78c" },
  sweetheart: { bg: "#fff0f4", panel: "#ffffff", accent: "#e0245e", heading: "#a8154a" },
  cloverfield: { bg: "#f3fbf3", panel: "#ffffff", accent: "#2fa864", heading: "#0d5c30" },
  springdusk: { bg: "#1c1030", panel: "#281848", accent: "#7fd9a8", heading: "#d8b8f0" },
  starsandstripes: { bg: "#f7f9fd", panel: "#ffffff", accent: "#c8102e", heading: "#16255e" },
  candycorn: { bg: "#fff8ec", panel: "#ffffff", accent: "#8b3fd9", heading: "#7a3d0f" },
  pumpkinspice: { bg: "#fbf0e0", panel: "#ffffff", accent: "#d2691e", heading: "#7a3d0f" },
  festivaloflights: { bg: "#f2f6ff", panel: "#ffffff", accent: "#c9972f", heading: "#1a3a7a" },
  candycane: { bg: "#fef7f5", panel: "#ffffff", accent: "#d2122e", heading: "#0d5c34" },
  confetti: { bg: "#fffaf0", panel: "#ffffff", accent: "#d94f9e", heading: "#8a6510" },
};

// Representative preview colors per colorblind mode, so the Settings page
// can show what each mode actually does without needing a real card on
// screen (a wild card especially — Tritanopia's only visible change is on
// those, so without this preview, checking it meant hunting for a 2 or
// Joker in an active game). Hand-maintained against globals.css's
// [data-colorblind] blocks, same as THEME_SWATCHES above/below — these
// render outside the current [data-colorblind] context (so every option can
// be compared side by side at once), so they can't just read the live CSS
// variables the way an actual card does.
const COLORBLIND_SWATCHES: Record<ColorblindMode, { red: string; wildBg: string; wildText: string }> = {
  off: { red: "#b91c1c", wildBg: "#fef3c7", wildText: "#92400e" },
  protanopia: { red: "#1d4ed8", wildBg: "#fef3c7", wildText: "#92400e" },
  deuteranopia: { red: "#d55e00", wildBg: "#fef3c7", wildText: "#92400e" },
  tritanopia: { red: "#b91c1c", wildBg: "#f3d0ec", wildText: "#7a1f6b" },
};

// A row per theme (swatch + full name, never truncated) instead of the
// small-grid-cell-with-a-caption layout this replaced — that grid packed 5
// swatches per row on a phone-width screen, leaving each theme's name maybe
// 55px to render in, which clipped anything longer than ~8-9 characters
// ("St. Patrick's Day", "Festival of Lights", etc.). A single-column list
// gives every name the full row width, so nothing needs truncating; the
// swatch itself already carries most of the "which one is this" signal at a
// glance, with the name as the reliable, always-fully-readable identifier.
function ThemeList({
  themes,
  active,
  onSelect,
}: {
  themes: ThemeOption[];
  active: ThemeId;
  onSelect: (id: ThemeId) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {themes.map((t) => {
        const swatch = THEME_SWATCHES[t.id];
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            aria-current={isActive}
            className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
              isActive ? "bg-[var(--accent)]/15" : "hover:bg-[var(--panel)]"
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 transition ${
                isActive ? "border-[var(--accent)]" : "border-transparent"
              }`}
              style={{ background: swatch.bg }}
            >
              <span
                className="h-4 w-4 rounded-full border"
                style={{ background: swatch.panel, borderColor: swatch.accent }}
              />
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-[var(--heading)]">{t.name}</span>
            {isActive && (
              <svg
                viewBox="0 0 20 20"
                className="h-4 w-4 shrink-0 text-[var(--accent)]"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Collapsed by default (except whichever category holds the currently
// active theme) so the settings page doesn't open with ~38 rows' worth of
// theme list already unfurled — same collapse-by-default reasoning as the
// "Player activity this round" table on the game board. Plain useState
// rather than the native <details> InfoDetails uses elsewhere: this needs a
// visible open row-count and an explicit Show/Hide affordance bigger than a
// bare disclosure triangle, since tapping into a ~20-row list is a more
// deliberate action than glancing at a one-line setting description.
function ThemeCategorySection({
  title,
  themes,
  active,
  onSelect,
  defaultOpen,
}: {
  title: string;
  themes: ThemeOption[];
  active: ThemeId;
  onSelect: (id: ThemeId) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
          {title} <span className="normal-case text-[var(--faint)]">({themes.length})</span>
        </h3>
        <span className="text-xs text-[var(--faint)]">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>
      {open && <ThemeList themes={themes} active={active} onSelect={onSelect} />}
    </div>
  );
}

export default function SettingsPage() {
  const { configured, user } = useAuth();
  const [settings, setSettings] = useState<HouseSettings>(DEFAULT_SETTINGS);
  const [theme, setTheme] = useState<ThemeId>("midnight");
  const [colorblindMode, setColorblindMode] = useState<ColorblindMode>(DEFAULT_COLORBLIND_MODE);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    setSettings(loadLocalSettings());
    setTheme(loadLocalTheme());
    setColorblindMode(loadLocalColorblindMode());
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    supabase
      .from("settings")
      .select("preferred_ai_difficulty_default")
      .eq("user_id", user.id)
      .maybeSingle<SettingsRow>()
      .then(({ data, error }) => {
        if (error) console.error("Failed to load synced settings:", error.message);
        if (data) {
          const synced: HouseSettings = {
            ...loadLocalSettings(),
            preferredAiDifficulty: (data.preferred_ai_difficulty_default as Difficulty) ?? "medium",
          };
          setSettings(synced);
          // Keep local storage in step with the account's settings, since
          // other pages (like New Game) read local storage only.
          saveLocalSettings(synced);
        }
        setLoading(false);
      });
  }, [user]);

  function handleThemeChange(id: ThemeId) {
    setTheme(id);
    saveLocalTheme(id);
    applyTheme(id);
  }

  function handleColorblindModeChange(mode: ColorblindMode) {
    setColorblindMode(mode);
    saveLocalColorblindMode(mode);
    applyColorblindMode(mode);
  }

  // Covers everything on this page that's local-only and instant-apply —
  // theme and colorblind mode live in their own separate stores (see their
  // own handlers above), not HouseSettings, so a plain updateSettings(
  // DEFAULT_SETTINGS) alone wouldn't touch them; this calls all three
  // reset paths together so "Reset to defaults" really means the whole
  // page, not just the toggles. Doesn't touch the signed-in account's
  // synced AI difficulty by itself — that only ever changes via the
  // separate, explicit "Sync to your account" action, same as any other
  // local change here.
  function handleResetToDefaults() {
    setSettings(DEFAULT_SETTINGS);
    saveLocalSettings(DEFAULT_SETTINGS);
    setTheme(DEFAULT_THEME);
    saveLocalTheme(DEFAULT_THEME);
    applyTheme(DEFAULT_THEME);
    setColorblindMode(DEFAULT_COLORBLIND_MODE);
    saveLocalColorblindMode(DEFAULT_COLORBLIND_MODE);
    applyColorblindMode(DEFAULT_COLORBLIND_MODE);
    setConfirmingReset(false);
  }

  // Applies and persists a change to any local-only setting immediately —
  // same instant-apply behavior Theme and Colorblind mode already have.
  // None of these fields (AI difficulty aside) are ever synced to Supabase
  // (see saveLocalSettings' own callers), so there's nothing an explicit
  // "Save" step was ever protecting here; requiring one just meant a toggle
  // flipped and then navigated away from — without noticing a button lower
  // on the page — silently reverted on the next visit. preferredAiDifficulty
  // is included here too (it needs to persist locally right away, same as
  // everything else) — syncAiDifficultyToAccount below handles the one
  // genuinely separate action: mirroring it to a signed-in account.
  function updateSettings(patch: Partial<HouseSettings>) {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveLocalSettings(next);
      return next;
    });
  }

  async function syncAiDifficultyToAccount() {
    if (!supabase || !user) return;
    setSaveState("saving");
    const { error } = await supabase.from("settings").upsert({
      user_id: user.id,
      preferred_ai_difficulty_default: settings.preferredAiDifficulty,
    });
    setSaveState(error ? "error" : "saved");
  }

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
          <section className="flex flex-col gap-3">
            <label className="text-sm font-medium text-[var(--muted)]">Theme</label>

            {(() => {
              const active = THEMES.find((t) => t.id === theme);
              const swatch = THEME_SWATCHES[theme];
              if (!active) return null;
              return (
                <div className="flex items-center gap-3 rounded-lg bg-[var(--panel)] px-3 py-2.5">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--accent)]"
                    style={{ background: swatch.bg }}
                  >
                    <span
                      className="h-5 w-5 rounded-full border"
                      style={{ background: swatch.panel, borderColor: swatch.accent }}
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--heading)]">{active.name}</p>
                    <p className="text-xs text-[var(--faint)]">{active.description}</p>
                  </div>
                </div>
              );
            })()}

            <ThemeCategorySection
              title="Classic"
              themes={THEMES.filter((t) => t.category === "classic")}
              active={theme}
              onSelect={handleThemeChange}
              defaultOpen={THEMES.find((t) => t.id === theme)?.category === "classic"}
            />

            <ThemeCategorySection
              title="Holiday"
              themes={THEMES.filter((t) => t.category === "holiday")}
              active={theme}
              onSelect={handleThemeChange}
              defaultOpen={THEMES.find((t) => t.id === theme)?.category === "holiday"}
            />
          </section>

          <section className="flex flex-col gap-2">
            <InfoDetails label="Default AI difficulty">
              Used as the starting difficulty when you add an AI opponent on the New Game screen.
            </InfoDetails>
            <select
              value={settings.preferredAiDifficulty}
              onChange={(e) => updateSettings({ preferredAiDifficulty: e.target.value as Difficulty })}
              className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {capitalize(d)}
                </option>
              ))}
            </select>
            {/* Every other setting on this page saves the instant it changes
                (see updateSettings) — this is the one exception, since it's
                the only field with somewhere else to go: a signed-in
                account, reachable from any device. That's a deliberate,
                explicit action, not something that should fire on every
                keystroke through a dropdown. */}
            {configured && user && (
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={syncAiDifficultyToAccount}
                  disabled={saveState === "saving"}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-50"
                >
                  {saveState === "saving" ? "Saving…" : "Sync to your account"}
                </button>
                {saveState === "saved" && (
                  <p className="text-xs text-[var(--muted)]">Saved to your account.</p>
                )}
                {saveState === "error" && (
                  <p className="text-xs text-[var(--danger)]">Couldn&apos;t reach your account to save it there.</p>
                )}
              </div>
            )}
            {configured && !user && (
              <p className="text-xs text-[var(--faint)]">
                <Link href="/sign-in" className="underline hover:text-[var(--muted)]">
                  Sign in
                </Link>{" "}
                to keep this the same everywhere you play.
              </p>
            )}
          </section>

          <BoolToggle
            label="Sound effects"
            value={settings.soundEnabled}
            onChange={(v) => updateSettings({ soundEnabled: v })}
            description="Short tap/slide/chime sounds for draws, discards, melds, and round/game wins."
          />

          <BoolToggle
            label="Expandable hand drawer"
            value={settings.expandableHand}
            onChange={(v) => updateSettings({ expandableHand: v })}
            description="Instead of scrolling down to your hand, tap the compact preview pinned to the bottom of the screen to open it — sorting, dragging, grouping a meld, laying off, and discarding all happen right there, without scrolling. On by default; the tutorial always uses the regular scrolling layout regardless of this."
          />

          <BoolToggle
            label="Group melds by type"
            value={settings.groupMeldsByType}
            onChange={(v) => updateSettings({ groupMeldsByType: v })}
            description="In Table melds, show each player's books before their runs, instead of the order they were confirmed in."
          />

          <BoolToggle
            label="Highlight possible lay-offs"
            value={settings.highlightLayoffs}
            onChange={(v) => updateSettings({ highlightLayoffs: v })}
            description="Badge hand cards and the top discard-pile card that fit a meld already on the table, so you can plan ahead even before you've melded your own contract."
          />

          <BoolToggle
            label="Player activity table"
            value={settings.showPlayerActivity}
            onChange={(v) => updateSettings({ showPlayerActivity: v })}
            description="Show the collapsible 'Player activity this round' table on the game board, with each player's latest discard and discard-pile pickup."
          />

          <BoolToggle
            label="“Who's turn is it?” button"
            value={settings.showWhoseTurn}
            onChange={(v) => updateSettings({ showWhoseTurn: v })}
            description="Show a button on the game board that pops up a quick reminder of whose turn it is, for a few seconds."
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

          {confirmingReset ? (
            <div className="flex flex-col gap-3 rounded-lg border border-[var(--danger)]/50 bg-[var(--panel)] p-3">
              <p className="text-sm text-[var(--muted)]">
                Reset theme, colorblind mode, and every toggle on this page back to their defaults?
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
