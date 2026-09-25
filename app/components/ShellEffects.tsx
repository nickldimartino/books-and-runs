"use client";

// Small app-shell behaviours that don't own any UI, mounted once in the root
// layout (inside AuthProvider): field Web Vitals, install-prompt capture,
// persistent-storage request, the app-icon badge, and connectivity toasts.
// Grouped so the layout stays a flat provider list and each of these stays a
// few lines instead of a component of its own.

import { useEffect } from "react";
import { useAuth } from "../AuthContext";
import { countPendingTurns, isBadgeSupported, setAppBadgeCount } from "../lib/appBadge";
import { captureInstallPrompt, GAME_COMPLETED_EVENT, requestPersistentStorage } from "../lib/installHint";
import { getMyMpGames } from "../lib/mpStore";
import { loadSupabase } from "../lib/supabaseClient";
import { dismissToast, toast } from "../lib/toastBus";
import { initWebVitals } from "../lib/webVitals";

// Module scope on purpose: `beforeinstallprompt` can fire before any effect
// runs, and a missed event can't be replayed.
if (typeof window !== "undefined") captureInstallPrompt();

export function ShellEffects() {
  const { user } = useAuth();

  // Web Vitals — after load, off the critical path.
  useEffect(() => {
    const start = () => initWebVitals();
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);

  // Ask the browser to keep this origin's storage (solo save, pending
  // progress queue…) at moments of commitment: signing in, finishing a game.
  useEffect(() => {
    if (user) void requestPersistentStorage();
    const onGame = () => void requestPersistentStorage();
    window.addEventListener(GAME_COMPLETED_EVENT, onGame);
    return () => window.removeEventListener(GAME_COMPLETED_EVENT, onGame);
  }, [user]);

  // App-icon badge = pending turns. Refreshed on load and whenever the app
  // returns to the foreground (push events only set a bare dot — sw.js).
  useEffect(() => {
    if (!isBadgeSupported()) return;
    if (!user) {
      void setAppBadgeCount(0);
      return;
    }
    let cancelled = false;
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const client = await loadSupabase();
        if (!client || cancelled) return;
        const games = await getMyMpGames(client);
        if (!cancelled) void setAppBadgeCount(countPendingTurns(games, user!.id));
      } catch {
        /* leave the badge as-is */
      }
    }
    const first = setTimeout(refresh, 3000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      clearTimeout(first);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user]);

  // Connectivity — only on a *change* (never on load), so a normal visit is silent.
  useEffect(() => {
    function onOffline() {
      toast({ id: "connectivity", key: "toast.offline", kind: "info", duration: 6000 });
    }
    function onOnline() {
      dismissToast("connectivity");
      toast({ id: "connectivity-back", key: "toast.backOnline", kind: "success", duration: 2500 });
    }
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
