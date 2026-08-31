"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { LoadingSpinner } from "../components/LoadingSpinner";
import {
  applyCardBack,
  CardBackId,
  DEFAULT_CARD_BACK,
  loadLocalCardBack,
  saveLocalCardBack,
} from "../lib/cardBackStore";
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
          <span className="block text-xs text-[var(--faint)]">Tap to change</span>
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
  const [colorblindMode, setColorblindMode] = useState<ColorblindMode>(DEFAULT_COLORBLIND_MODE);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    setSettings(loadLocalSettings());
    setTheme(loadLocalTheme());
    setCardBack(loadLocalCardBack());
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
  // page, not just the toggles, even though Theme/Card back's own pickers
  // no longer live on this page directly. Doesn't touch the signed-in
  // account's synced AI difficulty by itself — that only ever changes via
  // the separate, explicit "Sync to your account" action, same as any
  // other local change here.
  function handleResetToDefaults() {
    setSettings(DEFAULT_SETTINGS);
    saveLocalSettings(DEFAULT_SETTINGS);
    setTheme(DEFAULT_THEME);
    saveLocalTheme(DEFAULT_THEME);
    applyTheme(DEFAULT_THEME);
    setCardBack(DEFAULT_CARD_BACK);
    saveLocalCardBack(DEFAULT_CARD_BACK);
    applyCardBack(DEFAULT_CARD_BACK, DEFAULT_THEME);
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

  const activeThemeOption = THEMES.find((t) => t.id === theme);
  const activeCardBackOption = cardBack === "match" ? undefined : THEMES.find((t) => t.id === cardBack);

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
