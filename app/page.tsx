"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import { useGame } from "./GameContext";

export default function HomePage() {
  const router = useRouter();
  const { configured, user, signOut } = useAuth();
  const { hasSavedGame, continueGame } = useGame();

  function handleContinue() {
    continueGame();
    router.push("/game");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-10 px-6 text-center">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-amber-100">Books &amp; Runs</h1>
        <p className="mt-2 text-sm text-emerald-100/70">
          Local pass-and-play, seven rounds, wild twos and jokers.
        </p>
        {configured && user && (
          <p className="mt-3 text-xs text-emerald-100/50">Signed in as {user.email}</p>
        )}
      </div>

      <div className="flex w-full flex-col gap-3">
        <Link
          href="/new-game"
          className="rounded-lg bg-amber-400 px-6 py-3 text-base font-semibold text-emerald-950 shadow-lg transition hover:bg-amber-300"
        >
          New Game
        </Link>
        <button
          onClick={handleContinue}
          disabled={!hasSavedGame}
          className="rounded-lg border border-emerald-100/20 px-6 py-3 text-base font-medium text-emerald-100/80 hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:text-emerald-100/40 disabled:hover:bg-transparent"
          title={hasSavedGame ? undefined : "No game in progress"}
        >
          Continue
        </button>
        <Link
          href="/stats"
          className="rounded-lg border border-emerald-100/20 px-6 py-3 text-base font-medium text-emerald-100/80 hover:bg-emerald-900/40"
        >
          Stats
        </Link>
        <Link
          href="/settings"
          className="rounded-lg border border-emerald-100/20 px-6 py-3 text-base font-medium text-emerald-100/80 hover:bg-emerald-900/40"
        >
          Settings
        </Link>
        {configured && user ? (
          <button
            onClick={() => signOut()}
            className="rounded-lg border border-emerald-100/20 px-6 py-3 text-base font-medium text-emerald-100/80 hover:bg-emerald-900/40"
          >
            Sign out
          </button>
        ) : (
          <Link
            href="/sign-in"
            className="rounded-lg border border-emerald-100/20 px-6 py-3 text-base font-medium text-emerald-100/80 hover:bg-emerald-900/40"
          >
            Sign in
          </Link>
        )}
      </div>

      <p className="text-xs text-emerald-100/30">
        <Link href="/privacy" className="underline hover:text-emerald-100/60">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="underline hover:text-emerald-100/60">
          Terms
        </Link>
      </p>
    </main>
  );
}
