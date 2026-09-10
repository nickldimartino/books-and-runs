"use client";

// Home screen. The hero, the level badge (when signed in), the New Game
// button, the Daily Deal entry, and `<HomeGames>` — the unified "Your
// games" list that shows the local saved game (LOCAL tag), active
// multiplayer games (your-turn first, waiting-on-someone dimmed), and
// pending MP invites with inline Accept/Decline. Renders nothing if
// there's nothing to resume. The notification badge count comes from
// `useNotifications`.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { CardFanHero } from "./components/CardFanHero";
import { useGame } from "./GameContext";
import { DailyDealState, loadDailyDealState, mergeCloudDailyDealState, playedToday } from "./lib/dailyDealStore";
import { pullDailyDealStreak } from "./lib/leaderboardStore";
import { loadSavedGame } from "./lib/localSave";
import { loadSupabase, supabase } from "./lib/supabaseClient";
import { useNotifications } from "./lib/useNotifications";
import { MpGameSummary, respondToMpGame } from "./lib/mpStore";
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
  friendRequests,
  totalNotifications,
  onSignOut,
}: {
  configured: boolean;
  user: boolean;
  friendRequests: number;
  totalNotifications: number;
  onSignOut: () => void;
}) {
  return (
    <details className="group rounded-lg border border-[var(--border)]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-[var(--muted)] [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          More
          {totalNotifications > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold leading-none text-[var(--on-accent)]">
              {totalNotifications}
            </span>
          )}
        </span>
        <ChevronIcon className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-0.5 border-t border-[var(--border)] p-2">
        <MoreLink href="/how-to-play?from=home">How to Play</MoreLink>
        {configured && user && (
          <MoreLink href="/friends">
            <span className="flex items-center gap-2">
              Friends
              {friendRequests > 0 && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold leading-none text-[var(--on-accent)]">
                  {friendRequests}
                </span>
              )}
            </span>
          </MoreLink>
        )}
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

function opponentNames(g: MpGameSummary): string {
  return g.seats
    .filter((s) => s.seat !== g.your_seat)
    .map((s) => s.name)
    .join(", ");
}

/** Whole days since a timestamp, or null if under 2 (not worth showing). */
function daysStale(iso: string): number | null {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return Number.isFinite(d) && d >= 2 ? d : null;
}

function MpGameRow({ g, yourTurn, dimmed }: { g: MpGameSummary; yourTurn: boolean; dimmed: boolean }) {
  const turnName = g.seats.find((s) => s.seat === g.turn_seat)?.name;
  const stale = daysStale(g.updated_at);
  const chip =
    g.status === "pending"
      ? "Waiting to start"
      : yourTurn
        ? "Your turn"
        : `Waiting for ${turnName ?? "…"}`;
  return (
    <Link
      href={`/multiplayer/play?g=${g.game_id}`}
      className={`flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-left transition hover:bg-[var(--panel-soft)] ${
        dimmed ? "opacity-55 hover:opacity-100" : ""
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold text-[var(--heading)]">
          {opponentNames(g) || "Multiplayer game"}
        </span>
        <span className="block text-xs text-[var(--faint)]">
          Round {g.round} of {g.total_rounds}
          {stale != null && !yourTurn && (
            <span className={stale >= 14 ? "text-[var(--danger)]" : undefined}>
              {" · "}
              {stale >= 14 ? `no moves in ${stale} days` : `${stale}d`}
            </span>
          )}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
          yourTurn ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--panel-soft)] text-[var(--muted)]"
        }`}
      >
        {chip}
      </span>
    </Link>
  );
}

/**
 * The one place on Home to resume anything in progress: the local saved
 * game (tagged "Local"), every active multiplayer game (your-turn ones
 * first, waiting-on-someone ones dimmed below), and any pending game
 * invites with Accept / Decline inline. Renders nothing when there's
 * nothing to show.
 */
function HomeGames({
  hasSavedGame,
  savedSummary,
  onResumeLocal,
  notifications,
  userId,
}: {
  hasSavedGame: boolean;
  savedSummary: string | null;
  onResumeLocal: () => void;
  notifications: ReturnType<typeof useNotifications>;
  userId: string | undefined;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);

  const invites = notifications.mpGames.filter((g) => g.invite_status === "invited");
  const mine = notifications.mpGames.filter((g) => g.invite_status === "accepted");
  const yourTurn = mine.filter((g) => g.status === "active" && g.turn_user_id === userId);
  const waiting = mine.filter((g) => !(g.status === "active" && g.turn_user_id === userId));

  if (!hasSavedGame && invites.length === 0 && mine.length === 0) return null;

  async function respond(gameId: string, accept: boolean) {
    const client = await loadSupabase();
    if (!client) return;
    setBusyId(gameId);
    setRespondError(null);
    try {
      await respondToMpGame(client, gameId, accept);
      notifications.refresh();
    } catch {
      setRespondError("Couldn't respond — try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">Your games</h2>

      {respondError && <p className="text-xs text-[var(--danger)]">{respondError}</p>}

      {invites.map((g) => (
        <div key={g.game_id} className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4 text-left">
          <p className="text-sm font-medium text-[var(--heading)]">
            {opponentNames(g) || "Someone"} invited you
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {g.total_rounds === 7 ? "Full game" : `${g.total_rounds}-round game`}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => respond(g.game_id, true)}
              disabled={busyId === g.game_id}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              Accept
            </button>
            <button
              onClick={() => respond(g.game_id, false)}
              disabled={busyId === g.game_id}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      ))}

      {hasSavedGame && (
        <button
          onClick={onResumeLocal}
          className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-left transition hover:bg-[var(--panel-soft)]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--accent)]/15 text-[var(--accent)]">
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M6 4l9 6-9 6V4z" fill="currentColor" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-base font-semibold text-[var(--heading)]">
              Resume game
              <span className="rounded-full bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--faint)]">
                Local
              </span>
            </span>
            {savedSummary && (
              <span className="block truncate text-xs text-[var(--faint)]">{savedSummary}</span>
            )}
          </span>
        </button>
      )}

      {yourTurn.map((g) => (
        <MpGameRow key={g.game_id} g={g} yourTurn dimmed={false} />
      ))}
      {waiting.map((g) => (
        <MpGameRow key={g.game_id} g={g} yourTurn={false} dimmed />
      ))}
    </section>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { configured, user, signOut } = useAuth();
  const { hasSavedGame, continueGame, startDailyDeal, state } = useGame();
  const { level } = usePlayerLevel();
  const notifications = useNotifications();
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
        <CardFanHero />
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
          A free Contract Rummy card game — build books, complete runs, win with the lowest score.
          Play solo against five levels of AI, or pass-and-play on one device. Sign in to track
          stats and achievements across devices. No download.
        </p>
        {configured && user && (
          <p className="mt-3 text-xs text-[var(--faint)]">Signed in as {user.email}</p>
        )}
      </div>

      <div className="flex w-full flex-col gap-5">
        {showTutorialPrompt && (
          <p className="rounded-lg bg-[var(--accent)]/10 px-3 py-2 text-left text-xs text-[var(--heading)]">
            <strong className="font-semibold">New here?</strong> Tap New Game — there&apos;s a short
            guided tutorial that walks you through a real turn step by step.
          </p>
        )}

        <Link
          href="/new-game"
          className="rounded-lg bg-[var(--accent)] px-6 py-3.5 text-center text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
        >
          New Game
        </Link>

        <HomeGames
          hasSavedGame={hasSavedGame}
          savedSummary={savedSummary}
          onResumeLocal={handleContinue}
          notifications={notifications}
          userId={user?.id}
        />

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
          <ProgressTile href="/stats" label="Profile">
            <StatsIcon />
          </ProgressTile>
          <ProgressTile href="/achievements" label="Achievements">
            <AchievementsIcon />
          </ProgressTile>
          <ProgressTile href="/leaderboard" label="Leaderboard">
            <LeaderboardIcon />
          </ProgressTile>
        </section>

        <MoreSection
          configured={configured}
          user={!!user}
          friendRequests={notifications.friendRequests}
          totalNotifications={notifications.total}
          onSignOut={signOut}
        />
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
