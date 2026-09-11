"use client";

// Last-resort boundary: catches a crash in the ROOT layout itself (the
// providers — Auth/Game/PlayerLevel — or the layout render), where even
// app/error.tsx and the app's CSS aren't available. It has to bring its own
// <html>/<body>, so the styling is inline rather than the usual
// var(--heading)-style theme tokens (globals.css's [data-theme] rules never
// mount here — the root layout that imports that stylesheet is exactly what
// crashed). loadLocalTheme() reads the player's saved choice straight out of
// localStorage, and THEME_ERROR_COLORS (themeStore.ts) is the same palette
// every other theme already uses, just duplicated into plain JS so this
// screen can match it without any CSS in play.

import { useEffect, useState } from "react";
import { report } from "./lib/errorReporter";
import { DEFAULT_THEME, loadLocalTheme, THEME_ERROR_COLORS } from "./lib/themeStore";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // Starts at the default theme's colors (matches THEME_INIT_SCRIPT's own
  // fallback) so the very first paint is never unstyled, then corrects to
  // the saved choice — localStorage isn't readable during the initial
  // server-rendered pass, only once this client component actually mounts.
  const [themeId, setThemeId] = useState(DEFAULT_THEME);
  useEffect(() => {
    setThemeId(loadLocalTheme());
  }, []);
  const c = THEME_ERROR_COLORS[themeId];

  useEffect(() => {
    console.error("Global error boundary caught:", error);
    report({ message: error.message, stack: error.stack, source: "global-error" });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.25rem",
          padding: "0 1.5rem",
          textAlign: "center",
          background: c.bg,
          color: c.text,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <title>Books &amp; Runs hit a snag</title>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: c.heading, margin: 0 }}>
          Books &amp; Runs hit a snag
        </h1>
        <p style={{ fontSize: "0.875rem", color: c.muted, maxWidth: "22rem", margin: 0 }}>
          Something went wrong loading the app. Reloading usually fixes it.
        </p>
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => retry()}
            style={{
              border: "none",
              cursor: "pointer",
              borderRadius: "0.5rem",
              background: c.accent,
              color: c.onAccent,
              padding: "0.75rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
          {/* Raw <a>, not next/link: this renders when the root layout
              itself crashed, so the router/Link may not be usable — a full
              document load back to "/" is the reliable recovery. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              borderRadius: "0.5rem",
              border: `1px solid ${c.border}`,
              color: c.muted,
              padding: "0.75rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Reload
          </a>
        </div>
      </body>
    </html>
  );
}
