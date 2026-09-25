"use client";

import { useEffect } from "react";
import { SW_UPDATE_AVAILABLE_EVENT } from "./ServiceWorkerRegistrar";
import { toast } from "./lib/toastBus";

/**
 * The visible affordance a home-screen install otherwise has no equivalent
 * of — a normal browser tab has its own reload button; a standalone PWA
 * window has none, so without this a new deploy is invisible until the app
 * happens to get a full relaunch. ServiceWorkerRegistrar does the actual
 * detection (re-checking for a new sw.js whenever the app is foregrounded)
 * and fires SW_UPDATE_AVAILABLE_EVENT once a new version has already taken
 * over in the background; this turns that into a sticky toast (the shared
 * ToastHost — toastBus.ts) with a "Refresh" action.
 * Deliberately never auto-reloads — the new version is already in charge of
 * future network requests either way, so there's no harm in leaving this up
 * to the player to dismiss or act on whenever suits them (not mid-turn).
 */
export function UpdateAvailableBanner() {
  useEffect(() => {
    function onUpdate() {
      toast({
        id: "sw-update",
        key: "update.newVersion",
        kind: "info",
        duration: 0,
        action: { labelKey: "update.refresh", onClick: () => window.location.reload() },
      });
    }
    window.addEventListener(SW_UPDATE_AVAILABLE_EVENT, onUpdate);
    return () => window.removeEventListener(SW_UPDATE_AVAILABLE_EVENT, onUpdate);
  }, []);

  return null;
}
