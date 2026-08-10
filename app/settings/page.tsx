"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { DEFAULT_SETTINGS, HouseSettings, loadLocalSettings, saveLocalSettings } from "../lib/settingsStore";
import { supabase } from "../lib/supabaseClient";
import { Difficulty } from "@/types";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];
const WILD_LIMIT_OPTIONS: { label: string; value: string }[] = [
  { label: "No limit", value: "" },
  { label: "1 wild per meld", value: "1" },
  { label: "2 wilds per meld", value: "2" },
  { label: "3 wilds per meld", value: "3" },
];

interface SettingsRow {
  wild_card_limit_house_rule: number | null;
  preferred_ai_difficulty_default: string | null;
  sound_on: boolean;
}

export default function SettingsPage() {
  const { configured, user } = useAuth();
  const [settings, setSettings] = useState<HouseSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    setSettings(loadLocalSettings());
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    supabase
      .from("settings")
      .select("wild_card_limit_house_rule, preferred_ai_difficulty_default, sound_on")
      .eq("user_id", user.id)
      .maybeSingle<SettingsRow>()
      .then(({ data }) => {
        if (data) {
          setSettings({
            wildCardLimit: data.wild_card_limit_house_rule,
            preferredAiDifficulty: (data.preferred_ai_difficulty_default as Difficulty) ?? "medium",
            soundOn: data.sound_on,
          });
        }
        setLoading(false);
      });
  }, [user]);

  async function handleSave() {
    setSaveState("saving");
    saveLocalSettings(settings);
    if (supabase && user) {
      const { error } = await supabase.from("settings").upsert({
        user_id: user.id,
        wild_card_limit_house_rule: settings.wildCardLimit,
        preferred_ai_difficulty_default: settings.preferredAiDifficulty,
        sound_on: settings.soundOn,
      });
      setSaveState(error ? "error" : "saved");
    } else {
      setSaveState("saved");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-10">
      <h1 className="text-2xl font-bold text-amber-100">Settings</h1>

      {loading ? (
        <p className="text-sm text-emerald-100/60">Loading…</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <label className="text-sm font-medium text-emerald-100/80">Wild card limit per meld</label>
            <select
              value={settings.wildCardLimit === null ? "" : String(settings.wildCardLimit)}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  wildCardLimit: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              className="rounded-lg bg-emerald-950 px-4 py-3 text-sm text-amber-100 outline-none ring-1 ring-emerald-100/20 focus:ring-amber-400"
            >
              {WILD_LIMIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-emerald-100/40">
              Saved for reference during house-rule discussions — not yet enforced by the game
              engine.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <label className="text-sm font-medium text-emerald-100/80">Default AI difficulty</label>
            <select
              value={settings.preferredAiDifficulty}
              onChange={(e) =>
                setSettings((s) => ({ ...s, preferredAiDifficulty: e.target.value as Difficulty }))
              }
              className="rounded-lg bg-emerald-950 px-4 py-3 text-sm capitalize text-amber-100 outline-none ring-1 ring-emerald-100/20 focus:ring-amber-400"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d} className="capitalize">
                  {d}
                </option>
              ))}
            </select>
            <p className="text-xs text-emerald-100/40">
              Used as the starting difficulty when you add an AI opponent on the New Game screen.
            </p>
          </section>

          <section className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-emerald-100/80">Sound</label>
              <p className="text-xs text-emerald-100/40">
                Saved, but this app doesn&apos;t have sound effects yet.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={settings.soundOn}
              onClick={() => setSettings((s) => ({ ...s, soundOn: !s.soundOn }))}
              className={`h-7 w-12 shrink-0 rounded-full transition ${
                settings.soundOn ? "bg-amber-400" : "bg-emerald-900"
              }`}
            >
              <span
                className={`block h-5 w-5 translate-y-1 rounded-full bg-white transition ${
                  settings.soundOn ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </section>

          <div className="flex flex-col gap-2">
            <button
              onClick={handleSave}
              disabled={saveState === "saving"}
              className="rounded-lg bg-amber-400 px-6 py-3 text-sm font-semibold text-emerald-950 shadow disabled:opacity-50"
            >
              {saveState === "saving" ? "Saving…" : "Save settings"}
            </button>
            {saveState === "saved" && (
              <p className="text-center text-xs text-emerald-100/60">
                Saved{configured && user ? " and synced to your account." : " on this device."}
              </p>
            )}
            {saveState === "error" && (
              <p className="text-center text-xs text-red-300">
                Saved on this device, but couldn&apos;t sync to your account.
              </p>
            )}
            {configured && !user && (
              <p className="text-center text-xs text-emerald-100/40">
                <Link href="/sign-in" className="underline hover:text-emerald-100/70">
                  Sign in
                </Link>{" "}
                to sync settings across devices.
              </p>
            )}
          </div>
        </>
      )}

      <Link href="/" className="text-center text-sm text-emerald-100/60 hover:text-emerald-100">
        Back to Home
      </Link>
    </main>
  );
}
