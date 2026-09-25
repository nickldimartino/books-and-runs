// Field Web Vitals (LCP / CLS / INP) → the anonymous `app_events` pipeline
// (analytics.ts). No `web-vitals` dependency: three PerformanceObservers is
// all it takes, and keeps ~2 KB of library out of every bundle.
//
// Privacy: consistent with analytics.ts — no user id, session id or IP; the
// row is "a page load on /friends had LCP≈2.4 s, CLS≈0.02, INP≈80 ms on a 4g
// connection". Values are bucketed (so they can't act as a fingerprint) and
// only ~1 in SAMPLE_RATE sessions report at all. One event per full page
// load, sent when the page is hidden/unloaded (the moment the numbers are
// final), never during play.

import { track } from "./analytics";

const SAMPLE_RATE = 5; // 1 in 5 sessions
const SAMPLE_KEY = "booksAndRuns:vitalsSample";

/** Round to a bucket so values can't uniquely identify a device/session. */
export function bucket(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Only ever the path — never the query string, which can carry ids/codes. */
export function normalizeRoute(pathname: string): string {
  const p = pathname.replace(/\/+$/, "");
  return p === "" ? "/" : p.slice(0, 48);
}

interface ShiftEntry {
  value: number;
  startTime: number;
  hadRecentInput: boolean;
}

/** CLS as the largest "session window" of shifts (≤1 s between shifts, window
 * ≤5 s long) — the definition Chrome/web.dev use, not the raw sum. */
export function computeCls(entries: ShiftEntry[]): number {
  let max = 0;
  let windowValue = 0;
  let windowStart = 0;
  let last = 0;
  for (const e of entries) {
    if (e.hadRecentInput) continue;
    if (windowValue > 0 && e.startTime - last < 1000 && e.startTime - windowStart < 5000) {
      windowValue += e.value;
    } else {
      windowValue = e.value;
      windowStart = e.startTime;
    }
    last = e.startTime;
    if (windowValue > max) max = windowValue;
  }
  return max;
}

/** INP ≈ the worst interaction latency (Chrome uses the 98th percentile once
 * a page has >50 interactions; below that it *is* the worst one). */
export function computeInp(durations: number[]): number | null {
  if (durations.length === 0) return null;
  const sorted = [...durations].sort((a, b) => b - a);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 50))];
}

function sampled(): boolean {
  try {
    const existing = sessionStorage.getItem(SAMPLE_KEY);
    if (existing !== null) return existing === "1";
    const pick = Math.floor(Math.random() * SAMPLE_RATE) === 0;
    sessionStorage.setItem(SAMPLE_KEY, pick ? "1" : "0");
    return pick;
  } catch {
    return false;
  }
}

let started = false;

/** Starts observing (once per page load). Safe to call anywhere on the client. */
export function initWebVitals(): void {
  if (started || typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;
  started = true;
  if (!sampled()) return;

  let lcp: number | null = null;
  const shifts: ShiftEntry[] = [];
  const interactions = new Map<number, number>(); // interactionId → worst duration

  function observe(type: string, cb: (entries: PerformanceEntryList) => void, opts: PerformanceObserverInit = {}) {
    try {
      const po = new PerformanceObserver((list) => cb(list.getEntries()));
      po.observe({ type, buffered: true, ...opts } as PerformanceObserverInit);
    } catch {
      /* metric unsupported in this browser */
    }
  }

  observe("largest-contentful-paint", (entries) => {
    const last = entries[entries.length - 1];
    if (last) lcp = last.startTime;
  });
  observe("layout-shift", (entries) => {
    for (const e of entries) {
      const s = e as unknown as ShiftEntry;
      shifts.push({ value: s.value, startTime: e.startTime, hadRecentInput: s.hadRecentInput });
    }
  });
  observe(
    "event",
    (entries) => {
      for (const e of entries) {
        const id = (e as unknown as { interactionId?: number }).interactionId;
        if (!id) continue;
        interactions.set(id, Math.max(interactions.get(id) ?? 0, e.duration));
      }
    },
    { durationThreshold: 40 } as PerformanceObserverInit
  );

  let sent = false;
  function send() {
    if (sent) return;
    sent = true;
    const inp = computeInp([...interactions.values()]);
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection?.effectiveType;
    const props: Record<string, string | number> = {
      route: normalizeRoute(location.pathname),
      cls: bucket(computeCls(shifts), 0.01),
      nav: nav?.type ?? "navigate",
      conn: conn ?? "unknown",
      v: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    };
    if (lcp !== null) props.lcp = bucket(lcp, 100);
    if (inp !== null) props.inp = bucket(inp, 10);
    if (nav) props.ttfb = bucket(nav.responseStart, 50);
    track("web_vitals", props);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") send();
  });
  window.addEventListener("pagehide", send);
}
