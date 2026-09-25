"use client";

// The New Game fork screen. Three choices: "Solo & pass-and-play" →
// /new-game/local, "With friends" → /new-game/multiplayer (or a sign-in
// prompt when not configured/signed in), and a "take the tutorial" button
// that flags the tutorial as starting and jumps to /game. Deliberately the
// single New Game entry point — the old separate multiplayer hub is gone.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { BackLink } from "../components/BackLink";
import { PageTip } from "../components/PageTip";
import { useGame } from "../GameContext";
import { useT } from "../lib/i18n/LocaleProvider";
import { fetchOwnDisplayName } from "../lib/leaderboardStore";
import { markTutorialStarting } from "../lib/localSave";
import { hasStartedAGame } from "../lib/firstSessionStore";
import { supabase } from "../lib/supabaseClient";
import {
  contractsFor,
  describeFavoriteGameConfig,
  FavoriteGameConfig,
  loadFavoriteGameConfigWithCloud,
  playerConfigsFor,
} from "../lib/favoriteGameConfig";

export default function NewGamePage() {
  const router = useRouter();
  const { t, tPlural } = useT();
  const { configured, user } = useAuth();
  const { startTutorialGame, startNewGame } = useGame();
  const [startingTutorial, setStartingTutorial] = useState(false);
  const [favorite, setFavorite] = useState<FavoriteGameConfig | null>(null);
  // See app/new-game/local/page.tsx's own doc — seat 0 always plays under
  // the account's current display name, not whatever was saved into the
  // favorite lineup.
  const [accountDisplayName, setAccountDisplayName] = useState<string | null>(null);
  // Promotes the tutorial from a text link at the bottom to a real,
  // accent-highlighted card up top for a session that's never played a
  // single turn — found during a UX audit as the single most-buried
  // feature on this screen despite being the most useful one for exactly
  // this visitor. Read in an effect so first paint matches the server's
  // "nothing yet" (same reasoning as PageTip.tsx). Once any game starts,
  // firstSessionStore flips this for good — a returning player gets the
  // original understated link back, not a permanent promoted card.
  const [isFirstSession, setIsFirstSession] = useState(false);
  useEffect(() => {
    setIsFirstSession(!hasStartedAGame());
  }, []);

  useEffect(() => {
    loadFavoriteGameConfigWithCloud(supabase, user?.id ?? null).then(setFavorite);
    if (supabase && user) {
      fetchOwnDisplayName(supabase, user.id)
        .then(setAccountDisplayName)
        .catch((err) => console.error("Failed to load your display name:", err));
    }
  }, [user]);

  function startTutorial() {
    setStartingTutorial(true);
    markTutorialStarting();
    startTutorialGame();
    router.push("/game");
  }

  // What "Play my usual" actually shows and deals — the saved config with
  // seat 0's name overridden by the account's *current* display name, so
  // the card can never show (or deal) a stale name after it's changed on
  // the Account page. Computed once and reused for both the description
  // and the deal itself.
  const yourNameLocked = !!(configured && user);
  const yourName = accountDisplayName?.trim() || t("newGame.you");
  const favoriteForDisplay: FavoriteGameConfig | null =
    favorite && yourNameLocked ? { ...favorite, humanNames: [yourName, ...favorite.humanNames.slice(1)] } : favorite;

  function playFavorite() {
    if (!favoriteForDisplay) return;
    const configs = playerConfigsFor(
      favoriteForDisplay.humanNames.slice(0, favoriteForDisplay.humanCount),
      favoriteForDisplay.aiDifficulties
    );
    startNewGame(configs, contractsFor(favoriteForDisplay.roundMode, favoriteForDisplay.customRounds), true);
    router.push("/game");
  }

  const canPlayWithFriends = configured && user;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-12">
      <BackLink href="/" />

      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("newGame.title")}</h1>

      <PageTip id="new-game" title={t("newGame.tip.title")}>
        {t("newGame.tip.body")}
      </PageTip>

      <div className="flex flex-col gap-3">
        {isFirstSession && (
          <div className="rounded-xl border border-[var(--accent)]/50 bg-[var(--accent)]/10 p-5">
            <p className="text-base font-semibold text-[var(--heading)]">{t("newGame.startWithTutorial")}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("newGame.tutorialBlurb")}</p>
            <button
              onClick={startTutorial}
              disabled={startingTutorial}
              className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {startingTutorial ? t("newGame.starting") : t("newGame.startTutorial")}
            </button>
          </div>
        )}

        {favoriteForDisplay && (
          <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-5">
            <p className="text-base font-semibold text-[var(--heading)]">{t("newGame.quickDeal")}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {describeFavoriteGameConfig(favoriteForDisplay, t, tPlural)}
            </p>
            <button
              onClick={playFavorite}
              className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
            >
              {t("newGame.dealIt")}
            </button>
          </div>
        )}

        <Link
          href="/new-game/local"
          className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 transition hover:bg-[var(--panel-soft)]"
        >
          <p className="text-base font-semibold text-[var(--heading)]">{t("newGame.soloAndPassAndPlay")}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("newGame.soloAndPassAndPlayBody")}</p>
        </Link>

        {canPlayWithFriends ? (
          <Link
            href="/new-game/multiplayer"
            className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 transition hover:bg-[var(--panel-soft)]"
          >
            <p className="text-base font-semibold text-[var(--heading)]">{t("newGame.withFriends")}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("newGame.withFriendsBody")}</p>
          </Link>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-5">
            <p className="text-base font-semibold text-[var(--heading)]">{t("newGame.withFriends")}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t("newGame.withFriendsSignedOut")}{" "}
              <Link href="/sign-in" className="underline hover:text-[var(--heading)]">
                {t("signIn.title")}
              </Link>{" "}
              {t("newGame.toPlayThese")}
            </p>
          </div>
        )}
      </div>

      {!isFirstSession && (
        <>
          <button
            onClick={startTutorial}
            disabled={startingTutorial}
            className="mt-2 self-start text-sm text-[var(--accent)] hover:underline disabled:opacity-50"
          >
            {t("newGame.takeTheTutorial")}
          </button>

          <p className="text-xs text-[var(--faint)]">{t("newGame.tutorialBlurbShort")}</p>
        </>
      )}
    </main>
  );
}
