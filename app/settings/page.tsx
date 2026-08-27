"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { DEFAULT_SETTINGS, HouseSettings, loadLocalSettings, saveLocalSettings } from "../lib/settingsStore";
import { applyTheme, loadLocalTheme, saveLocalTheme, THEMES, ThemeId } from "../lib/themeStore";
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
// identically on touch and desktop). The trigger is the familiar circled-"i"
// info icon rather than a text link — list-none plus hiding the
// WebKit-specific marker pseudo-element strip the browser's own default
// disclosure triangle in both Firefox and Chrome/Safari so only the icon
// shows; the label text moves to an sr-only span so screen readers still
// get something to announce.
function InfoDetails({ children }: { children: ReactNode }) {
  return (
    <details className="text-xs text-[var(--faint)]">
      <summary
        className="flex w-fit cursor-pointer list-none items-center text-[var(--faint)] hover:text-[var(--muted)] [&::-webkit-details-marker]:hidden"
        title="What does this do?"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="4.7" r="0.9" fill="currentColor" />
          <path d="M8 7.2v4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span className="sr-only">What does this do?</span>
      </summary>
      <p className="mt-1">{children}</p>
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
      <label className="text-sm font-medium text-[var(--muted)]">{label}</label>
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
      <InfoDetails>{description}</InfoDetails>
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
};

export default function SettingsPage() {
  const { configured, user } = useAuth();
  const [settings, setSettings] = useState<HouseSettings>(DEFAULT_SETTINGS);
  const [theme, setTheme] = useState<ThemeId>("midnight");
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    setSettings(loadLocalSettings());
    setTheme(loadLocalTheme());
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

  async function handleSave() {
    setSaveState("saving");
    saveLocalSettings(settings);
    if (supabase && user) {
      const { error } = await supabase.from("settings").upsert({
        user_id: user.id,
        preferred_ai_difficulty_default: settings.preferredAiDifficulty,
      });
      setSaveState(error ? "error" : "saved");
    } else {
      setSaveState("saved");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-10">
      <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
        ← Home
      </Link>
      <h1 className="-mt-4 text-2xl font-bold text-[var(--heading)]">Settings</h1>

      {loading ? (
        <p className="text-sm text-[var(--faint)]">Loading…</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--muted)]">Theme</label>
            <div className="grid grid-cols-5 gap-2">
              {THEMES.map((t) => {
                const swatch = THEME_SWATCHES[t.id];
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleThemeChange(t.id)}
                    title={t.name}
                    className="flex flex-col items-center gap-1 rounded-lg p-1.5 transition hover:bg-[var(--panel)]"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 transition ${
                        active ? "border-[var(--accent)]" : "border-transparent"
                      }`}
                      style={{ background: swatch.bg }}
                    >
                      <span
                        className="h-5 w-5 rounded-full border"
                        style={{ background: swatch.panel, borderColor: swatch.accent }}
                      />
                    </span>
                    <span
                      className="max-w-full truncate text-[10px] font-medium leading-tight"
                      style={{ color: active ? "var(--accent)" : "var(--faint)" }}
                    >
                      {t.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[var(--faint)]">
              <span className="font-semibold text-[var(--muted)]">{THEMES.find((t) => t.id === theme)?.name}</span>{" "}
              — {THEMES.find((t) => t.id === theme)?.description}
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--muted)]">Default AI difficulty</label>
            <select
              value={settings.preferredAiDifficulty}
              onChange={(e) =>
                setSettings((s) => ({ ...s, preferredAiDifficulty: e.target.value as Difficulty }))
              }
              className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {capitalize(d)}
                </option>
              ))}
            </select>
            <InfoDetails>
              Used as the starting difficulty when you add an AI opponent on the New Game screen.
            </InfoDetails>
          </section>

          <BoolToggle
            label="Sound effects"
            value={settings.soundEnabled}
            onChange={(v) => setSettings((s) => ({ ...s, soundEnabled: v }))}
            description="Short tap/slide/chime sounds for draws, discards, melds, and round/game wins."
          />

          <BoolToggle
            label="Group melds by type"
            value={settings.groupMeldsByType}
            onChange={(v) => setSettings((s) => ({ ...s, groupMeldsByType: v }))}
            description="In Table melds, show each player's books before their runs, instead of the order they were confirmed in."
          />

          <BoolToggle
            label="Highlight possible lay-offs"
            value={settings.highlightLayoffs}
            onChange={(v) => setSettings((s) => ({ ...s, highlightLayoffs: v }))}
            description="Badge hand cards and the top discard-pile card that fit a meld already on the table, so you can plan ahead even before you've melded your own contract."
          />

          <BoolToggle
            label="Player activity table"
            value={settings.showPlayerActivity}
            onChange={(v) => setSettings((s) => ({ ...s, showPlayerActivity: v }))}
            description="Show the collapsible 'Player activity this round' table on the game board, with each player's latest discard and discard-pile pickup."
          />

          <BoolToggle
            label="“Who's turn is it?” button"
            value={settings.showWhoseTurn}
            onChange={(v) => setSettings((s) => ({ ...s, showWhoseTurn: v }))}
            description="Show a button on the game board that pops up a quick reminder of whose turn it is, for a few seconds."
          />

          <div className="flex flex-col gap-2">
            <button
              onClick={handleSave}
              disabled={saveState === "saving"}
              className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-50"
            >
              {saveState === "saving" ? "Saving…" : "Save settings"}
            </button>
            {saveState === "saved" && (
              <p className="text-center text-xs text-[var(--muted)]">
                {configured && user ? "Saved to your account." : "Saved."}
              </p>
            )}
            {saveState === "error" && (
              <p className="text-center text-xs text-[var(--danger)]">
                Saved here, but couldn&apos;t reach your account to save it there too.
              </p>
            )}
            {configured && !user && (
              <p className="text-center text-xs text-[var(--faint)]">
                <Link href="/sign-in" className="underline hover:text-[var(--muted)]">
                  Sign in
                </Link>{" "}
                to keep these the same everywhere you play.
              </p>
            )}
          </div>
        </>
      )}

      <Link href="/" className="text-center text-sm text-[var(--muted)] hover:text-[var(--text)]">
        Back to Home
      </Link>
    </main>
  );
}
