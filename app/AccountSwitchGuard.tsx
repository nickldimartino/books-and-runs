"use client";

import { useEffect } from "react";
import { useAuth } from "./AuthContext";
import { accountSwitched } from "./lib/accountScope";
import { resetLocalPreferencesToDefaults } from "./lib/accountSettingsSync";
import { resetDailyDealLocal } from "./lib/dailyDealStore";
import { clearFavoriteGameConfig } from "./lib/favoriteGameConfig";
import { clearSavedGame } from "./lib/localSave";
import { resetSeenTips } from "./lib/tipsStore";

/**
 * Catches a genuinely different account signing in on a device that still
 * has another account's local data on it — a shared computer, or simply
 * the same person's own device after someone else (or a second account of
 * theirs) used it. Without this, every "local cache, synced lazily" store
 * in the app — solo save, Daily Deal streak, favorite game config,
 * first-visit tips, and every Settings/Theme/Card back/Card face
 * preference — would show the PREVIOUS account's leftover values to the
 * new one. Worse than just a display bug: several of those stores' own
 * sync functions treat "local has something, cloud doesn't yet" as "this
 * device is the source of truth, push it up" (see localSave.ts's
 * LocalSaveSync, dailyDealStore.ts, favoriteGameConfig.ts's own docs) — so
 * without a reset first, the new account's very first sync could actively
 * write the OLD account's leftover game/streak/config into the NEW
 * account's own cloud rows, not just display it locally.
 *
 * Mounted once in the root layout, ahead of every other sync component
 * (AccountSettingsSync, LocalSaveSync, etc.) — React runs effects in tree
 * order, so as long as this stays first among AuthProvider's children,
 * this always clears the slate before any of them get a chance to read or
 * push the wrong thing. Deliberately narrow about what counts as "a
 * switch" worth resetting for — see accountScope.ts's own doc.
 */
export function AccountSwitchGuard() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (!accountSwitched(user.id)) return;

    clearSavedGame();
    resetDailyDealLocal();
    clearFavoriteGameConfig();
    resetSeenTips();
    resetLocalPreferencesToDefaults();
  }, [user]);

  return null;
}
