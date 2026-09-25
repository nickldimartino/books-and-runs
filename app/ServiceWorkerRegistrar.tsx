"use client";

// (The worker itself is generated per deploy from sw/sw.template.js by
// app/sw.js/route.ts — see that template's header for the caching design.)

import { useEffect } from "react";

export const SW_UPDATE_AVAILABLE_EVENT = "br:sw-update-available";

/**
 * Registers public/sw.js on every visit, signed in or not — the offline
 * shell caching it does is for anyone, not just push subscribers (that's a
 * separate, explicit opt-in — see app/lib/pushSubscriptions.ts and the
 * Settings page). Mounted once in the root layout; renders nothing (except,
 * indirectly, UpdateAvailableBanner — see below).
 *
 * Skipped entirely in dev (`next dev`): the whole point of the cache is to
 * survive a deploy's content-hashed filenames never changing underneath
 * it, which is exactly backwards during local development — every edit
 * changes what a URL should serve, and a previous session's cached
 * response silently shadowing the new one reads as "my change isn't
 * applying" (a `.next` cache clear or a hard reload doesn't fix it; the
 * cache lives in the browser's Cache Storage, not the dev server). Run
 * `npm run build && npx serve out` to actually exercise the SW locally.
 *
 * Also detects and surfaces new deploys — the thing a normal browser tab
 * gets for free from its own reload button, which a home-screen "Add to
 * Home Screen" install has no equivalent of. Two parts:
 *
 * 1. `registration.update()` on every `visibilitychange` back to visible —
 *    a home-screen install can sit backgrounded (not force-quit) for days
 *    without its process ever restarting, so nothing would otherwise
 *    prompt the browser to even check whether sw.js changed. Re-checking
 *    each time the app is foregrounded is the standalone-app equivalent of
 *    a browser tab's own "check on navigation" behavior.
 * 2. `navigator.serviceWorker.oncontrollerchange` fires once a newly
 *    installed worker actually takes over (sw.js already calls
 *    `skipWaiting()` + `clients.claim()`, so this happens automatically
 *    once `update()` above finds something newer — no postMessage
 *    handshake needed). The guard against firing on this page's *very
 *    first* activation (a brand new visitor has no meaningful "update" to
 *    announce) is `hadControllerAtMount`: `clients.claim()` also fires this
 *    same event the first time an until-then-uncontrolled page gets
 *    claimed, which would otherwise show "update available" to someone who
 *    just opened the app for the first time.
 *
 * SW_UPDATE_AVAILABLE_EVENT is a plain window event (same pattern as
 * accountSettingsSync's br:settings-synced) — UpdateAvailableBanner listens
 * for it and owns the actual UI; kept separate so this file stays pure
 * registration/detection plumbing.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;
    const hadControllerAtMount = !!navigator.serviceWorker.controller;

    function checkForUpdate() {
      if (document.visibilityState === "visible") registration?.update().catch(() => {});
    }

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        if (cancelled) return;
        registration = reg;
        document.addEventListener("visibilitychange", checkForUpdate);
      })
      .catch(() => {});

    let firstControllerChange = true;
    function onControllerChange() {
      // Skip the very first change on a page that loaded without a
      // controller at all — that's this visit's own initial claim, not a
      // newer version replacing an older one.
      if (firstControllerChange) {
        firstControllerChange = false;
        if (!hadControllerAtMount) return;
      }
      window.dispatchEvent(new Event(SW_UPDATE_AVAILABLE_EVENT));
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", checkForUpdate);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
  return null;
}
