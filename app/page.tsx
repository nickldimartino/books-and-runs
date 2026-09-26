"use client";

// Home. Top bar (identity chip / sign-in chip, notification bell, settings
// gear), then the Play zone — one primary button (Continue / Quick Deal / New
// Game) — with "Your games" (turns waiting, invites) right under it, one
// "Today" card (Daily Deal / Weekly Challenge / Quests behind a segmented
// control), and a compact footer of reference links. From 1024px it's two
// columns (Play + Your games | Today + progress) beside the app's left-rail
// nav (components/AppNav.tsx, mounted in the root layout). Everything that
// moved out lives on the Progress / Social / Profile hubs.
//
// Layout stability is a design constraint here: the prerendered HTML has to
// pick one layout for every visitor, and public/init.js stamps <html>
// attributes before first paint (data-started, data-signed-in, data-had-games,
// data-today-tab, data-signin-dismissed; see globals.css) that hide or size the
// parts that don't apply — so nothing pops in or out after hydration.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { CardFanHero } from "./components/CardFanHero";
import { IntroSplash } from "./components/IntroSplash";
import { PageTip } from "./components/PageTip";
import { HomeGames } from "./components/home/HomeGames";
import { HomeIdentity } from "./components/home/HomeIdentity";
import { HomeTopBar } from "./components/home/HomeTopBar";
import { PlayZone } from "./components/home/PlayZone";
import { QuestToast } from "./components/home/QuestToast";
import { ShieldSavedCard } from "./components/home/ShieldSavedCard";
import { SignInCard } from "./components/home/SignInCard";
import { dailyStreakAlive, displayedDailyStreak, TodayCard } from "./components/home/TodayCard";
import { WelcomeBackCard } from "./components/home/WelcomeBackCard";
import { WelcomeOnboarding } from "./components/WelcomeOnboarding";
import { useGame } from "./GameContext";
import { useT } from "./lib/i18n/LocaleProvider";
import {
  DailyDealState,
  loadDailyDealState,
  mergeCloudDailyDealState,
  markShieldNoticeSeen,
  unseenShieldSave,
} from "./lib/dailyDealStore";
import { ProgressTiles } from "./components/home/ProgressTiles";
import { useQuests } from "./lib/useQuests";
import { isReturningAfterAbsence, readLastHomeVisit, touchHomeVisit } from "./lib/welcomeBackStore";
import { clearJustSignedUp, hasJustSignedUp } from "./lib/onboardingStore";
import { WeeklyChallengeState, loadWeeklyChallengeState, mergeCloudWeeklyChallengeState } from "./lib/weeklyChallengeStore";
import { pullDailyDealStreak, pullWeeklyChallengeStreak } from "./lib/leaderboardStore";
import { applyCloudSave, loadCloudSave, loadDailyDealSave, loadSavedGame, loadWeeklyChallengeSave } from "./lib/localSave";
import { useSharedNotifications } from "./lib/NotificationsContext";
import { savedGameMode, summarizeSavedGame } from "./lib/savedGameSummary";
import { supabase } from "./lib/supabaseClient";
import { hasStartedAGame } from "./lib/firstSessionStore";
import { usePlayerLevel } from "./PlayerLevelContext";

export default function HomePage() {
  const router = useRouter();
  const { t, tPlural } = useT();
  const { configured, user } = useAuth();
  const {
    hasSavedGame,
    continueGame,
    startDailyDeal,
    continueDailyDeal,
    startWeeklyChallenge,
    continueWeeklyChallenge,
    state,
  } = useGame();
  const { level, loading: levelLoading } = usePlayerLevel();
  const notifications = useSharedNotifications();
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

  // A shield covered a missed day since the player last looked. Signed in
  // only (the streak belongs to the account).
  const shieldSaveDay = configured && user && dailyDeal ? unseenShieldSave(dailyDeal) : null;
  const questsAvailable = !isFirstSession && !(configured && user && quests.unavailable);
  const waitingGame =
    notifications.mpGames.find((g) => g.invite_status === "accepted" && g.status === "active" && g.turn_user_id === user?.id) ??
    null;

  const footerLink = "inline-block py-2.5 underline hover:text-[var(--muted)]";
  const moreLink = "rounded-md px-3 py-2.5 text-sm text-[var(--muted)] hover:bg-[var(--panel-soft)]";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-3 sm:px-6 lg:max-w-5xl lg:gap-6 lg:px-10">
      <IntroSplash />
      <QuestToast quests={quests.justClaimed} onDismiss={quests.dismissClaimed} />
      <WelcomeOnboarding
        open={showWelcome}
        onDismiss={() => {
          setShowWelcome(false);
          clearJustSignedUp();
        }}
      />
      <HomeTopBar
        configured={configured}
        userId={configured && user ? user.id : null}
        level={level}
        levelLoading={levelLoading}
        notifications={notifications}
        shieldSaveDay={shieldSaveDay}
        claimedQuests={quests.justClaimed}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="text-center">
            <div className="home-hero-fan">
              <CardFanHero />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl">Books &amp; Runs</h1>
          </div>

          <PlayZone
            hasSavedGame={hasSavedGame}
            savedSummary={savedSummary}
            savedMode={savedMode}
            resuming={checkingForNewerSave}
            onContinue={handleContinue}
            waitingGame={waitingGame}
            isFirstSession={isFirstSession}
            onStarted={() => setNavigatingToGame(true)}
          />

          <PageTip id="home" title={t("home.welcomeTip.title")}>
            {t("home.welcomeTip.body")}
          </PageTip>

          {returning && (
            <WelcomeBackCard
              gamesWaiting={
                notifications.mpGames.filter(
                  (g) => g.invite_status === "accepted" && g.status === "active" && g.turn_user_id === user?.id
                ).length
              }
              dailyStreak={dailyStreakAlive(dailyDeal) ? displayedDailyStreak(dailyDeal) : 0}
              shieldSaved={!!shieldSaveDay}
              showQuests={!isFirstSession}
              onDismiss={() => {
                if (shieldSaveDay) setDailyDeal(markShieldNoticeSeen());
                setReturning(false);
              }}
            />
          )}

          {!returning && shieldSaveDay && dailyDeal && (
            <ShieldSavedCard streak={dailyDeal.streak} onDismiss={() => setDailyDeal(markShieldNoticeSeen())} />
          )}

          <HomeGames notifications={notifications} userId={user?.id} />

          {configured && !user && <SignInCard softened={isFirstSession} />}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <TodayCard
            signedIn={!!(configured && user)}
            dailyDeal={dailyDeal}
            weeklyChallenge={weeklyChallenge}
            hasDailyDealSave={hasDailyDealSave}
            hasWeeklyChallengeSave={hasWeeklyChallengeSave}
            onPlayDaily={handleDailyDeal}
            onPlayWeekly={handleWeeklyChallenge}
            quests={quests}
            questsAvailable={questsAvailable}
            isFirstSession={isFirstSession}
          />
          <ProgressTiles userId={configured && user ? user.id : undefined} friendRequests={notifications.friendRequests} />
          {configured && user && (
            <div className="hidden flex-col gap-2 lg:flex">
              <HomeIdentity userId={user.id} level={level} loading={levelLoading} variant="card" />
              <Link href="/progress" className="self-end text-xs font-medium text-[var(--accent)] hover:underline">
                {t("home.viewProgress")}
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-1 pt-2">
        {/* Reference pages: a collapsed "More" at the bottom of the screen. */}
        <details className="group mx-auto w-full max-w-xs rounded-lg border border-[var(--border)]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-medium text-[var(--muted)] [&::-webkit-details-marker]:hidden">
            {t("home.more")}
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true">
              <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="flex flex-col gap-0.5 border-t border-[var(--border)] p-2">
            <Link href="/how-to-play?from=home" className={moreLink}>
              {t("common.howToPlay")}
            </Link>
            <Link href="/scorecard" className={moreLink}>
              {t("home.scorekeeper")}
            </Link>
            <Link href="/history" className={moreLink}>
              {t("home.historyOfBooksAndRuns")}
            </Link>
          </div>
        </details>

        <footer className="flex flex-wrap justify-center gap-x-3 text-xs text-[var(--faint)]">
          <Link href="/privacy" className={footerLink}>
            {t("common.privacy")}
          </Link>
          <Link href="/terms" className={footerLink}>
            {t("common.terms")}
          </Link>
          <Link href="/support" className={footerLink}>
            {t("common.contact")}
          </Link>
        </footer>
      </div>
    </main>
  );
}
