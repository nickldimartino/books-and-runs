"use client";

// Mirrors the single in-progress solo / pass-and-play game to the account
// (table solo_saves, migration 0015), so it can be picked up on another
// device the same way a multiplayer game can. Signed-out play is untouched
// — it stays purely local.
//
// Reconciliation (once per sign-in): compare the local save's savedAt with
// the cloud row's. Newer wins. The cloud copy is only written into local
// storage when there's no game loaded in memory (state === null) — an
// already-resumed session is authoritative and pushes its own updates.
//
// Ongoing: every local save fires SOLO_SAVE_EVENT; this debounces and
// pushes. clearSavedGame fires SOLO_CLEAR_EVENT; this deletes the row so a
// finished game doesn't resurrect elsewhere.

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useGame } from "./GameContext";
import {
  applyCloudSave,
  clearCloudSave,
  loadCloudSave,
  loadSavedGame,
  pushCloudSave,
  SOLO_CLEAR_EVENT,
  SOLO_SAVE_EVENT,
} from "./lib/localSave";
import { supabase } from "./lib/supabaseClient";

const PUSH_DEBOUNCE_MS = 2500;

export function LocalSaveSync() {
  const { user } = useAuth();
  const { state } = useGame();
  const reconciledFor = useRef<string | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read `state` inside event handlers without making them depend on it.
  const hasLiveGame = useRef(false);
  hasLiveGame.current = state !== null;

  const pushNow = useCallback(async () => {
    if (!supabase || !user) return;
    const local = loadSavedGame();
    try {
      if (local) await pushCloudSave(supabase, user.id, local);
      else await clearCloudSave(supabase, user.id);
    } catch (err) {
      console.error("Failed to sync solo save to the cloud:", err);
    }
  }, [user]);

  // One-time reconcile per signed-in account.
  useEffect(() => {
    if (!supabase || !user) {
      reconciledFor.current = null;
      return;
    }
    if (reconciledFor.current === user.id) return;
    reconciledFor.current = user.id;

    let cancelled = false;
    (async () => {
      let cloud: Awaited<ReturnType<typeof loadCloudSave>> = null;
      try {
        cloud = await loadCloudSave(supabase!, user.id);
      } catch (err) {
        console.error("Failed to read the cloud solo save:", err);
        reconciledFor.current = null; // let a later render retry
        return;
      }
      if (cancelled) return;

      const local = loadSavedGame();
      const localAt = local?.savedAt ?? -1;
      const cloudAt = cloud?.savedAt ?? -1;

      if (cloud && cloudAt > localAt && !hasLiveGame.current) {
        // Another device is ahead and nothing's loaded here yet — take it.
        applyCloudSave(cloud);
      } else if (local && localAt >= cloudAt) {
        // This device is ahead (or the cloud has nothing) — push it up.
        pushCloudSave(supabase!, user.id, local).catch((err) =>
          console.error("Failed to seed the cloud solo save:", err)
        );
      } else if (!local && !cloud) {
        // nothing anywhere — nothing to do
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Ongoing: debounced push on local save, immediate delete on clear.
  useEffect(() => {
    if (!supabase || !user) return;

    const onSave = () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(pushNow, PUSH_DEBOUNCE_MS);
    };
    const onClear = () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      if (supabase && user) clearCloudSave(supabase, user.id).catch(() => {});
    };

    window.addEventListener(SOLO_SAVE_EVENT, onSave);
    window.addEventListener(SOLO_CLEAR_EVENT, onClear);
    // A tab closing / backgrounding mid-debounce: flush synchronously-ish.
    const onHide = () => {
      if (pushTimer.current) {
        clearTimeout(pushTimer.current);
        pushTimer.current = null;
        pushNow();
      }
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      window.removeEventListener(SOLO_SAVE_EVENT, onSave);
      window.removeEventListener(SOLO_CLEAR_EVENT, onClear);
      document.removeEventListener("visibilitychange", onHide);
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [user, pushNow]);

  return null;
}
