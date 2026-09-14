"use client";

// Home screen. The hero, the level badge (when signed in), the New Game
// button, the Daily Deal entry, and `<HomeGames>` — the unified "Your
// games" list that shows the in-progress solo/pass-and-play game (tagged
// with its mode; synced to the account by LocalSaveSync), active
// multiplayer games (your-turn first, waiting-on-someone dimmed), and
// pending MP invites with inline Accept/Decline. Renders nothing if
// there's nothing to resume. The notification badge count comes from
// `useNotifications`.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { CardFanHero } from "./components/CardFanHero";
import { IntroSplash } from "./components/IntroSplash";
import { PageTip } from "./components/PageTip";
import { useGame } from "./GameContext";
import { DailyDealState, loadDailyDealState, mergeCloudDailyDealState, playedToday } from "./lib/dailyDealStore";
import {
  WeeklyChallengeState,
  loadWeeklyChallengeState,
  mergeCloudWeeklyChallengeState,
  playedThisWeek,
} from "./lib/weeklyChallengeStore";
import { playerProfileHref, pullDailyDealStreak, pullWeeklyChallengeStreak } from "./lib/leaderboardStore";
import { applyCloudSave, loadCloudSave, loadDailyDealSave, loadSavedGame, loadWeeklyChallengeSave } from "./lib/localSave";
import { loadSupabase, supabase } from "./lib/supabaseClient";
import { useNotifications } from "./lib/useNotifications";
import { MpGameSummary, respondToMpGame } from "./lib/mpStore";
import { usePlayerLevel } from "./PlayerLevelContext";
import { formatAchievementProgress } from "./lib/achievementFormat";
import { AchievementInstance, allAchievements, AchievementProgressState } from "@/achievements";
import { GameState } from "@/types";

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Round 3 of 7 · vs. Medium AI" — enough context to decide whether to jump
 * back in without needing to actually load the game first. Reads straight
 * from the raw saved state rather than GameContext (which only has a game
 * loaded once continueGame() has actually been called) — this needs to know
 * what's *there* before committing to resuming it. */
/** "Solo" (you vs AI) or "Pass & play" (2+ humans on one device) — shown on
 * the Resume card in place of the old "Local" tag now that the game syncs. */
function savedGameMode(state: GameState): string {
  const humanCount = state.players.filter((p) => !p.isAI).length;
  return humanCount > 1 ? "Pass & play" : "Solo";
}

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

function FriendsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <circle cx="7" cy="6.5" r="2.75" fill="currentColor" />
      <path d="M2 17a5 5 0 0 1 10 0" fill="currentColor" />
      <circle cx="14.5" cy="7.5" r="2.15" fill="currentColor" opacity="0.55" />
      <path d="M12.2 12a4.3 4.3 0 0 1 5.8 4" fill="currentColor" opacity="0.55" />
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

function ProgressTile({
  href,
  label,
  badge,
  children,
}: {
  href: string;
  label: string;
  /** A small corner count, e.g. pending friend requests — omitted (not 0)
   * when there's nothing to flag. */
  badge?: number;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="relative flex flex-col items-center gap-1.5 rounded-lg border border-[var(--border)] px-2 py-3.5 text-center transition hover:bg-[var(--panel-soft)]"
    >
      {!!badge && (
        <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold leading-none text-[var(--on-accent)]">
          {badge}
        </span>
      )}
      <span className="text-[var(--accent)]">{children}</span>
      {/* Fixed size across every tile (not shrunk per-label to fit) so
          "Achievements"/"Leaderboard" read the same weight as "Profile"/
          "Friends" — w-full lets the longer labels wrap onto a centered
          second line instead of crowding the tile's own padding. */}
      <span className="w-full px-0.5 text-center text-[11px] font-medium leading-tight text-[var(--muted)]">
        {label}
      </span>
    </Link>
  );
}

/** The single locked achievement the account is furthest along toward — the
 * one worth one more game to finish. Ignores anything not started (fraction
 * 0) so this never nudges toward something the player has shown no interest
 * in, and anything already at 100% waiting on a stat refresh. */
function closestAchievement(progress: AchievementProgressState | null): AchievementInstance | null {
  if (!progress) return null;
  return (
    allAchievements(progress)
      .filter((a) => !a.unlocked && a.progressFraction > 0 && a.progressFraction < 1)
      .sort((a, b) => b.progressFraction - a.progressFraction)[0] ?? null
  );
}

/** A compact "you're 80% of the way to Hard · Bookkeeper" card on Home,
 * linking into the Achievements page for the full picture. Rendered only
 * when signed in and there's a partly-finished achievement to point at. */
function ClosestAchievementCard({ achievement }: { achievement: AchievementInstance }) {
  const pct = Math.round(achievement.progressFraction * 100);
  return (
    <Link
      href="/achievements"
      className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-left transition hover:bg-[var(--panel-soft)]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)]">
          Closest achievement
        </p>
        <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">{pct}%</span>
      </div>
      <p className="mt-0.5 truncate text-sm font-semibold text-[var(--heading)]">
        {capitalize(achievement.tier)} · {achievement.familyTitle}
      </p>
      <p className="mt-0.5 text-xs text-[var(--faint)]">{formatAchievementProgress(achievement)}</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
      </div>
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

/** A small uppercase divider label inside MoreSection, grouping related
 * links so a now-8-item dropdown still scans in one glance instead of
 * reading as one undifferentiated list. */
function MoreGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-0.5 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)] first:pt-0.5">
      {children}
    </p>
  );
}

/**
 * Everything that isn't a primary action, "your progress" (Profile/
 * Achievements/Leaderboard/Friends, now their own tile row), or a play
 * mode — Clubs/Tournaments, Settings/Account/sign-out, and reference pages.
 * Collapsed by default (native <details>, same disclosure pattern Settings
 * already uses for its own InfoDetails) rather than more full-width
 * bordered buttons stacked under the tile row: at that visual weight,
 * New Game — the one thing every visit to this page is actually *for* —
 * read as no more important than "Sign out." Grouped into labeled
 * sub-sections (not just a flat list) now that it's carrying enough links
 * on its own to need that.
 */
function MoreSection({ configured, user, onSignOut }: { configured: boolean; user: boolean; onSignOut: () => void }) {
  return (
    <details className="group rounded-lg border border-[var(--border)]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-[var(--muted)] [&::-webkit-details-marker]:hidden">
        More
        <ChevronIcon className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-0.5 border-t border-[var(--border)] p-2">
        {configured && user && (
          <>
            <MoreGroupLabel>Play with friends</MoreGroupLabel>
            <MoreLink href="/clubs">Clubs</MoreLink>
            <MoreLink href="/tournaments">Tournaments</MoreLink>
          </>
        )}

        <MoreGroupLabel>Account</MoreGroupLabel>
        <MoreLink href="/settings">Settings</MoreLink>
        {configured && user && <MoreLink href="/account">Account</MoreLink>}
        {configured && user ? (
          <MoreLink onClick={onSignOut}>Sign out</MoreLink>
        ) : (
          <MoreLink href="/sign-in">Sign in</MoreLink>
        )}

        <MoreGroupLabel>Reference</MoreGroupLabel>
        <MoreLink href="/how-to-play?from=home">How to Play</MoreLink>
        <MoreLink href="/scorecard">Scorekeeper</MoreLink>
        <MoreLink href="/history">History of Books &amp; Runs</MoreLink>
      </div>
    </details>
  );
}

/**
 * A guest-only prompt, surfaced right on Home instead of one tap deep inside
 * "More" — signing in was previously only reachable via the collapsed More
 * menu, which read as an afterthought buried among Settings/History/
 * Scorekeeper rather than the one thing that unlocks stats, achievements,
 * the leaderboard, and playing with friends at all.
 */
function SignInPrompt() {
  return (
    <Link
      href="/sign-in"
      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 text-left transition hover:bg-[var(--accent)]/15"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--heading)]">Sign in to save your progress</span>
        <span className="mt-0.5 block text-xs text-[var(--muted)]">
          Track your level and achievements, climb the leaderboard, and play multiplayer with friends.
        </span>
      </span>
      <span className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)]">
        Sign in
      </span>
    </Link>
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
  savedMode,
  onResumeLocal,
  resuming,
  notifications,
  userId,
}: {
  hasSavedGame: boolean;
  savedSummary: string | null;
  savedMode: string | null;
  onResumeLocal: () => void;
  resuming: boolean;
  notifications: ReturnType<typeof useNotifications>;
  userId: string | undefined;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);

  const invites = notifications.mpGames.filter((g) => g.invite_status === "invited");
  const mine = notifications.mpGames.filter((g) => g.invite_status === "accepted");
  const yourTurn = mine.filter((g) => g.status === "active" && g.turn_user_id === userId);
  const waiting = mine.filter((g) => !(g.status === "active" && g.turn_user_id === userId));

  // Multiplayer games load async (notifications.loading) while hasSavedGame
  // is known synchronously — without this, a signed-in visitor with no
  // local save but real multiplayer games would see nothing here at all for
  // a beat, then have the whole section (header included) pop in once the
  // fetch resolves, shoving Daily Deal/Profile/Achievements/Leaderboard
  // down the page. A same-shaped skeleton row holds that space instead, so
  // the real rows fade into a layout that's already settled.
  if (notifications.loading && !hasSavedGame) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">Your games</h2>
        <div className="h-[60px] animate-pulse rounded-lg border border-[var(--border)] bg-[var(--panel)]" />
      </section>
    );
  }

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
          disabled={resuming}
          className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-left transition hover:bg-[var(--panel-soft)] disabled:opacity-60"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--accent)]/15 text-[var(--accent)]">
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M6 4l9 6-9 6V4z" fill="currentColor" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-base font-semibold text-[var(--heading)]">
              {resuming ? "Checking for the latest save…" : "Resume game"}
              {!resuming && savedMode && (
                <span className="rounded-full bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--faint)]">
                  {savedMode}
                </span>
              )}
            </span>
            {!resuming && savedSummary && (
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
  const {
    hasSavedGame,
    continueGame,
    startDailyDeal,
    continueDailyDeal,
    startWeeklyChallenge,
    continueWeeklyChallenge,
    state,
  } = useGame();
  const { level, progress, loading: levelLoading } = usePlayerLevel();
  const notifications = useNotifications();
  // Covers both Continue and Daily Deal — either one commits GameContext's
  // state synchronously, but navigating to /game immediately afterward isn't
  // guaranteed to see that update yet (see the effect below), so both wait
  // for `state` to actually show up here before navigating.
  const [navigatingToGame, setNavigatingToGame] = useState(false);
  const [checkingForNewerSave, setCheckingForNewerSave] = useState(false);
  const [savedSummary, setSavedSummary] = useState<string | null>(null);
  const [savedMode, setSavedMode] = useState<string | null>(null);
  const [dailyDeal, setDailyDeal] = useState<DailyDealState | null>(null);
  // Whether today's deal has an in-progress save to resume — see
  // GameContext.tsx's continueDailyDeal. Read once on mount, same as
  // `dailyDeal` above: this page fully remounts on every visit, and nothing
  // else on Home changes this mid-visit.
  const [hasDailyDealSave, setHasDailyDealSave] = useState(false);
  useEffect(() => {
    setHasDailyDealSave(loadDailyDealSave() !== null);
  }, []);
  const [weeklyChallenge, setWeeklyChallenge] = useState<WeeklyChallengeState | null>(null);
  // Same reasoning as hasDailyDealSave above, the Weekly Challenge's own slot.
  const [hasWeeklyChallengeSave, setHasWeeklyChallengeSave] = useState(false);
  useEffect(() => {
    setHasWeeklyChallengeSave(loadWeeklyChallengeSave() !== null);
  }, []);

  // Re-reads on every hasSavedGame flip (a game starting, finishing, or
  // being quit) rather than once on mount, so this stays in sync with the
  // Continue button's own disabled state without a page reload.
  useEffect(() => {
    const saved = loadSavedGame();
    setSavedSummary(saved ? summarizeSavedGame(saved.state) : null);
    setSavedMode(saved ? savedGameMode(saved.state) : null);
  }, [hasSavedGame]);

  // Loaded once per visit to Home — this page fully remounts every time you
  // navigate back to it (including right after finishing a Daily Deal), so
  // a mount-only read is enough to pick up a just-recorded streak. The local
  // read shows immediately (no flash of "no streak" while signed in); the
  // cloud pull that follows is what actually makes this reflect every
  // device the account has played on, not just this one — see
  // dailyDealStore.ts's mergeCloudDailyDealState for why this is the fix
  // for Daily Deal not syncing across an iPhone/laptop/iPad.
  //
  // Signed out, this deliberately never reads the local store at all: the
  // streak is tied to the signed-in account (see GameOverScreen.tsx's own
  // Daily Deal effect), not the device, so a guest — or whoever's holding
  // the device after someone else signed out of it — shouldn't see a
  // streak that isn't theirs.
  useEffect(() => {
    if (!supabase || !user) {
      setDailyDeal(null);
      return;
    }
    setDailyDeal(loadDailyDealState());
    pullDailyDealStreak(supabase, user.id)
      .then((cloud) => {
        if (cloud) setDailyDeal(mergeCloudDailyDealState(cloud));
      })
      .catch((err) => console.error("Failed to pull Daily Deal streak from cloud:", err));
  }, [user]);

  // Same shape as the Daily Deal effect above, for the Weekly Challenge.
  useEffect(() => {
    if (!supabase || !user) {
      setWeeklyChallenge(null);
      return;
    }
    setWeeklyChallenge(loadWeeklyChallengeState());
    pullWeeklyChallengeStreak(supabase, user.id)
      .then((cloud) => {
        if (cloud) setWeeklyChallenge(mergeCloudWeeklyChallengeState(cloud));
      })
      .catch((err) => console.error("Failed to pull Weekly Challenge streak from cloud:", err));
  }, [user]);

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

  // LocalSaveSync's own reconcile only ever runs once per sign-in and only
  // when nothing's loaded yet (see its own doc) — easy to lose the race
  // against a quick tap here right after opening the app, and it never
  // re-checks again for the rest of this session even if a *different*
  // device saves something newer in the meantime. Re-checking the cloud
  // right here, at the actual moment of resuming, is what makes two
  // devices signed into the same account reliably agree on which game is
  // current instead of each just trusting its own local cache.
  async function handleContinue() {
    if (supabase && user) {
      setCheckingForNewerSave(true);
      try {
        const cloud = await loadCloudSave(supabase, user.id);
        const local = loadSavedGame();
        if (cloud && (!local || cloud.savedAt > local.savedAt)) applyCloudSave(cloud);
      } catch (err) {
        console.error("Failed to check for a newer solo save before continuing:", err);
      }
      setCheckingForNewerSave(false);
    }
    continueGame();
    setNavigatingToGame(true);
  }

  function handleDailyDeal() {
    if (hasDailyDealSave) continueDailyDeal();
    else startDailyDeal();
    setNavigatingToGame(true);
  }

  function handleWeeklyChallenge() {
    if (hasWeeklyChallengeSave) continueWeeklyChallenge();
    else startWeeklyChallenge();
    setNavigatingToGame(true);
  }

  const dailyDealPlayedToday = dailyDeal ? playedToday(dailyDeal) : false;
  const weeklyChallengePlayedThisWeek = weeklyChallenge ? playedThisWeek(weeklyChallenge) : false;
  const closest = configured && user ? closestAchievement(progress) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-10 text-center">
      <IntroSplash />
      <div>
        <CardFanHero />
        {configured && user && level && (
          <Link
            href={playerProfileHref(user.id)}
            className="mb-3 inline-block rounded-full bg-[var(--accent)]/15 px-3 py-1 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/25"
            title={`${level.xpIntoLevel} / ${level.xpSpanForLevel} XP to level ${level.level + 1}`}
          >
            Level {level.level}
          </Link>
        )}
        <h1 className="text-4xl font-bold tracking-tight text-[var(--heading)]">Books &amp; Runs</h1>
        {configured && user && (
          <p className="mt-3 text-xs text-[var(--faint)]">Signed in as {user.email}</p>
        )}
      </div>

      <div className="flex w-full flex-col gap-5">
        <PageTip id="home" title="Welcome to Books & Runs">
          A free Contract Rummy card game — build books, complete runs, win with the lowest score.
          Tap New Game to jump in; there&apos;s a short guided tutorial your first time through a
          real turn. Sign in to track stats and achievements across devices.
        </PageTip>

        <Link
          href="/new-game"
          className="rounded-lg bg-[var(--accent)] px-6 py-3.5 text-center text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
        >
          New Game
        </Link>

        <HomeGames
          hasSavedGame={hasSavedGame}
          savedSummary={savedSummary}
          savedMode={savedMode}
          onResumeLocal={handleContinue}
          resuming={checkingForNewerSave}
          notifications={notifications}
          userId={user?.id}
        />

        {configured && !user && <SignInPrompt />}

        {/* Tinted rather than plain-bordered like the rest of the page — a
            visual notch below New Game's solid fill, but a clear notch above
            the plain nav buttons below it, matching how much attention a
            once-a-day hook actually deserves: more than "here's a settings
            page," less than the primary CTA. */}
        <section className="flex flex-col gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--heading)]">Daily Deal</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {!configured || !user
                ? "Sign in to keep a streak — anyone can still play today's deal."
                : dailyDeal && dailyDeal.streak > 0
                ? `🔥 ${dailyDeal.streak}-day streak`
                : "One seeded round — the same deal for everyone today."}
            </p>
            {dailyDealPlayedToday && (
              <p className="mt-0.5 text-[10px] text-[var(--faint)]">Streak protected for today.</p>
            )}
            {!dailyDealPlayedToday && hasDailyDealSave && (
              <p className="mt-0.5 text-[10px] text-[var(--faint)]">You left this one in progress.</p>
            )}
          </div>
          <button
            onClick={handleDailyDeal}
            className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
          >
            {dailyDealPlayedToday ? "Play again" : hasDailyDealSave ? "Continue today's deal" : "Play today's deal"}
          </button>
        </section>

        {/* Daily Deal's bigger, harder sibling — a rotating event beyond the
            quick daily round, same tinted-but-not-primary visual weight. */}
        <section className="flex flex-col gap-3 rounded-xl border border-[var(--highlight)]/40 bg-[var(--highlight)]/10 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--heading)]">Weekly Challenge</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {!configured || !user
                ? "Sign in to keep a streak — anyone can still play this week's challenge."
                : weeklyChallenge && weeklyChallenge.streak > 0
                ? `🏆 ${weeklyChallenge.streak}-week streak`
                : "The full 7-round game vs. 3 Hard AIs — the same table for everyone this week."}
            </p>
            {weeklyChallengePlayedThisWeek && (
              <p className="mt-0.5 text-[10px] text-[var(--faint)]">Streak protected for this week.</p>
            )}
            {!weeklyChallengePlayedThisWeek && hasWeeklyChallengeSave && (
              <p className="mt-0.5 text-[10px] text-[var(--faint)]">You left this one in progress.</p>
            )}
          </div>
          <button
            onClick={handleWeeklyChallenge}
            // --on-accent is only guaranteed to contrast against --accent
            // (what it's actually named for) — pairing it with --highlight
            // instead read fine in the dark Midnight theme but fell to
            // 3.94:1 against daylight's --highlight (#0284c7), under
            // WCAG AA's 4.5:1 floor for normal text (caught by the a11y
            // e2e suite). The card's border/wash above stays on
            // --highlight for the blue-vs-amber distinction from Daily
            // Deal; only the solid-fill button needed the safer pairing.
            className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
          >
            {weeklyChallengePlayedThisWeek
              ? "Play again"
              : hasWeeklyChallengeSave
                ? "Continue this week's challenge"
                : "Play this week's challenge"}
          </button>
        </section>

        <section className="grid grid-cols-4 gap-2">
          <ProgressTile href={user ? playerProfileHref(user.id) : "/player"} label="Profile">
            <StatsIcon />
          </ProgressTile>
          <ProgressTile href="/achievements" label="Achievements">
            <AchievementsIcon />
          </ProgressTile>
          <ProgressTile href="/leaderboard" label="Leaderboard">
            <LeaderboardIcon />
          </ProgressTile>
          <ProgressTile href="/friends" label="Friends" badge={notifications.friendRequests}>
            <FriendsIcon />
          </ProgressTile>
        </section>

        {configured && user && levelLoading ? (
          <div className="h-[72px] animate-pulse rounded-lg border border-[var(--border)] bg-[var(--panel)]" />
        ) : (
          closest && <ClosestAchievementCard achievement={closest} />
        )}

        <MoreSection configured={configured} user={!!user} onSignOut={signOut} />
      </div>

      <p className="text-xs text-[var(--faint)]">
        <Link href="/privacy" className="underline hover:text-[var(--muted)]">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="underline hover:text-[var(--muted)]">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/support" className="underline hover:text-[var(--muted)]">
          Contact
        </Link>
      </p>
    </main>
  );
}
