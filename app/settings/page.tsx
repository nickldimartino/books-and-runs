"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { DEFAULT_SETTINGS, HouseSettings, loadLocalSettings, saveLocalSettings } from "../lib/settingsStore";
import { applyTheme, loadLocalTheme, saveLocalTheme, THEMES, ThemeId } from "../lib/themeStore";
import { supabase } from "../lib/supabaseClient";
import { Difficulty } from "@/types";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];

interface SettingsRow {
  preferred_ai_difficulty_default: string | null;
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
      <p className="text-xs text-[var(--faint)]">{description}</p>
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {THEMES.map((t) => {
                const swatch = THEME_SWATCHES[t.id];
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleThemeChange(t.id)}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${
                      active
                        ? "border-[var(--accent)] bg-[var(--panel)]"
                        : "border-[var(--border)] bg-[var(--panel)]/80 hover:bg-[var(--panel)]"
                    }`}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)]"
                      style={{ background: swatch.bg }}
                      aria-hidden
                    >
                      <span
                        className="h-6 w-6 rounded-full border"
                        style={{ background: swatch.panel, borderColor: swatch.accent }}
                      />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold" style={{ color: active ? "var(--heading)" : "var(--text)" }}>
                        {t.name}
                        {active && <span className="ml-1.5 text-xs font-normal text-[var(--accent)]">(active)</span>}
                      </span>
                      <span className="text-xs text-[var(--faint)]">{t.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[var(--faint)]">
              Applies immediately and stays on this device — it doesn&apos;t sync to your account.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--muted)]">Default AI difficulty</label>
            <select
              value={settings.preferredAiDifficulty}
              onChange={(e) =>
                setSettings((s) => ({ ...s, preferredAiDifficulty: e.target.value as Difficulty }))
              }
              className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm capitalize text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d} className="capitalize">
                  {d}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--faint)]">
              Used as the starting difficulty when you add an AI opponent on the New Game screen.
            </p>
          </section>

          <BoolToggle
            label="Sound effects"
            value={settings.soundEnabled}
            onChange={(v) => setSettings((s) => ({ ...s, soundEnabled: v }))}
            description="Short tap/slide/chime sounds for draws, discards, melds, and round/game wins. Local to this device, like the theme — doesn't sync to your account."
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
                Saved{configured && user ? " and synced to your account." : " on this device."}
              </p>
            )}
            {saveState === "error" && (
              <p className="text-center text-xs text-[var(--danger)]">
                Saved on this device, but couldn&apos;t sync to your account.
              </p>
            )}
            {configured && !user && (
              <p className="text-center text-xs text-[var(--faint)]">
                <Link href="/sign-in" className="underline hover:text-[var(--muted)]">
                  Sign in
                </Link>{" "}
                to sync settings across devices.
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
