"use client";

import { useEffect } from "react";
import { useAuth } from "./AuthContext";
import { applyAccountSettings, fetchAccountSettings } from "./lib/accountSettingsSync";
import { supabase } from "./lib/supabaseClient";

/**
 * Pulls the signed-in account's synced preferences (theme, card back, card
 * face, colorblind mode, and every Settings toggle — see migration 0022)
 * down onto this device as soon as we know who's signed in, same "not just
 * when the relevant page happens to be visited" reasoning the old
 * AI-difficulty-only version of this had. Matters most for a fresh
 * "Add to Home Screen" install, which starts with its own empty local
 * storage on iOS even for an account that's already customized everything
 * elsewhere. Renders nothing; mounted once in the root layout.
 */
export function AccountSettingsSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!supabase || !user) return;
    fetchAccountSettings(supabase, user.id)
      .then((row) => {
        if (row) applyAccountSettings(row);
      })
      .catch((err) => console.error("Failed to sync settings from account:", err.message));
  }, [user]);

  return null;
}
