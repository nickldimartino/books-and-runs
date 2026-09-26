"use client";

// The top of Home: ONE primary Play button, chosen by what's most useful right
// now, plus a secondary "New Game" when the primary isn't that.
//
//   1. Continue   — the in-progress solo / pass-and-play save, else the
//                   multiplayer game that's waiting on you
//   2. Quick Deal — re-deals the saved "my usual" lineup (favoriteGameConfig,
//                   set from the New Game form); only once a first game has
//                   been started, and only with nothing in progress (dealing
//                   would replace the save)
//   3. New Game
//
// The block has a fixed height in every state (button row + one caption
// line) and the secondary sits beside the primary, not under it — so the
// choice settling after hydration (localStorage / the favorite lineup) only
// changes labels, never moves the page. Quick Deal mirrors the setup page's
// own handlePlayFavorite, including seat 0 taking the account's *current*
// display name, so the two entry points can't drift.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../../AuthContext";
import { useGame } from "../../GameContext";
import {
  contractsFor,
  describeFavoriteGameConfig,
  FavoriteGameConfig,
  loadFavoriteGameConfigWithCloud,
  playerConfigsFor,
} from "../../lib/favoriteGameConfig";
import { useT } from "../../lib/i18n/LocaleProvider";
import { fetchOwnDisplayName } from "../../lib/leaderboardStore";
import type { MpGameSummary } from "../../lib/mpStore";
import { supabase } from "../../lib/supabaseClient";
import { opponentNames } from "./HomeGames";

const PRIMARY =
  "flex h-14 min-w-0 flex-1 items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-center text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)] disabled:opacity-60";
const SECONDARY =
  "flex h-14 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-center text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--panel-soft)]";

export function PlayZone({
  hasSavedGame,
  savedSummary,
  savedMode,
  resuming,
  onContinue,
  waitingGame,
  isFirstSession,
  onStarted,
}: {
  hasSavedGame: boolean;
  savedSummary: string | null;
  savedMode: string | null;
  /** Checking the cloud for a newer save before resuming. */
  resuming: boolean;
  onContinue: () => void;
  /** An active multiplayer game where it's your turn, if any. */
  waitingGame: MpGameSummary | null;
  isFirstSession: boolean;
  onStarted: () => void;
}) {
  const { t, tPlural } = useT();
  const { user } = useAuth();
  const { startNewGame } = useGame();
  const [favorite, setFavorite] = useState<FavoriteGameConfig | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadFavoriteGameConfigWithCloud(supabase, user?.id ?? null).then((f) => {
      if (!cancelled) setFavorite(f);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function quickDeal(cfg: FavoriteGameConfig) {
    setBusy(true);
    let humanNames = cfg.humanNames;
    if (supabase && user) {
      try {
        const name = (await fetchOwnDisplayName(supabase, user.id))?.trim();
        humanNames = [name || t("newGame.you"), ...humanNames.slice(1)];
      } catch {
        /* keep the saved name */
      }
    }
    const configs = playerConfigsFor(humanNames.slice(0, cfg.humanCount), cfg.aiDifficulties);
    startNewGame(configs, contractsFor(cfg.roundMode, cfg.customRounds), true);
    onStarted();
  }

  let primary: React.ReactNode;
  let caption: string;
  let secondary = true;

  if (hasSavedGame) {
    primary = (
      <button onClick={onContinue} disabled={resuming} className={PRIMARY} data-testid="play-primary">
        {t("home.play.continue")}
      </button>
    );
    caption = resuming
      ? t("home.checkingForSave")
      : [savedMode, savedSummary].filter(Boolean).join(" · ") || t("home.resumeGame");
  } else if (waitingGame) {
    primary = (
      <Link href={`/multiplayer/play?g=${waitingGame.game_id}`} className={PRIMARY} data-testid="play-primary">
        {t("home.play.continue")}
      </Link>
    );
    caption = `${opponentNames(waitingGame) || t("home.multiplayerGame")} · ${t("home.yourTurn")}`;
  } else if (favorite && !isFirstSession) {
    primary = (
      <button onClick={() => quickDeal(favorite)} disabled={busy} className={PRIMARY} data-testid="play-primary">
        {t("newGame.quickDeal")}
      </button>
    );
    caption = describeFavoriteGameConfig(favorite, t, tPlural);
  } else {
    secondary = false;
    primary = (
      <Link href="/new-game" className={PRIMARY} data-testid="play-primary">
        {t("home.newGame")}
      </Link>
    );
    caption = t("home.play.newGameHint");
  }

  return (
    <section aria-label={t("nav.play")} className="flex w-full flex-col gap-2 text-left" data-testid="play-zone">
      <div className="flex gap-2">
        {primary}
        {secondary && (
          <Link href="/new-game" className={SECONDARY}>
            {t("home.newGame")}
          </Link>
        )}
      </div>
      <p className="h-4 truncate text-center text-xs text-[var(--faint)]">{caption}</p>
    </section>
  );
}
