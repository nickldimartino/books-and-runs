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
import { ReactNode, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { CardFanHero } from "./components/CardFanHero";
import { IntroSplash } from "./components/IntroSplash";
import { PageTip } from "./components/PageTip";
import { HomeIdentity } from "./components/home/HomeIdentity";
import { QuestsCard } from "./components/home/QuestsCard";
import { QuickPlayCard } from "./components/home/QuickPlayCard";
import { QuestToast } from "./components/home/QuestToast";
import { WelcomeBackCard } from "./components/home/WelcomeBackCard";
import { WelcomeOnboarding } from "./components/WelcomeOnboarding";
import { formatRemaining, timerState } from "@/mp/turnTimer";
import { useGame } from "./GameContext";
import { useT } from "./lib/i18n/LocaleProvider";
import type { TranslationKey } from "./lib/i18n/keys";
import {
  DailyDealState,
  loadDailyDealState,
  localDateKey,
  mergeCloudDailyDealState,
  playedToday,
} from "./lib/dailyDealStore";
import { useQuests } from "./lib/useQuests";
import { isReturningAfterAbsence, readLastHomeVisit, touchHomeVisit } from "./lib/welcomeBackStore";
import { loadPendingSessionCounters, withSessionCounters } from "./lib/pendingProgress";
import { clearJustSignedUp, hasJustSignedUp } from "./lib/onboardingStore";
import {
  WeeklyChallengeState,
  loadWeeklyChallengeState,
  mergeCloudWeeklyChallengeState,
  playedThisWeek,
} from "./lib/weeklyChallengeStore";
import { playerProfileHref, pullDailyDealStreak, pullWeeklyChallengeStreak } from "./lib/leaderboardStore";
import { applyCloudSave, loadCloudSave, loadDailyDealSave, loadSavedGame, loadWeeklyChallengeSave } from "./lib/localSave";
import { loadSupabase, supabase } from "./lib/supabaseClient";
import { capitalize } from "./lib/text";
import { useNotifications } from "./lib/useNotifications";
import { hasStartedAGame } from "./lib/firstSessionStore";
import { MpGameSummary, respondToMpGame } from "./lib/mpStore";
import { usePlayerLevel } from "./PlayerLevelContext";
import { formatAchievementProgress } from "./lib/achievementFormat";
import { AchievementInstance, allAchievements, AchievementProgressState } from "@/achievements";
import { GameState } from "@/types";

/** "Round 3 of 7 · vs. Medium AI" — enough context to decide whether to jump
 * back in without needing to actually load the game first. Reads straight
 * from the raw saved state rather than GameContext (which only has a game
 * loaded once continueGame() has actually been called) — this needs to know
 * what's *there* before committing to resuming it. */
/** "Solo" (you vs AI) or "Pass & play" (2+ humans on one device) — shown on
 * the Resume card in place of the old "Local" tag now that the game syncs. */
type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;
type TPlural = (key: string, count: number, vars?: Record<string, string | number>) => string;

function savedGameMode(state: GameState, t: T): string {
  const humanCount = state.players.filter((p) => !p.isAI).length;
  return humanCount > 1 ? t("home.passAndPlay") : t("home.solo");
}

function summarizeSavedGame(state: GameState, t: T, tPlural: TPlural): string {
  const ais = state.players.filter((p) => p.isAI);
  const humanCount = state.players.length - ais.length;
  const parts: string[] = [];
  if (humanCount > 1) parts.push(tPlural("home.nPlayers", humanCount));
  if (ais.length === 1) {
    parts.push(t("home.vsDifficultyAi", { difficulty: capitalize(t(`common.difficulty.${ais[0].difficulty ?? "medium"}` as TranslationKey)) }));
  } else if (ais.length > 1) {
    parts.push(tPlural("home.vsAiOpponents", ais.length));
  }
  // Joined with a space, not a comma — "2 players vs. 2 AI opponents" reads
  // as one phrase; a comma there ("2 players, vs. 2 AI opponents") read like
  // two disconnected fragments instead of "these two groups facing off."
  return `${t("game.roundOf", { round: state.round, total: state.selectedContracts.length })}${parts.length ? " · " + parts.join(" ") : ""}`;
}

/** A Daily Deal streak still worth mentioning: last played today or
 * yesterday (anything older has already lapsed, whatever the stored
 * number says). */
function dailyStreakAlive(state: DailyDealState | null): boolean {
  if (!state || state.streak <= 0 || !state.lastPlayedDate) return false;
  return state.lastPlayedDate === localDateKey() || state.lastPlayedDate === localDateKey(new Date(Date.now() - 86_400_000));
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
      // min-w-0 matters here: without it, a grid item's default min-width
      // is its content's un-wrapped size, so a single long word like
      // "Achievements" (no space to break at) was forcing this tile wider
      // than its own grid track instead of shrinking to fit it — the tile
      // visibly drifted off its border and out of alignment with the row.
      // container-type turns this tile itself into the sizing reference
      // for the label's font-size below, so the fit is exact on any
      // device instead of a guess pegged to one viewport width.
      className="relative flex min-w-0 flex-col items-center gap-1.5 rounded-lg border border-[var(--border)] px-1 py-3.5 text-center transition hover:bg-[var(--panel-soft)] [container-type:inline-size]"
    >
      {!!badge && (
        <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold leading-none text-[var(--on-accent)]">
          {badge}
        </span>
      )}
      <span className="text-[var(--accent)]">{children}</span>
      {/* One line, no wrap, no hyphens — sized in cqw (a percentage of
          this tile's own rendered width, via [container-type:inline-size]
          above) instead of a fixed px value, so the font scales with the
          actual button instead of being tuned for one screen size and
          either overflowing a narrower one or looking small on a wider
          one. The clamp() floor/ceiling just keeps it off the extremes on
          a truly tiny or huge tile. Calibrated so "Achievements" (the
          longest label) fills the tile without reaching its padding. */}
      <span
        className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-center font-medium leading-tight text-[var(--muted)]"
        style={{ fontSize: "clamp(7px, 12.5cqw, 15px)" }}
      >
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
  const { t } = useT();
  const pct = Math.round(achievement.progressFraction * 100);
  return (
    <Link
      href="/achievements"
      className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-left transition hover:bg-[var(--panel-soft)]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)]">
          {t("home.closestAchievement")}
        </p>
        <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">{pct}%</span>
      </div>
      <p className="mt-0.5 truncate text-sm font-semibold text-[var(--heading)]">
        {capitalize(t(`common.difficulty.${achievement.tier}` as TranslationKey))} ·{" "}
        {t(achievement.familyTitleKey as TranslationKey)}
      </p>
      <p className="mt-0.5 text-xs text-[var(--faint)]">{formatAchievementProgress(achievement, t)}</p>
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
  const { t } = useT();
  return (
    <details className="group rounded-lg border border-[var(--border)]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-[var(--muted)] [&::-webkit-details-marker]:hidden">
        {t("home.more")}
        <ChevronIcon className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-0.5 border-t border-[var(--border)] p-2">
        {configured && user && (
          <>
            <MoreGroupLabel>{t("home.playWithFriends")}</MoreGroupLabel>
            <MoreLink href="/clubs">{t("home.clubs")}</MoreLink>
            <MoreLink href="/tournaments">{t("home.tournaments")}</MoreLink>
          </>
        )}

        <MoreGroupLabel>{t("home.account")}</MoreGroupLabel>
        <MoreLink href="/settings">{t("home.settings")}</MoreLink>
        {configured && user && <MoreLink href="/account">{t("home.account")}</MoreLink>}
        {configured && user ? (
          <MoreLink onClick={onSignOut}>{t("home.signOut")}</MoreLink>
        ) : (
          <MoreLink href="/sign-in">{t("signIn.title")}</MoreLink>
        )}

        <MoreGroupLabel>{t("home.reference")}</MoreGroupLabel>
        <MoreLink href="/how-to-play?from=home">{t("common.howToPlay")}</MoreLink>
        <MoreLink href="/scorecard">{t("home.scorekeeper")}</MoreLink>
        <MoreLink href="/history">{t("home.historyOfBooksAndRuns")}</MoreLink>
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
 *
 * `softened` (a session that's never played a single turn) drops the
 * filled accent pill to a plain outlined one and the tinted background to
 * a bare border — this and the two daily-content cards below it used to
 * match New Game's own visual weight, competing for a first tap instead of
 * clearly playing second fiddle to it. Full weight returns the moment a
 * game actually starts (see firstSessionStore.ts).
 */
function SignInPrompt({ softened }: { softened: boolean }) {
  const { t } = useT();
  return (
    <Link
      href="/sign-in"
      // Hidden pre-paint for a returning signed-in visitor (html[data-signed-in],
      // stamped by public/init.js) — this renders server-side for everyone
      // until auth resolves, and popping out afterwards was a layout shift.
      data-home-signin
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
        softened
          ? "border-[var(--border)] hover:bg-[var(--panel-soft)]"
          : "border-[var(--accent)]/40 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/15"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--heading)]">{t("home.signInToSave")}</span>
        <span className="mt-0.5 block text-xs text-[var(--muted)]">{t("home.signInToSaveBody")}</span>
      </span>
      <span
        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ${
          softened
            ? "border border-[var(--accent)]/50 text-[var(--accent)]"
            : "bg-[var(--accent)] text-[var(--on-accent)]"
        }`}
      >
        {t("signIn.title")}
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
  const { t } = useT();
  const turnName = g.seats.find((s) => s.seat === g.turn_seat)?.name;
  const stale = daysStale(g.updated_at);
  // Turn-clock chip (migration 0061): only on an active game with a limit.
  const clock =
    g.status === "active" ? timerState(Date.now(), g.turn_started_at ? Date.parse(g.turn_started_at) : null, g.turn_limit_hours ?? 0) : null;
  const clockLeft = clock && clock.phase !== "off" && clock.phase !== "expired" ? formatRemaining(clock.remainingMs) : null;
  const chip =
    g.status === "pending"
      ? t("home.waitingToStart")
      : yourTurn
        ? t("home.yourTurn")
        : t("home.waitingForName", { name: turnName ?? "…" });
  return (
    <Link
      href={`/multiplayer/play?g=${g.game_id}`}
      className={`flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-left transition hover:bg-[var(--panel-soft)] ${
        dimmed ? "opacity-55 hover:opacity-100" : ""
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold text-[var(--heading)]">
          {opponentNames(g) || t("home.multiplayerGame")}
        </span>
        <span className="block text-xs text-[var(--faint)]">
          {t("game.roundOf", { round: g.round, total: g.total_rounds })}
          {clock && clock.phase !== "off" && (
            <span
              className={
                clock.phase === "expired" ? "text-[var(--danger)]" : clock.phase === "warn" ? "text-amber-500" : undefined
              }
            >
              {" · "}
              {clockLeft
                ? t("home.turnEndsIn", { time: t(`turnTimer.unit.${clockLeft.unit}`, { n: clockLeft.value }) })
                : t("home.turnOverdue")}
            </span>
          )}
          {stale != null && !yourTurn && (
            <span className={stale >= 14 ? "text-[var(--danger)]" : undefined}>
              {" · "}
              {stale >= 14 ? t("home.noMovesInDays", { days: stale }) : t("home.daysAbbr", { days: stale })}
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
  const { t, tPlural } = useT();
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
      // data-home-games-skeleton: hidden unless html[data-signed-in] (init.js)
      // — a guest has no games to load, so for them this placeholder was
      // pure layout shift when it vanished.
      <section className="flex flex-col gap-2" data-home-games-skeleton>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("home.yourGames")}</h2>
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
      setRespondError(t("home.respondError"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("home.yourGames")}</h2>

      {respondError && <p className="text-xs text-[var(--danger)]">{respondError}</p>}

      {invites.map((g) => (
        <div key={g.game_id} className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4 text-left">
          <p className="text-sm font-medium text-[var(--heading)]">
            {t("home.invitedYou", { name: opponentNames(g) || t("home.someone") })}
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {g.total_rounds === 7 ? t("home.fullGame") : tPlural("home.roundGame", g.total_rounds)}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => respond(g.game_id, true)}
              disabled={busyId === g.game_id}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {t("multiplayer.accept")}
            </button>
            <button
              onClick={() => respond(g.game_id, false)}
              disabled={busyId === g.game_id}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
            >
              {t("multiplayer.decline")}
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
              {resuming ? t("home.checkingForSave") : t("home.resumeGame")}
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
  const { t, tPlural } = useT();
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
  const quests = useQuests();
  // "Welcome back" after a few days away — the previous visit is read once
  // on mount (before this visit overwrites it), so the card can't vanish
  // itself by re-reading the timestamp it just wrote.
  const [returning, setReturning] = useState(false);
  // A ref, not a plain read: React StrictMode (dev) runs this effect twice,
  // and the second run would otherwise read the timestamp the first just
  // wrote and wrongly conclude the player never left.
  const previousVisitRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (previousVisitRef.current === undefined) previousVisitRef.current = readLastHomeVisit();
    setReturning(isReturningAfterAbsence(previousVisitRef.current));
    touchHomeVisit();
  }, []);
  // Covers both Continue and Daily Deal — either one commits GameContext's
  // state synchronously, but navigating to /game immediately afterward isn't
  // guaranteed to see that update yet (see the effect below), so both wait
  // for `state` to actually show up here before navigating.
  const [navigatingToGame, setNavigatingToGame] = useState(false);
  const [checkingForNewerSave, setCheckingForNewerSave] = useState(false);
  const [savedSummary, setSavedSummary] = useState<string | null>(null);
  const [savedMode, setSavedMode] = useState<string | null>(null);
  // This device's own not-yet-verified progress from any in-progress save
  // (regular, Daily Deal, or Weekly Challenge) — see withSessionCounters.
  const [pendingSessionCounters, setPendingSessionCounters] = useState<Record<string, number> | null>(null);
  const [dailyDeal, setDailyDeal] = useState<DailyDealState | null>(null);
  // Whether today's deal has an in-progress save to resume — see
  // GameContext.tsx's continueDailyDeal. Read once on mount, same as
  // `dailyDeal` above: this page fully remounts on every visit, and nothing
  // else on Home changes this mid-visit.
  const [hasDailyDealSave, setHasDailyDealSave] = useState(false);
  // Softens the Sign-in/Daily Deal/Weekly Challenge CTAs below so they
  // don't compete with New Game on a session that's never played a single
  // turn — see firstSessionStore.ts's own doc. Read in an effect, not the
  // initializer, so the very first client render matches the server's
  // "nothing yet" (same reasoning PageTip.tsx already follows) rather than
  // flashing the softened treatment then un-softening it a frame later.
  const [isFirstSession, setIsFirstSession] = useState(false);
  useEffect(() => {
    setIsFirstSession(!hasStartedAGame());
  }, []);
  // The post-signup welcome prompt (language + notifications) — shown once,
  // the first time this device sees the account signed in after sign-up
  // (see onboardingStore.ts). consumeJustSignedUp() clears the flag on
  // first read, so this is safe to re-check on every `user` change.
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (user && hasJustSignedUp()) setShowWelcome(true);
  }, [user]);
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
    setSavedSummary(saved ? summarizeSavedGame(saved.state, t, tPlural) : null);
    setSavedMode(saved ? savedGameMode(saved.state, t) : null);

    setPendingSessionCounters(loadPendingSessionCounters());
  }, [hasSavedGame, t, tPlural]);

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
  const closest = configured && user ? closestAchievement(withSessionCounters(progress, pendingSessionCounters)) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-10 text-center">
      <IntroSplash />
      <QuestToast quests={quests.justClaimed} onDismiss={quests.dismissClaimed} />
      <WelcomeOnboarding
        open={showWelcome}
        onDismiss={() => {
          setShowWelcome(false);
          clearJustSignedUp();
        }}
      />
      <div>
        <CardFanHero />
        <h1 className="text-4xl font-bold tracking-tight text-[var(--heading)]">Books &amp; Runs</h1>
        {configured && user && <HomeIdentity userId={user.id} level={level} loading={levelLoading} />}
      </div>

      <div className="flex w-full flex-col gap-5">
        <PageTip id="home" title={t("home.welcomeTip.title")}>
          {t("home.welcomeTip.body")}
        </PageTip>

        <Link
          href="/new-game"
          className="rounded-lg bg-[var(--accent)] px-6 py-3.5 text-center text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
        >
          {t("home.newGame")}
        </Link>

        {returning && (
          <WelcomeBackCard
            gamesWaiting={
              notifications.mpGames.filter(
                (g) => g.invite_status === "accepted" && g.status === "active" && g.turn_user_id === user?.id
              ).length
            }
            dailyStreak={dailyStreakAlive(dailyDeal) ? dailyDeal!.streak : 0}
            showQuests={!isFirstSession}
            onDismiss={() => setReturning(false)}
          />
        )}

        {/* One-tap "play my usual" — only with nothing in progress (dealing
            would replace the saved game) and once a game has been started
            (a first session's one loud action stays New Game). */}
        {!hasSavedGame && !isFirstSession && <QuickPlayCard onStarted={() => setNavigatingToGame(true)} />}

        <HomeGames
          hasSavedGame={hasSavedGame}
          savedSummary={savedSummary}
          savedMode={savedMode}
          onResumeLocal={handleContinue}
          resuming={checkingForNewerSave}
          notifications={notifications}
          userId={user?.id}
        />

        {configured && !user && <SignInPrompt softened={isFirstSession} />}

        {/* Tinted rather than plain-bordered like the rest of the page — a
            visual notch below New Game's solid fill, but a clear notch above
            the plain nav buttons below it, matching how much attention a
            once-a-day hook actually deserves: more than "here's a settings
            page," less than the primary CTA. On a session that's never
            played a single turn, even that notch competes with New Game —
            see isFirstSession's own doc — so it drops to a plain border and
            an outlined button until a game actually starts. */}
        {/* Quests: hidden until a game has been started this session, same
            "New Game stays the one loud thing" rule as the softened CTAs. */}
        {/* data-home-quests: rendered server-side, hidden pre-paint until this
            device has started a game (html[data-started], init.js) — so a
            first-time visitor's post-mount isFirstSession flip removes an
            already-invisible card instead of shoving the page up. */}
        {!isFirstSession && !(configured && user && quests.unavailable) && (
          <div data-home-quests>
            <QuestsCard views={quests.views} earning={configured && !!user} now={quests.now} />
          </div>
        )}

        <section
          className={`flex flex-col gap-3 rounded-xl border px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between ${
            isFirstSession ? "border-[var(--border)]" : "border-[var(--accent)]/40 bg-[var(--accent)]/10"
          }`}
        >
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--heading)]">{t("home.dailyDeal.title")}</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {!configured || !user
                ? t("home.dailyDeal.signInHint")
                : dailyDeal && dailyDeal.streak > 0
                ? t("home.dailyDeal.streak", { count: dailyDeal.streak })
                : t("home.dailyDeal.oneSeeded")}
            </p>
            {dailyDealPlayedToday && (
              <p className="mt-0.5 text-[10px] text-[var(--faint)]">{t("home.dailyDeal.streakProtected")}</p>
            )}
            {!dailyDealPlayedToday && hasDailyDealSave && (
              <p className="mt-0.5 text-[10px] text-[var(--faint)]">{t("home.leftInProgress")}</p>
            )}
          </div>
          <button
            onClick={handleDailyDeal}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${
              isFirstSession
                ? "border border-[var(--accent)]/50 text-[var(--accent)]"
                : "bg-[var(--accent)] text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
            }`}
          >
            {dailyDealPlayedToday
              ? t("home.playAgain")
              : hasDailyDealSave
                ? t("home.dailyDeal.continue")
                : t("home.dailyDeal.play")}
          </button>
        </section>

        {/* Daily Deal's bigger, harder sibling — a rotating event beyond the
            quick daily round, same tinted-but-not-primary visual weight
            (and the same softened-until-you've-played treatment). */}
        <section
          className={`flex flex-col gap-3 rounded-xl border px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between ${
            isFirstSession ? "border-[var(--border)]" : "border-[var(--highlight)]/40 bg-[var(--highlight)]/10"
          }`}
        >
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--heading)]">{t("home.weeklyChallenge.title")}</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {!configured || !user
                ? t("home.weeklyChallenge.signInHint")
                : weeklyChallenge && weeklyChallenge.streak > 0
                ? t("home.weeklyChallenge.streak", { count: weeklyChallenge.streak })
                : t("home.weeklyChallenge.description")}
            </p>
            {weeklyChallengePlayedThisWeek && (
              <p className="mt-0.5 text-[10px] text-[var(--faint)]">{t("home.weeklyChallenge.streakProtected")}</p>
            )}
            {!weeklyChallengePlayedThisWeek && hasWeeklyChallengeSave && (
              <p className="mt-0.5 text-[10px] text-[var(--faint)]">{t("home.leftInProgress")}</p>
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
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${
              isFirstSession
                ? "border border-[var(--accent)]/50 text-[var(--accent)]"
                : "bg-[var(--accent)] text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
            }`}
          >
            {weeklyChallengePlayedThisWeek
              ? t("home.playAgain")
              : hasWeeklyChallengeSave
                ? t("home.weeklyChallenge.continue")
                : t("home.weeklyChallenge.play")}
          </button>
        </section>

        <section className="grid grid-cols-4 gap-2">
          <ProgressTile href={user ? playerProfileHref(user.id) : "/player"} label={t("home.progressTile.profile")}>
            <StatsIcon />
          </ProgressTile>
          <ProgressTile href="/achievements" label={t("home.progressTile.achievements")}>
            <AchievementsIcon />
          </ProgressTile>
          <ProgressTile href="/leaderboard" label={t("home.progressTile.leaderboard")}>
            <LeaderboardIcon />
          </ProgressTile>
          <ProgressTile href="/friends" label={t("home.progressTile.friends")} badge={notifications.friendRequests}>
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
          {t("common.privacy")}
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="underline hover:text-[var(--muted)]">
          {t("common.terms")}
        </Link>{" "}
        ·{" "}
        <Link href="/support" className="underline hover:text-[var(--muted)]">
          {t("common.contact")}
        </Link>
      </p>
    </main>
  );
}
