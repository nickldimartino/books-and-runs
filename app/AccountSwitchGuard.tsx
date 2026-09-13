"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { accountSwitched } from "./lib/accountScope";
import { resetLocalPreferencesToDefaults } from "./lib/accountSettingsSync";
import { resetDailyDealLocal } from "./lib/dailyDealStore";
import { clearFavoriteGameConfig } from "./lib/favoriteGameConfig";
import { clearDailyDealSave, clearSavedGame, clearWeeklyChallengeSave } from "./lib/localSave";
import { resetSeenTips } from "./lib/tipsStore";
import { resetWeeklyChallengeLocal } from "./lib/weeklyChallengeStore";

/**
 * Catches a genuinely different account signing in on a device that still
 * has another account's local data on it — a shared computer, or simply
 * the same person's own device after someone else (or a second account of
 * theirs) used it. Without this, every "local cache, synced lazily" store
 * in the app — solo save, Daily Deal streak and Weekly Challenge streak
 * (each with its own separate in-progress save, see localSave.ts's
 * DAILY_DEAL_SAVE_KEY/WEEKLY_CHALLENGE_SAVE_KEY), favorite game config,
 * first-visit tips, and every Settings/Theme/Card back/Card face
 * preference — would show the PREVIOUS account's leftover values to the
 * new one. Worse than just a display bug: several of those stores' own
 * sync functions treat "local has something, cloud doesn't yet" as "this
 * device is the source of truth, push it up" (see localSave.ts's
 * LocalSaveSync, dailyDealStore.ts, weeklyChallengeStore.ts,
 * favoriteGameConfig.ts's own docs) — so without a reset first, the new
 * account's very first sync could actively write the OLD account's
 * leftover game/streak/config into the NEW account's own cloud rows, not
 * just display it locally.
 *
 * Also clears favorite game config and the Daily Deal/Weekly Challenge
 * streaks specifically on sign-out (the opposite direction). Favorite game
 * config: otherwise a signed-in account's curated "usual" lineup stays
 * sitting in local storage, one tap away for whoever picks up the device
 * next, signed in or not. The streaks: unlike the solo save, which really
 * is "whatever's on this device" and stays put across a sign-out, a streak
 * is meant to belong to the account (see GameOverScreen.tsx's own Daily
 * Deal/Weekly Challenge effects, which now only record a result at all when
 * signed in) — showing the previous account's streak to a signed-out guest
 * is exactly the bug this fixes.
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
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (user) {
      wasSignedIn.current = true;
      if (!accountSwitched(user.id)) return;
      clearSavedGame();
      clearDailyDealSave();
      resetDailyDealLocal();
      clearWeeklyChallengeSave();
      resetWeeklyChallengeLocal();
      clearFavoriteGameConfig();
      resetSeenTips();
      resetLocalPreferencesToDefaults();
      return;
    }

    // Signing out, specifically (not "never signed in this session" — a
    // guest who never had an account here has nothing of an account's to
    // leave behind). The solo save is deliberately left alone here — it
    // really does read as "whatever's currently on this device" rather than
    // personal identity, and clearing it on every sign-out would just be
    // annoying without a privacy upside. Favorite game config and the Daily
    // Deal streak are both cloud-synced, so this is safe either way —
    // signing back into the same account just pulls them straight back.
    if (wasSignedIn.current) {
      wasSignedIn.current = false;
      clearFavoriteGameConfig();
      resetDailyDealLocal();
      resetWeeklyChallengeLocal();
    }
  }, [user]);

  return null;
}
