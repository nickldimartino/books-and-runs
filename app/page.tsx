"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { useGame } from "./GameContext";
import { loadSavedGame } from "./lib/localSave";
import { usePlayerLevel } from "./PlayerLevelContext";
import { GameState } from "@/types";

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Round 3 of 7 · vs. Medium AI" — enough context to decide whether to jump
 * back in without needing to actually load the game first. Reads straight
 * from the raw saved state rather than GameContext (which only has a game
 * loaded once continueGame() has actually been called) — this needs to know
 * what's *there* before committing to resuming it. */
function summarizeSavedGame(state: GameState): string {
  const ais = state.players.filter((p) => p.isAI);
  const humanCount = state.players.length - ais.length;
  const parts: string[] = [];
  if (humanCount > 1) parts.push(`${humanCount} players`);
  if (ais.length === 1) parts.push(`vs. ${capitalize(ais[0].difficulty ?? "medium")} AI`);
  else if (ais.length > 1) parts.push(`vs. ${ais.length} AI opponents`);
  return `Round ${state.round} of ${state.selectedContracts.length}${parts.length ? " · " + parts.join(", ") : ""}`;
}

export default function HomePage() {
  const router = useRouter();
  const { configured, user, signOut } = useAuth();
  const { hasSavedGame, continueGame, state } = useGame();
  const { level } = usePlayerLevel();
  const [continuing, setContinuing] = useState(false);
  const [savedSummary, setSavedSummary] = useState<string | null>(null);

  // Re-reads on every hasSavedGame flip (a game starting, finishing, or
  // being quit) rather than once on mount, so this stays in sync with the
  // Continue button's own disabled state without a page reload.
  useEffect(() => {
    const saved = loadSavedGame();
    setSavedSummary(saved ? summarizeSavedGame(saved.state) : null);
  }, [hasSavedGame]);

  // A first-time nudge toward the Tutorial, shown only when there's nothing
  // else already pulling that role: no game in progress to resume, and (for
  // a signed-in account) no XP yet — the one signal available without a
  // dedicated fetch that "this account has never actually finished a game."
  // Left showing for a signed-out/guest visitor and for an unconfigured
  // deployment, since neither has any other way to tell "have I played
  // before" — mildly redundant for a returning guest, but never wrong for a
  // genuinely new one, which is the case this is actually for.
  const isNewAccount = !configured || !user || (level !== null && level.totalXp === 0);
  const showTutorialPrompt = !hasSavedGame && isNewAccount;

  // continueGame() sets GameContext's state synchronously, but navigating
  // to /game immediately afterward isn't guaranteed to see that update —
  // /game bounces straight back here the instant it renders with no state
  // (see its own guard effect), so a real gap between the state actually
  // committing and the route's first render reads as "the page flashed and
  // stayed on Home." Waiting for `state` to actually show up here before
  // navigating closes that gap regardless of its exact cause.
  useEffect(() => {
    if (continuing && state) router.push("/game");
  }, [continuing, state, router]);

  function handleContinue() {
    continueGame();
    setContinuing(true);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-10 px-6 text-center">
      <div>
        {configured && user && level && (
          <Link
            href="/stats"
            className="mb-3 inline-block rounded-full bg-[var(--accent)]/15 px-3 py-1 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/25"
            title={`${level.xpIntoLevel} / ${level.xpSpanForLevel} XP to level ${level.level + 1}`}
          >
            Level {level.level}
          </Link>
        )}
        <h1 className="text-4xl font-bold tracking-tight text-[var(--heading)]">Books &amp; Runs</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          A free Contract Rummy card game you play right in your browser — build books, complete
          runs, and win with the lowest score.
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Play solo against AI opponents of five difficulty levels, or pass-and-play with friends
          on one device. Sign in with email to track your stats and achievements across devices —
          no download required.
        </p>
        {configured && user && (
          <p className="mt-3 text-xs text-[var(--faint)]">Signed in as {user.email}</p>
        )}
      </div>

      <div className="flex w-full flex-col gap-6">
        {showTutorialPrompt && (
          <p className="rounded-lg bg-[var(--accent)]/10 px-3 py-2 text-left text-xs text-[var(--heading)]">
            <strong className="font-semibold">New here?</strong> On the New Game screen, pick{" "}
            <strong className="font-semibold">Tutorial</strong> for a short guided round that walks
            you through a real turn step by step.
          </p>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-left text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">Play</h2>
          <Link
            href="/new-game"
            className="rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
          >
            New Game
          </Link>
          <div className="flex flex-col gap-1">
            <button
              onClick={handleContinue}
              disabled={!hasSavedGame}
              className="w-full rounded-lg border border-[var(--border)] px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:cursor-not-allowed disabled:text-[var(--faint)] disabled:hover:bg-transparent"
              title={hasSavedGame ? undefined : "No game in progress"}
            >
              Continue Local Game
            </button>
            {savedSummary && <p className="text-center text-xs text-[var(--faint)]">{savedSummary}</p>}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-left text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
            Your progress
          </h2>
          <Link
            href="/stats"
            className="rounded-lg border border-[var(--border)] px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            Stats
          </Link>
          <Link
            href="/achievements"
            className="rounded-lg border border-[var(--border)] px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            Achievements
          </Link>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-left text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">More</h2>
          <Link
            href="/how-to-play"
            className="rounded-lg border border-[var(--border)] px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            How to Play
          </Link>
          <Link
            href="/settings"
            className="rounded-lg border border-[var(--border)] px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            Settings
          </Link>
          <Link
            href="/scorecard"
            className="rounded-lg border border-[var(--border)] px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            Scorekeeper
          </Link>
          <Link
            href="/history"
            className="rounded-lg border border-[var(--border)] px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            History of Books &amp; Runs
          </Link>
          {configured && user ? (
            <button
              onClick={() => signOut()}
              className="rounded-lg border border-[var(--border)] px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
            >
              Sign out
            </button>
          ) : (
            <Link
              href="/sign-in"
              className="rounded-lg border border-[var(--border)] px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
            >
              Sign in
            </Link>
          )}
        </section>
      </div>

      <p className="text-xs text-[var(--faint)]">
        <Link href="/privacy" className="underline hover:text-[var(--muted)]">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="underline hover:text-[var(--muted)]">
          Terms
        </Link>
      </p>
    </main>
  );
}
