"use client";

import { useEffect } from "react";
import { useAuth } from "./AuthContext";
import { loadLocalSettings, saveLocalSettings } from "./lib/settingsStore";
import { supabase } from "./lib/supabaseClient";
import { Difficulty } from "@/types";

interface SettingsRow {
  preferred_ai_difficulty_default: string | null;
}

/**
 * Pulls the signed-in user's settings down from Supabase into local storage
 * as soon as we know who they are — not just when the Settings page happens
 * to be visited. Without this, a fresh device that's signed into the same
 * account but has never opened Settings shows stale local defaults (e.g.
 * New Game's AI difficulty) even though the account's settings are correct.
 * Renders nothing; it's a pure side-effect component mounted once in the
 * root layout.
 */
export function SettingsSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!supabase || !user) return;
    supabase
      .from("settings")
      .select("preferred_ai_difficulty_default")
      .eq("user_id", user.id)
      .maybeSingle<SettingsRow>()
      .then(({ data }) => {
        if (!data) return;
        // soundEnabled is local-only (like theme) — never overwrite it with
        // an account-synced value that doesn't exist.
        saveLocalSettings({
          ...loadLocalSettings(),
          preferredAiDifficulty: (data.preferred_ai_difficulty_default as Difficulty) ?? "medium",
        });
      });
  }, [user]);

  return null;
}
