"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { DEFAULT_SETTINGS, HouseSettings, loadLocalSettings, saveLocalSettings } from "../lib/settingsStore";
import { supabase } from "../lib/supabaseClient";
import { Difficulty } from "@/types";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];

interface SettingsRow {
  preferred_ai_difficulty_default: string | null;
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
      .select("preferred_ai_difficulty_default")
      .eq("user_id", user.id)
      .maybeSingle<SettingsRow>()
      .then(({ data }) => {
        if (data) {
          const synced: HouseSettings = {
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
      <h1 className="text-2xl font-bold text-amber-100">Settings</h1>

      {loading ? (
        <p className="text-sm text-emerald-100/60">Loading…</p>
      ) : (
        <>
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
