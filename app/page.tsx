"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { useGame } from "./GameContext";
import { DailyDealState, loadDailyDealState, mergeCloudDailyDealState, playedToday } from "./lib/dailyDealStore";
import { pullDailyDealStreak } from "./lib/leaderboardStore";
import { loadSavedGame } from "./lib/localSave";
import { supabase } from "./lib/supabaseClient";
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
  // Joined with a space, not a comma — "2 players vs. 2 AI opponents" reads
  // as one phrase; a comma there ("2 players, vs. 2 AI opponents") read like
  // two disconnected fragments instead of "these two groups facing off."
  return `Round ${state.round} of ${state.selectedContracts.length}${parts.length ? " · " + parts.join(" ") : ""}`;
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <rect x="2.5" y="11" width="3.5" height="6.5" rx="0.8" fill="currentColor" />
      <rect x="8.25" y="6.5" width="3.5" height="11" rx="0.8" fill="currentColor" />
      <rect x="14" y="2.5" width="3.5" height="15" rx="0.8" fill="currentColor" />
    </svg>
  );
}

function AchievementsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M10 1.7l2.57 5.22 5.76.84-4.17 4.06.98 5.74L10 14.8l-5.14 2.7.98-5.74-4.17-4.06 5.76-.84L10 1.7z"
        fill="currentColor"
      />
    </svg>
  );
}

function LeaderboardIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <rect x="2" y="10.5" width="4.5" height="7" rx="0.8" fill="currentColor" />
      <rect x="7.75" y="6" width="4.5" height="11.5" rx="0.8" fill="currentColor" />
      <rect x="13.5" y="12.5" width="4.5" height="5" rx="0.8" fill="currentColor" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProgressTile({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 rounded-lg border border-[var(--border)] px-2 py-3.5 text-center transition hover:bg-[var(--panel-soft)]"
    >
      <span className="text-[var(--accent)]">{children}</span>
      <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
    </Link>
  );
}

// Same "text link, not a bordered button" treatment for every row here —
// this whole section is deliberately the lowest tier of the page's visual
// hierarchy (see MoreSection's own doc), so nothing inside it should read
// as loudly as New Game, Continue, or the Daily Deal card above it.
function MoreLink({ href, onClick, children }: { href?: string; onClick?: () => void; children: ReactNode }) {
  const className = "rounded-md px-3 py-2.5 text-left text-sm text-[var(--muted)] hover:bg-[var(--panel-soft)]";
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={`w-full ${className}`}>
      {children}
    </button>
  );
}

/**
 * Everything that isn't a primary action or part of "your progress" —
 * How to Play, Settings, Account, Scorekeeper, History, and signing in/out.
 * Collapsed by default (native <details>, same disclosure pattern Settings
 * already uses for its own InfoDetails) rather than six more full-width
 * bordered buttons stacked under Stats/Achievements/Leaderboard: at that
 * visual weight, New Game — the one thing every visit to this page is
 * actually *for* — read as no more important than "Sign out."
 */
function MoreSection({
  configured,
  user,
  onSignOut,
}: {
  configured: boolean;
  user: boolean;
  onSignOut: () => void;
}) {
  return (
    <details className="group rounded-lg border border-[var(--border)]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-[var(--muted)] [&::-webkit-details-marker]:hidden">
        More
        <ChevronIcon className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-0.5 border-t border-[var(--border)] p-2">
        <MoreLink href="/how-to-play">How to Play</MoreLink>
        <MoreLink href="/settings">Settings</MoreLink>
        {configured && user && <MoreLink href="/account">Account</MoreLink>}
        <MoreLink href="/scorecard">Scorekeeper</MoreLink>
        <MoreLink href="/history">History of Books &amp; Runs</MoreLink>
        {configured && user ? (
          <MoreLink onClick={onSignOut}>Sign out</MoreLink>
        ) : (
          <MoreLink href="/sign-in">Sign in</MoreLink>
        )}
      </div>
    </details>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { configured, user, signOut } = useAuth();
  const { hasSavedGame, continueGame, startDailyDeal, state } = useGame();
  const { level } = usePlayerLevel();
  // Covers both Continue and Daily Deal — either one commits GameContext's
  // state synchronously, but navigating to /game immediately afterward isn't
  // guaranteed to see that update yet (see the effect below), so both wait
  // for `state` to actually show up here before navigating.
  const [navigatingToGame, setNavigatingToGame] = useState(false);
  const [savedSummary, setSavedSummary] = useState<string | null>(null);
  const [dailyDeal, setDailyDeal] = useState<DailyDealState | null>(null);

  // Re-reads on every hasSavedGame flip (a game starting, finishing, or
  // being quit) rather than once on mount, so this stays in sync with the
  // Continue button's own disabled state without a page reload.
  useEffect(() => {
    const saved = loadSavedGame();
    setSavedSummary(saved ? summarizeSavedGame(saved.state) : null);
  }, [hasSavedGame]);

  // Loaded once per visit to Home — this page fully remounts every time you
  // navigate back to it (including right after finishing a Daily Deal), so
  // a mount-only read is enough to pick up a just-recorded streak. The local
  // read shows immediately (no flash of "no streak" while signed in); the
  // cloud pull that follows is what actually makes this reflect every
  // device the account has played on, not just this one — see
  // dailyDealStore.ts's mergeCloudDailyDealState for why this is the fix
  // for Daily Deal not syncing across an iPhone/laptop/iPad.
  useEffect(() => {
    setDailyDeal(loadDailyDealState());
    if (!supabase || !user) return;
    pullDailyDealStreak(supabase, user.id)
      .then((cloud) => {
        if (cloud) setDailyDeal(mergeCloudDailyDealState(cloud));
      })
      .catch((err) => console.error("Failed to pull Daily Deal streak from cloud:", err));
  }, [user]);

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

  // continueGame()/startDailyDeal() set GameContext's state synchronously,
  // but navigating to /game immediately afterward isn't guaranteed to see
  // that update — /game bounces straight back here the instant it renders
  // with no state (see its own guard effect), so a real gap between the
  // state actually committing and the route's first render reads as "the
  // page flashed and stayed on Home." Waiting for `state` to actually show
  // up here before navigating closes that gap regardless of its exact cause.
  useEffect(() => {
    if (navigatingToGame && state) router.push("/game");
  }, [navigatingToGame, state, router]);

  function handleContinue() {
    continueGame();
    setNavigatingToGame(true);
  }

  function handleDailyDeal() {
    startDailyDeal();
    setNavigatingToGame(true);
  }

  const dailyDealPlayedToday = dailyDeal ? playedToday(dailyDeal) : false;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-10 text-center">
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

      <div className="flex w-full flex-col gap-5">
        {showTutorialPrompt && (
          <p className="rounded-lg bg-[var(--accent)]/10 px-3 py-2 text-left text-xs text-[var(--heading)]">
            <strong className="font-semibold">New here?</strong> On the New Game screen, pick{" "}
            <strong className="font-semibold">Tutorial</strong> for a short guided round that walks
            you through a real turn step by step.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Link
            href="/new-game"
            className="rounded-lg bg-[var(--accent)] px-6 py-3.5 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
          >
            New Game
          </Link>
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

        {/* Tinted rather than plain-bordered like the rest of the page — a
            visual notch below New Game's solid fill, but a clear notch above
            the plain nav buttons below it, matching how much attention a
            once-a-day hook actually deserves: more than "here's a settings
            page," less than the primary CTA. */}
        <section className="flex items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 text-left">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--heading)]">Daily Deal</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {dailyDeal && dailyDeal.streak > 0
                ? `🔥 ${dailyDeal.streak}-day streak`
                : "One seeded round — the same deal for everyone today."}
            </p>
            {dailyDealPlayedToday && (
              <p className="mt-0.5 text-[10px] text-[var(--faint)]">Streak protected for today.</p>
            )}
          </div>
          <button
            onClick={handleDailyDeal}
            className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
          >
            {dailyDealPlayedToday ? "Play again" : "Play today's deal"}
          </button>
        </section>

        <section className="grid grid-cols-3 gap-2">
          <ProgressTile href="/stats" label="Stats">
            <StatsIcon />
          </ProgressTile>
          <ProgressTile href="/achievements" label="Achievements">
            <AchievementsIcon />
          </ProgressTile>
          <ProgressTile href="/leaderboard" label="Leaderboard">
            <LeaderboardIcon />
          </ProgressTile>
        </section>

        <MoreSection configured={configured} user={!!user} onSignOut={signOut} />
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
