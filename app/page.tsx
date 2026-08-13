"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import { useGame } from "./GameContext";
import { usePlayerLevel } from "./PlayerLevelContext";

export default function HomePage() {
  const router = useRouter();
  const { configured, user, signOut } = useAuth();
  const { hasSavedGame, continueGame } = useGame();
  const { level } = usePlayerLevel();

  function handleContinue() {
    continueGame();
    router.push("/game");
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

      <div className="flex w-full flex-col gap-3">
        <Link
          href="/new-game"
          className="rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
        >
          New Game
        </Link>
        <button
          onClick={handleContinue}
          disabled={!hasSavedGame}
          className="rounded-lg border border-[var(--border)] px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:cursor-not-allowed disabled:text-[var(--faint)] disabled:hover:bg-transparent"
          title={hasSavedGame ? undefined : "No game in progress"}
        >
          Continue Local Game
        </button>
        <Link
          href="/how-to-play"
          className="rounded-lg border border-[var(--border)] px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          How to Play
        </Link>
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
          In-Person Scorecard
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
