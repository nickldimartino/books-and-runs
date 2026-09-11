"use client";

import { useEffect, useState } from "react";
import { SW_UPDATE_AVAILABLE_EVENT } from "./ServiceWorkerRegistrar";

/**
 * The visible affordance a home-screen install otherwise has no equivalent
 * of — a normal browser tab has its own reload button; a standalone PWA
 * window has none, so without this a new deploy is invisible until the app
 * happens to get a full relaunch. ServiceWorkerRegistrar does the actual
 * detection (re-checking for a new sw.js whenever the app is foregrounded)
 * and fires SW_UPDATE_AVAILABLE_EVENT once a new version has already taken
 * over in the background; this just renders the "tap to apply it" prompt.
 * Deliberately never auto-reloads — the new version is already in charge of
 * future network requests either way, so there's no harm in leaving this up
 * to the player to dismiss or act on whenever suits them (not mid-turn).
 */
export function UpdateAvailableBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onUpdate() {
      setVisible(true);
    }
    window.addEventListener(SW_UPDATE_AVAILABLE_EVENT, onUpdate);
    return () => window.removeEventListener(SW_UPDATE_AVAILABLE_EVENT, onUpdate);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex flex-col gap-2 bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] shadow-lg sm:flex-row sm:items-center sm:justify-between"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      <span>A new version of Books &amp; Runs is ready.</span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-[var(--on-accent)]/20 px-3 py-1 font-semibold hover:bg-[var(--on-accent)]/30"
        >
          Refresh
        </button>
        <button
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          className="rounded-full px-2 py-1 hover:bg-[var(--on-accent)]/20"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
