// Lightweight client-error capture — sends uncaught errors to the
// `client_errors` table (migration 0016) so production failures aren't
// invisible. Deliberately dependency-free: a raw fetch to PostgREST, not
// the Supabase SDK, so it works even when the SDK failed to load and adds
// nothing to the initial bundle's critical path.
//
// install() wires window.onerror / unhandledrejection once; the error
// boundaries (app/error.tsx, app/global-error.tsx) call report() directly.
// Everything is best-effort and never throws.

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

let currentUserId: string | null = null;
let installed = false;
const seen = new Set<string>(); // dedupe a message storm within a session
let sentThisSession = 0;
const MAX_PER_SESSION = 25;

/** AuthContext calls this so a report can be attributed (still fine as null). */
export function setErrorUser(id: string | null) {
  currentUserId = id;
}

interface ReportInput {
  message: string;
  stack?: string | null;
  source: string;
}

export function report({ message, stack, source }: ReportInput): void {
  try {
    if (!URL_BASE || !ANON_KEY || typeof fetch === "undefined") return;
    const msg = String(message ?? "").slice(0, 2000);
    if (!msg) return;

    const key = `${source}:${msg.slice(0, 200)}`;
    if (seen.has(key) || sentThisSession >= MAX_PER_SESSION) return;
    seen.add(key);
    sentThisSession += 1;

    const body = JSON.stringify({
      user_id: currentUserId,
      message: msg,
      stack: stack ? String(stack).slice(0, 6000) : null,
      source,
      url: typeof location !== "undefined" ? location.pathname + location.search : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 400) : null,
      app_version: APP_VERSION,
    });

    // keepalive so a report still goes out if the error is killing the page.
    fetch(`${URL_BASE}/rest/v1/client_errors`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        Prefer: "return=minimal",
      },
      body,
    }).catch(() => {});
  } catch {
    /* never let the reporter itself throw */
  }
}

/** Wires the global handlers. Idempotent; call once from a client boundary. */
export function installErrorReporter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    // Ignore ResizeObserver noise and cross-origin "Script error." with no detail.
    if (/ResizeObserver loop/i.test(e.message) || (e.message === "Script error." && !e.error)) return;
    report({
      message: e.message || "window.onerror",
      stack: e.error?.stack ?? `${e.filename}:${e.lineno}:${e.colno}`,
      source: "window.onerror",
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    report({
      message:
        (reason && (reason.message || String(reason))) || "unhandledrejection",
      stack: reason?.stack ?? null,
      source: "unhandledrejection",
    });
  });
}
