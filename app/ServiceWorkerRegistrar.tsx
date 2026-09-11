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
 *
 * Skipped entirely in dev (`next dev`): the whole point of the cache is to
 * survive a deploy's content-hashed filenames never changing underneath
 * it, which is exactly backwards during local development — every edit
 * changes what a URL should serve, and a previous session's cached
 * response silently shadowing the new one reads as "my change isn't
 * applying" (a `.next` cache clear or a hard reload doesn't fix it; the
 * cache lives in the browser's Cache Storage, not the dev server). Run
 * `npm run build && npx serve out` to actually exercise the SW locally.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
