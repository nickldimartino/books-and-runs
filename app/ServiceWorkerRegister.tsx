"use client";

import { Capacitor } from "@capacitor/core";
import { useEffect } from "react";

// Registers the offline-support service worker for the deployed website
// only. The native iOS app already bundles everything locally and doesn't
// go through a browser cache, so this would be redundant (and untested)
// there. Also skipped outside production so `next dev`'s hot reload isn't
// fighting a service worker serving stale cached assets.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (Capacitor.isNativePlatform()) return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  }, []);

  return null;
}
