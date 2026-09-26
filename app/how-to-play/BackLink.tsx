"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BackLink, useSmartBack } from "../components/BackLink";
import { useGame } from "../GameContext";
import { useT } from "../lib/i18n/LocaleProvider";

// This page's metadata export needs a Server Component, so the "where does
// Back actually go" decision is split out into this small Client Component
// instead of converting the whole page.
//
// Where Back goes is decided by where you *came from*, not just whether a
// game happens to be loaded: the entry points (the Home "More" list, the
// in-game header link, and the multiplayer header link) each tag their href
// with `?from=`. Arriving from Home returns to Home even mid-game; arriving
// from a solo game returns to that game; arriving from a multiplayer game
// returns to that specific game (`?g=<id>`, carried along since MP has no
// single "the game" the way solo does). GameContext's `state` is only a
// sanity guard for the solo case — if you somehow reach here with
// `?from=game` but no game is actually loaded, fall back to Home rather than
// bouncing to a /game route that would just redirect anyway. There's no
// equivalent cheap client-side check for a still-live MP game, so `?from=mp`
// just trusts the `g` id it's handed.
function useBackDestination(): { href: string; label: string; arrow: boolean } {
  const { t } = useT();
  const { state } = useGame();
  const [fromGame, setFromGame] = useState(false);
  const [mpGameId, setMpGameId] = useState<string | null>(null);

  useEffect(() => {
    // Read at runtime rather than via useSearchParams(), which needs a
    // Suspense boundary under static export — this page has no other reason
    // to add one.
    const params = new URLSearchParams(window.location.search);
    setFromGame(params.get("from") === "game");
    setMpGameId(params.get("from") === "mp" ? params.get("g") : null);
  }, []);

  // Not launched from a game: go back to wherever you came from (Profile →
  // Help & about, usually), Home when there is nothing better.
  const inGame = !!mpGameId || (fromGame && !!state);
  const smart = useSmartBack("/", !inGame);
  if (mpGameId) return { href: `/multiplayer/play?g=${mpGameId}`, label: t("howToPlay.backToGame"), arrow: false };
  return fromGame && state
    ? { href: "/game", label: t("howToPlay.backToGame"), arrow: false }
    : smart.href === "/"
      ? { href: "/", label: t("common.backToHome"), arrow: false }
      : { href: smart.href, label: t(smart.labelKey), arrow: true };
}

export function HowToPlayTopBackLink() {
  const { href, label } = useBackDestination();
  return <BackLink href={href} label={label} />;
}

export function HowToPlayBottomBackLink() {
  const { href, label, arrow } = useBackDestination();
  return (
    <Link href={href} className="text-sm text-[var(--faint)] hover:text-[var(--text)]">
      {arrow ? `← ${label}` : label}
    </Link>
  );
}
