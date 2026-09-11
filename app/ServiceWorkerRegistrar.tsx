"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js on every visit, signed in or not — the offline
 * shell caching it does is for anyone, not just push subscribers (that's a
 * separate, explicit opt-in — see app/lib/pushSubscriptions.ts and the
 * Settings page). Mounted once in the root layout; renders nothing.
 * Deliberately fire-and-forget — a failed registration (unsupported
 * browser, insecure context in local dev over plain http) just means no
 * offline caching this visit, nothing to show the player about it.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
