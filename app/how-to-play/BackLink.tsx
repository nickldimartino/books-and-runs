"use client";

import Link from "next/link";
import { useGame } from "../GameContext";

// This page's metadata export needs a Server Component, so the "where does
// Back actually go" decision is split out into this small Client Component
// instead of converting the whole page. GameContext's `state` is non-null
// exactly while a game is actively loaded (set by startNewGame/
// startTutorialGame/continueGame, cleared by quitToHome) — including a game
// merely *saved* but not currently open (Home hasn't been used to Continue
// it yet) is still null here, so arriving from Home always goes back to
// Home, and arriving from an in-progress game always returns to it.
function useBackDestination(): { href: string; label: string } {
  const { state } = useGame();
  return state ? { href: "/game", label: "← Back to Game" } : { href: "/", label: "← Home" };
}

export function HowToPlayTopBackLink() {
  const { href, label } = useBackDestination();
  return (
    <Link
      href={href}
      className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
    >
      {label}
    </Link>
  );
}

export function HowToPlayBottomBackLink() {
  const { href, label } = useBackDestination();
  return (
    <Link href={href} className="text-sm text-[var(--faint)] hover:text-[var(--text)]">
      {label === "← Home" ? "Back to Home" : "Back to Game"}
    </Link>
  );
}
