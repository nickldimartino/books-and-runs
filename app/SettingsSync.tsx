"use client";

import { useEffect } from "react";
import { useAuth } from "./AuthContext";
import { saveLocalSettings } from "./lib/settingsStore";
import { supabase } from "./lib/supabaseClient";
import { Difficulty } from "@/types";

interface SettingsRow {
  wild_card_limit_house_rule: number | null;
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
      .select("wild_card_limit_house_rule, preferred_ai_difficulty_default")
      .eq("user_id", user.id)
      .maybeSingle<SettingsRow>()
      .then(({ data }) => {
        if (!data) return;
        saveLocalSettings({
          wildCardLimit: data.wild_card_limit_house_rule,
          preferredAiDifficulty: (data.preferred_ai_difficulty_default as Difficulty) ?? "medium",
        });
      });
  }, [user]);

  return null;
}
