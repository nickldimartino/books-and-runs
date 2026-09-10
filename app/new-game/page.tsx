"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../AuthContext";
import { useGame } from "../GameContext";
import { markTutorialStarting } from "../lib/localSave";

export default function NewGamePage() {
  const router = useRouter();
  const { configured, user } = useAuth();
  const { startTutorialGame } = useGame();
  const [startingTutorial, setStartingTutorial] = useState(false);

  function startTutorial() {
    setStartingTutorial(true);
    markTutorialStarting();
    startTutorialGame();
    router.push("/game");
  }

  const canPlayWithFriends = configured && user;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-12">
      <Link
        href="/"
        className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Home
      </Link>

      <h1 className="text-2xl font-bold text-[var(--heading)]">New Game</h1>

      <div className="flex flex-col gap-3">
        <Link
          href="/new-game/local"
          className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 transition hover:bg-[var(--panel-soft)]"
        >
          <p className="text-base font-semibold text-[var(--heading)]">Solo &amp; pass-and-play</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Play now — against the AI, or hand the device around a table. One sitting, on this device.
          </p>
        </Link>

        {canPlayWithFriends ? (
          <Link
            href="/new-game/multiplayer"
            className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 transition hover:bg-[var(--panel-soft)]"
          >
            <p className="text-base font-semibold text-[var(--heading)]">With friends</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Turn-based online. Everyone plays from their own device, on their own time — take your
              turn, then it&apos;s theirs.
            </p>
          </Link>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-5">
            <p className="text-base font-semibold text-[var(--heading)]">With friends</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Turn-based online games with friends.{" "}
              <Link href="/sign-in" className="underline hover:text-[var(--heading)]">
                Sign in
              </Link>{" "}
              to play these.
            </p>
          </div>
        )}
      </div>

      <button
        onClick={startTutorial}
        disabled={startingTutorial}
        className="mt-2 self-start text-sm text-[var(--accent)] hover:underline disabled:opacity-50"
      >
        New here? Take the tutorial →
      </button>

      <p className="text-xs text-[var(--faint)]">
        The tutorial is a short guided round (you vs. one Beginner AI) walking through drawing,
        melding, and discarding. It doesn&apos;t count toward your stats.
      </p>
    </main>
  );
}
