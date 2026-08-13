"use client";

import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useState } from "react";

type SwState = "unsupported" | "native" | "none" | "installing" | "waiting" | "active";

interface PrecacheResult {
  url: string;
  ok: boolean;
  error?: string;
  assetCount?: number;
  assetFailures?: number;
}

interface PrecacheStatus {
  at: number;
  results: PrecacheResult[];
}

interface Status {
  swState: SwState;
  controlling: boolean;
  cachedUrls: string[];
  precache: PrecacheStatus | null;
}

async function readStatus(): Promise<Status> {
  if (Capacitor.isNativePlatform()) {
    return { swState: "native", controlling: false, cachedUrls: [], precache: null };
  }
  if (!("serviceWorker" in navigator)) {
    return { swState: "unsupported", controlling: false, cachedUrls: [], precache: null };
  }
  const registration = await navigator.serviceWorker.getRegistration();
  const swState: SwState = !registration
    ? "none"
    : registration.installing
      ? "installing"
      : registration.waiting
        ? "waiting"
        : registration.active
          ? "active"
          : "none";

  const cachedUrls: string[] = [];
  let precache: PrecacheStatus | null = null;
  if ("caches" in window) {
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) {
        cachedUrls.push(request.url);
      }
    }
    // Written by the service worker's own precache pass — see sw.js's
    // STATUS_URL — so this reports what actually happened on *this*
    // device, not just whether the file list looks plausible.
    const statusRes = await caches.match("/__sw-status__");
    if (statusRes) {
      try {
        precache = await statusRes.json();
      } catch {
        precache = null;
      }
    }
  }
  cachedUrls.sort();
  return { swState, controlling: !!navigator.serviceWorker.controller, cachedUrls, precache };
}

const LABELS: Record<SwState, string> = {
  unsupported: "Not supported in this browser",
  native: "Not used in the app",
  none: "Not set up yet — reload this page with a connection",
  installing: "Installing…",
  waiting: "Installed, waiting to activate — reload the page",
  active: "Active",
};

/**
 * Real, on-device visibility into the offline service worker's state — the
 * only reliable way to debug an offline report from someone's actual phone,
 * since this project's own browser-testing tools can't register a service
 * worker at all (a tooling limitation, not something about the app). A
 * "Refresh offline data" button gives a real recovery action no matter what
 * turns out to be wrong: wipes any existing registration/cache and starts
 * clean.
 */
export function OfflineStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    readStatus().then(setStatus);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleForceRefresh = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    setRefreshing(true);
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
    if ("caches" in window) {
      await Promise.all((await caches.keys()).map((name) => caches.delete(name)));
    }
    // Registering here even in dev would fight `next dev`'s hot reload the
    // same way ServiceWorkerRegister.tsx already avoids — this button
    // should only ever act on the real deployed site.
    if (process.env.NODE_ENV === "production") {
      await navigator.serviceWorker.register("/sw.js");
    }
    setRefreshing(false);
    refresh();
  }, [refresh]);

  if (!status || status.swState === "native") return null;

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-4">
      <label className="text-sm font-medium text-[var(--muted)]">Offline support</label>
      <p className="text-xs text-[var(--faint)]">
        Service worker: {LABELS[status.swState]}
        {status.swState === "active" && !status.controlling && " (not controlling this page — reload)"}
      </p>
      {status.swState !== "unsupported" && status.swState !== "none" && (
        <details className="text-xs text-[var(--faint)]">
          <summary className="cursor-pointer select-none">
            {status.cachedUrls.length} file{status.cachedUrls.length === 1 ? "" : "s"} cached for offline use
          </summary>
          <ul className="mt-1 max-h-40 overflow-y-auto rounded-md bg-[var(--panel-soft)] p-2 font-mono text-[10px] leading-relaxed">
            {status.cachedUrls.map((u) => (
              <li key={u} className="break-all">
                {u.replace(self.location.origin, "")}
              </li>
            ))}
          </ul>
        </details>
      )}
      {status.precache && (
        <details className="text-xs text-[var(--faint)]">
          <summary className="cursor-pointer select-none">
            Last precache attempt ({new Date(status.precache.at).toLocaleString()})
          </summary>
          <ul className="mt-1 flex flex-col gap-1 rounded-md bg-[var(--panel-soft)] p-2">
            {status.precache.results.map((r) => (
              <li key={r.url} className="break-all">
                {r.ok ? "✓" : "✗"} {r.url}
                {r.ok
                  ? ` — ${r.assetCount ?? 0} asset${r.assetCount === 1 ? "" : "s"}${
                      r.assetFailures ? `, ${r.assetFailures} failed` : ""
                    }`
                  : ` — ${r.error}`}
              </li>
            ))}
          </ul>
        </details>
      )}
      {status.swState !== "unsupported" && (
        <button
          onClick={handleForceRefresh}
          disabled={refreshing}
          className="mt-1 self-start rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh offline data"}
        </button>
      )}
    </section>
  );
}
