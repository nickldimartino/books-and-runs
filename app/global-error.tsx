"use client";

// Last-resort boundary: catches a crash in the ROOT layout itself (the
// providers — Auth/Game/PlayerLevel — or the layout render), where even
// app/error.tsx and the app's CSS aren't available. It has to bring its own
// <html>/<body>, so the styling is inline and uses the Midnight palette
// literally (globals.css isn't loaded at this point).

import { useEffect } from "react";
import { report } from "./lib/errorReporter";

const BG = "#0a2b20";
const HEADING = "#fef3c7";
const TEXT = "#f5f0e6";
const MUTED = "rgba(209, 250, 229, 0.78)";
const ACCENT = "#fbbf24";
const ON_ACCENT = "#022c22";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
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
          background: BG,
          color: TEXT,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <title>Books &amp; Runs hit a snag</title>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: HEADING, margin: 0 }}>
          Books &amp; Runs hit a snag
        </h1>
        <p style={{ fontSize: "0.875rem", color: MUTED, maxWidth: "22rem", margin: 0 }}>
          Something went wrong loading the app. Reloading usually fixes it.
        </p>
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => retry()}
            style={{
              border: "none",
              cursor: "pointer",
              borderRadius: "0.5rem",
              background: ACCENT,
              color: ON_ACCENT,
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
              border: `1px solid ${MUTED}`,
              color: MUTED,
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
