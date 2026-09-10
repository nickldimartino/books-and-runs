"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useGame } from "../GameContext";

// This page's metadata export needs a Server Component, so the "where does
// Back actually go" decision is split out into this small Client Component
// instead of converting the whole page.
//
// Where Back goes is decided by where you *came from*, not just whether a
// game happens to be loaded: the two entry points (the Home "More" list and
// the in-game header link) each tag their href with `?from=`. Arriving from
// Home returns to Home even mid-game; arriving from the game returns to the
// game. GameContext's `state` is only a sanity guard — if you somehow reach
// here with `?from=game` but no game is actually loaded, fall back to Home
// rather than bouncing to a /game route that would just redirect anyway.
function useBackDestination(): { href: string; label: string } {
  const { state } = useGame();
  const [fromGame, setFromGame] = useState(false);

  useEffect(() => {
    // Read at runtime rather than via useSearchParams(), which needs a
    // Suspense boundary under static export — this page has no other reason
    // to add one.
    setFromGame(new URLSearchParams(window.location.search).get("from") === "game");
  }, []);

  return fromGame && state
    ? { href: "/game", label: "Game" }
    : { href: "/", label: "Home" };
}

export function HowToPlayTopBackLink() {
  const { href, label } = useBackDestination();
  return (
    <Link
      href={href}
      className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
    >
      ← Back to {label}
    </Link>
  );
}

export function HowToPlayBottomBackLink() {
  const { href, label } = useBackDestination();
  return (
    <Link href={href} className="text-sm text-[var(--faint)] hover:text-[var(--text)]">
      Back to {label}
    </Link>
  );
}
