"use client";

// The end-of-game screen for a solo/pass-and-play game, and the place where
// a finished game is actually *recorded*. On mount (once, guarded) it:
// snapshots pre-game achievement progress, then verifies + records the
// result via the solo-verify Edge Function (verifySoloGame — the client's
// seed + move log replayed server-side; see that function's own doc for
// why nothing here writes player_stats/achievement_counters directly any
// more), syncs the leaderboard row, refreshes the level, merges/streaks
// the Daily Deal if this was one, and diffs the snapshot to show which
// achievements unlocked. A verification call that can't reach Supabase is
// queued to pendingSaveQueue for PendingSaveSync to retry — a rejected
// (illegal replay) one is not, and just shows as an error. Also renders
// standings, the Confetti burst, and the share image. (Multiplayer's
// equivalent recording path is server-side in mp/index.ts.)

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { allAchievements } from "@/achievements";
import { AchievementUnlockCard, AchievementUnlockItem } from "./AchievementUnlock";
import { Confetti } from "./Confetti";
import { ReviewPrompt } from "./ReviewPrompt";
import { UnlockToast } from "./UnlockToast";
import { Difficulty, GameState, YOU_PLAYER_ID } from "@/types";
import { ACHIEVEMENT_TIER_XP, DIFFICULTY_WIN_XP, FINISH_GAME_XP, WIN_GAME_XP } from "@/leveling";
import { useAuth } from "../AuthContext";
import { useGame } from "../GameContext";
import { useT } from "../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../lib/i18n/keys";
import { usePlayerLevel } from "../PlayerLevelContext";
import { AnyCosmeticOption, diffNewlyUnlockedCosmetics } from "../lib/allCosmetics";
import { track } from "../lib/analytics";
import { shouldShowReviewPromptAfterWin } from "../lib/reviewPromptStore";
import {
  DailyDealState,
  localDateKey,
  mergeCloudDailyDealState,
  recordDailyDealResult,
} from "../lib/dailyDealStore";
import {
  DailyDealFriendScore,
  fetchDailyDealFriendScores,
  submitDailyDealScore,
} from "../lib/dailyDealLeaderboard";
import {
  WeeklyChallengeState,
  isoWeekKey,
  mergeCloudWeeklyChallengeState,
  recordWeeklyChallengeResult,
} from "../lib/weeklyChallengeStore";
import { joinNames } from "../lib/formatNames";
import {
  displayNameFor,
  pullDailyDealStreak,
  syncDailyDealStreak,
  pullWeeklyChallengeStreak,
  syncWeeklyChallengeStreak,
  syncLeaderboardStats,
} from "../lib/leaderboardStore";
import { AI_THEORETICAL_LEVEL } from "../lib/aiPersonas";
import { loadAchievementProgressState } from "../lib/loadAchievementProgress";
import { renderShareCard } from "../lib/shareCard";
import { removePendingSave, setActiveForegroundGame, upsertPendingSave } from "../lib/pendingSaveQueue";
import {
  buildDailyDealVerifyPayload,
  buildSoloVerifyPayload,
  buildWeeklyChallengeVerifyPayload,
  SoloVerifyError,
  verifySoloGame,
} from "../lib/verifySoloGame";
import { playAchievementUnlock, playLevelUp } from "../lib/sound";
import { supabase } from "../lib/supabaseClient";

interface XpLineItem {
  label: string;
  amount: number;
}

// With the protocol (unlike shareCard.ts's footer text, which is a purely
// visual label) — a plain "books-and-runs.vercel.app" isn't reliably
// auto-linkified as tappable by every share target, "https://…" is.
const SITE_URL = "https://books-and-runs.vercel.app";

export function GameOverScreen({ state }: { state: GameState }) {
  const router = useRouter();
  const { t, tPlural } = useT();
  const {
    quitToHome,
    roundHistory,
    getSeed,
    getMoveLog,
    clearSessionCounters,
    isTutorial,
    isDailyDeal,
    isWeeklyChallenge,
    trackStats,
  } = useGame();
  const { configured, user } = useAuth();
  const { level, refresh: refreshLevel } = usePlayerLevel();
  const standings = [...state.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
  // Lowest score wins; everyone sharing that exact score is tied for it, so
  // `winners` (plural) is who to actually display, not just whichever tied
  // player a plain sort happens to list first. `winners.length === 1` in
  // the ordinary, non-tie case. Display only — being tied isn't a loss, but
  // it isn't a win either; see the separate, stricter `won` check below,
  // which gates the XP breakdown and matches recordGameResult's own rule.
  const lowestScore = Math.min(...state.players.map((p) => p.cumulativeScore));
  const winners = standings.filter((p) => p.cumulativeScore === lowestScore);
  const isTie = winners.length > 1;
  // Who emptied their hand THIS round (see the identical technique in
  // RoundSummary.tsx) — not necessarily the same person as `winner`, who is
  // whoever has the lowest cumulative score across the whole game. A round
  // can be won by going out while someone else still takes the game on
  // total score, so both need to be shown, even when they're the same
  // player. Undefined in the rare case nobody went out (e.g. the draw pile
  // was exhausted).
  const wentOut = state.players.find((p) => p.hasMeldedContract && p.hand.length === 0);
  const recordedRef = useRef(false);

  // Anonymous completion event — see analytics.ts. Once per mount.
  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    const humans = state.players.filter((p) => !p.isAI).length;
    track("game_completed", {
      mode: isTutorial ? "tutorial" : isDailyDeal ? "daily" : isWeeklyChallenge ? "weekly" : humans > 1 ? "pass" : "solo",
      rounds: state.selectedContracts.length,
      won: state.winnerId === YOU_PLAYER_ID,
    });
  }, [state, isTutorial, isDailyDeal, isWeeklyChallenge]);

  // Asks after a real win specifically (not a tie, not the tutorial) —
  // reviewPromptStore.ts is what actually paces this (every 3rd qualifying
  // win, stops for good once answered), this effect just reports the one
  // moment worth asking about. Guarded the same "once per mount" way as
  // the analytics effect above — this screen's own `state` never changes
  // after mount, so there's nothing to react to a second time.
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);
  const reviewPromptCheckedRef = useRef(false);
  useEffect(() => {
    if (reviewPromptCheckedRef.current) return;
    reviewPromptCheckedRef.current = true;
    if (isTutorial || isTie || state.winnerId !== YOU_PLAYER_ID) return;
    if (shouldShowReviewPromptAfterWin()) setShowReviewPrompt(true);
  }, [state, isTutorial, isTie]);

  // Snapshot of achievement progress from immediately before this game's
  // writes land — captured once (a retry after a partial failure must reuse
  // it, not re-snapshot, or a partially-applied write would look like the
  // pre-game baseline and hide whatever it already unlocked). Used only to
  // name which specific achievements this game unlocked; best-effort — see
  // the fallback in attemptSave if this or the after-snapshot fails.
  const beforeAchievementsRef = useRef<Awaited<ReturnType<typeof loadAchievementProgressState>> | null>(null);
  const [gameId] = useState(() => crypto.randomUUID());
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [xpGained, setXpGained] = useState<number | null>(null);
  const [xpBreakdown, setXpBreakdown] = useState<XpLineItem[]>([]);
  const [unlockedAchievements, setUnlockedAchievements] = useState<AchievementUnlockItem[]>([]);
  const [newlyUnlockedCosmetics, setNewlyUnlockedCosmetics] = useState<AnyCosmeticOption[]>([]);
  const [leveledUpTo, setLeveledUpTo] = useState<number | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied" | "error">("idle");

  // While this screen is up, it owns retrying its own save — see
  // pendingSaveQueue.ts for why the background sync must not also touch it.
  useEffect(() => {
    setActiveForegroundGame(gameId);
    return () => setActiveForegroundGame(null);
  }, [gameId]);

  const attemptSave = useCallback(async () => {
    if (!supabase || !user) return;
    setSaved("saving");

    // Snapshot pre-game XP/level now — PlayerLevelProvider loads once at
    // sign-in, well before this screen ever mounts, so `level` here is
    // reliably the "before this game" value to diff the refreshed one
    // against once recordGameResult/recordAchievementProgress land.
    const beforeXp = level?.totalXp ?? 0;
    const beforeLevel = level?.level ?? 0;

    if (!beforeAchievementsRef.current) {
      try {
        beforeAchievementsRef.current = await loadAchievementProgressState(supabase, user.id);
      } catch (err) {
        console.error("Failed to snapshot pre-game achievement progress:", err);
      }
    }

    const you = state.players.find((p) => p.id === YOU_PLAYER_ID);
    // The per-game XP sources (finishing, winning, difficulty bonus) are
    // fully known from this game alone — matches the exact rule the server
    // uses for which AI difficulties count toward a win. A tie for the
    // lowest score is a tie, not a win — no "Won" XP bonus. Purely a
    // display projection (which XP lines to show) — the actual write below
    // never trusts anything computed here.
    const won = !!you && !isTie && you.cumulativeScore === lowestScore;
    const breakdown: XpLineItem[] = [{ label: t("gameOver.xp.finished"), amount: FINISH_GAME_XP }];
    if (won) {
      breakdown.push({ label: t("gameOver.xp.won"), amount: WIN_GAME_XP });
      const difficultiesFaced = new Set(
        state.players
          .filter((p) => p.id !== you!.id && p.isAI && p.difficulty)
          .map((p) => p.difficulty as Difficulty)
      );
      for (const d of difficultiesFaced) {
        breakdown.push({
          label: t("gameOver.xp.beatDifficulty", { difficulty: t(`common.difficulty.${d}` as TranslationKey) }),
          amount: DIFFICULTY_WIN_XP[d] ?? 0,
        });
      }
    }

    // No seed/move log (a save from before this shipped — see
    // GameContext.tsx's gameSeedRef doc) means this one game just can't be
    // verified. The caller effect below already gates on getSeed() being
    // present before ever calling attemptSave, so this is only a defensive
    // fallback, not the normal path — treat it the same as trackStats being
    // off: nothing recorded, nothing queued, no error shown.
    const payload = buildSoloVerifyPayload(state, getSeed(), getMoveLog(), trackStats, roundHistory);
    if (!payload) {
      setSaved("saved");
      return;
    }

    try {
      await verifySoloGame(supabase, payload);
    } catch (err) {
      console.error("Failed to verify and save this game:", err);
      // A verification rejection (malformed payload, or a replay that
      // didn't hold up) is deterministic — the exact same payload will
      // fail again identically, so queuing it for PendingSaveSync to keep
      // retrying forever would just spam the same rejection. Only queue
      // for genuinely transient failures (offline, a 5xx, a dropped
      // connection) where a later retry could plausibly succeed.
      const status = err instanceof SoloVerifyError ? err.status : undefined;
      const permanentRejection = typeof status === "number" && status >= 400 && status < 500;
      if (!permanentRejection) {
        upsertPendingSave({ id: gameId, userId: user.id, payload });
      }
      setSaved("error");
      return;
    }

    removePendingSave(gameId);
    setSaved("saved");
    clearSessionCounters();
    // Best-effort — the leaderboard just shows slightly stale numbers until
    // the next successful sync (a later game, or visiting the Leaderboard/
    // Account page, both of which sync again on their own) rather than
    // surfacing a second error state for a table the player didn't
    // necessarily ask to see right now.
    syncLeaderboardStats(supabase, user.id).catch((err) => {
      console.error("Failed to sync leaderboard entry:", err);
    });
    const after = await refreshLevel();
    if (after) {
      const gained = Math.max(0, after.totalXp - beforeXp);
      setXpGained(gained);
      // Whatever's left once the known per-game sources are accounted for
      // must be from achievement tiers newly unlocked this game — used as
      // the fallback total if naming them individually below doesn't work
      // out, so the XP is never just silently unaccounted for.
      const knownTotal = breakdown.reduce((sum, item) => sum + item.amount, 0);
      const achievementBonus = Math.max(0, gained - knownTotal);

      const didLevelUp = after.level > beforeLevel;

      // Named individually (icon, tier, tap-to-expand requirement — the
      // same AchievementUnlockCard RoundSummary renders after every earlier
      // round) whenever the lookup below succeeds; achievementBonus is only
      // ever shown as its own generic line if that lookup fails, so the XP
      // is never just silently unaccounted for. Also whenever this fetch
      // happens (an achievement changed, or a level-up alone could be
      // enough — e.g. crossing Level 10), diff every gated cosmetic too,
      // for the "you just earned a new frame/title/emoji" toast.
      let unlockedItems: AchievementUnlockItem[] = [];
      if ((achievementBonus > 0 || didLevelUp) && beforeAchievementsRef.current) {
        try {
          const afterProgress = await loadAchievementProgressState(supabase, user.id);
          const beforeUnlocked = new Set(
            allAchievements(beforeAchievementsRef.current)
              .filter((a) => a.unlocked)
              .map((a) => `${a.familyId}:${a.tier}`)
          );
          unlockedItems = allAchievements(afterProgress)
            .filter((a) => a.unlocked && !beforeUnlocked.has(`${a.familyId}:${a.tier}`))
            .map((a) => ({ achievement: a, xp: ACHIEVEMENT_TIER_XP[a.tier] }));
          setNewlyUnlockedCosmetics(
            diffNewlyUnlockedCosmetics(beforeLevel, beforeAchievementsRef.current, after.level, afterProgress)
          );
        } catch (err) {
          console.error("Failed to determine which achievements this game unlocked:", err);
        }
      }

      setUnlockedAchievements(unlockedItems);
      setXpBreakdown(
        unlockedItems.length === 0 && achievementBonus > 0
          ? [...breakdown, { label: t("gameOver.xp.achievementsUnlocked"), amount: achievementBonus }]
          : breakdown
      );
      if (didLevelUp) setLeveledUpTo(after.level);
      // Same "don't layer two chimes at once" priority the round/game-win
      // effect in game/page.tsx already uses for its own overlapping case —
      // a level up already means real progress happened this game, so it
      // takes priority over the smaller achievement ping rather than both
      // firing together and clashing.
      if (didLevelUp) {
        playLevelUp();
      } else if (unlockedItems.length > 0 || achievementBonus > 0) {
        playAchievementUnlock();
      }
    }
    // `level` is only read for the before/after diff — it must not retrigger
    // a fresh save as PlayerLevelProvider's own state updates after refresh().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, roundHistory, user, getSeed, getMoveLog, trackStats, clearSessionCounters, refreshLevel, gameId]);

  useEffect(() => {
    // Tutorial games are scripted practice, and Daily Deal/Weekly Challenge
    // are each their own separate local streak (see the effects below) —
    // none of the three ever touches Supabase, so none can inflate stats/
    // achievements or count toward "games played." trackStats is New
    // Game's own opt-out (offered for 2+ pass-and-play human players) —
    // same rule, skip the write outright. getSeed() == null means this one
    // game predates seeding (see GameContext.tsx's gameSeedRef doc) and
    // simply can't be verified — same treatment as trackStats off, not an
    // error: nothing recorded for this one game, no retry queued, game-over
    // screen still shows fine.
    if (recordedRef.current || !supabase || !user || isTutorial || isDailyDeal || isWeeklyChallenge || !trackStats) {
      return;
    }
    if (getSeed() == null) return;
    recordedRef.current = true;
    attemptSave();
  }, [user, isTutorial, isDailyDeal, isWeeklyChallenge, trackStats, getSeed, attemptSave]);

  // Deliberately separate from the Supabase save above — see
  // dailyDealStore.ts's own doc for why the streak computation itself needs
  // no sign-in and never touches real stats. recordDailyDealResult is
  // itself idempotent (a no-op once today's already recorded), so the ref
  // here is just to avoid a redundant localStorage read/write (and, now, a
  // redundant cloud round trip) on every re-render, not correctness.
  const dailyDealRecordedRef = useRef(false);
  const [dailyDealState, setDailyDealState] = useState<DailyDealState | null>(null);
  // The per-deal friend leaderboard (migration 0018) — you plus any accepted
  // friends who've played today's same deal, best score first. Stays null
  // when signed out, unconfigured, or 0018 hasn't been run.
  const [dailyDealFriendScores, setDailyDealFriendScores] = useState<DailyDealFriendScore[] | null>(null);
  useEffect(() => {
    if (!isDailyDeal || dailyDealRecordedRef.current) return;
    dailyDealRecordedRef.current = true;
    // The streak is tied to the signed-in account, not the device — a guest
    // can still play today's deal (createDailyDealGame doesn't check auth),
    // but nothing about it gets recorded locally or in the cloud, so
    // playing signed out never starts, extends, or breaks a streak, and a
    // guest can replay today's deal as many times as they like with none of
    // it counting. See dailyDealStore.ts's own doc for the local side of
    // this, and AccountSwitchGuard.tsx for why the local copy is also
    // cleared on sign-out (it belongs to whichever account was signed in
    // when it was written, not to whoever's using the device now).
    if (!supabase || !user) return;
    const client = supabase;
    const uid = user.id;
    (async () => {
      // Pull the account's cloud record *before* computing today's result —
      // this is the actual cross-device fix: without it, this device would
      // only ever know about days *it* played, the exact bug where an
      // iPhone/laptop/iPad each kept their own separate streak.
      try {
        const cloud = await pullDailyDealStreak(client, uid);
        if (cloud) mergeCloudDailyDealState(cloud);
      } catch (err) {
        console.error("Failed to pull Daily Deal streak from cloud:", err);
      }
      const result = recordDailyDealResult(state);
      setDailyDealState(result);
      if (result.lastPlayedDate) {
        syncDailyDealStreak(client, uid, result.streak, result.bestStreak, result.lastPlayedDate).catch((err) => {
          console.error("Failed to sync Daily Deal streak:", err);
        });
        // Records a verified completion toward the account's real streak
        // (see solo-verify/index.ts and migration 0036) — the sync above
        // pushes this device's own locally-computed numbers, but a
        // leaderboard_entries trigger silently overwrites them with
        // whatever daily_deal_completions actually has on file, so this is
        // what the streak shown everywhere actually rests on. Best-effort
        // and idempotent (a replay of an already-recorded day just no-ops
        // server-side) — never blocks the local streak shown above.
        const payload = buildDailyDealVerifyPayload(state, getSeed(), getMoveLog(), localDateKey());
        if (payload) {
          verifySoloGame(client, payload).catch((err) => {
            console.error("Failed to record a verified Daily Deal completion:", err);
          });
        }
        // Record this account's score for today's deal, then pull the
        // friend leaderboard for it. Best-effort: a project without
        // migration 0018 just won't show the panel. `history[0]` is the
        // entry recordDailyDealResult keeps for today (whether it just
        // recorded it or a replay left the original in place).
        const todays = result.history[0];
        if (todays) {
          (async () => {
            try {
              await submitDailyDealScore(client, todays.date, todays.yourScore, todays.won);
              setDailyDealFriendScores(await fetchDailyDealFriendScores(client, todays.date));
            } catch (err) {
              console.error("Daily Deal friend scores unavailable (run migration 0018):", err);
            }
          })();
        }
      }
    })();
  }, [isDailyDeal, state, user, getSeed, getMoveLog]);

  // Same shape as the Daily Deal effect above, weeks in place of days — see
  // weeklyChallengeStore.ts's own doc. No per-challenge friend leaderboard
  // (Daily Deal's dailyDealLeaderboard.ts/migration 0018 equivalent) yet —
  // worth adding later, not required for the streak itself to work.
  const weeklyChallengeRecordedRef = useRef(false);
  const [weeklyChallengeState, setWeeklyChallengeState] = useState<WeeklyChallengeState | null>(null);
  useEffect(() => {
    if (!isWeeklyChallenge || weeklyChallengeRecordedRef.current) return;
    weeklyChallengeRecordedRef.current = true;
    if (!supabase || !user) return;
    const client = supabase;
    const uid = user.id;
    (async () => {
      try {
        const cloud = await pullWeeklyChallengeStreak(client, uid);
        if (cloud) mergeCloudWeeklyChallengeState(cloud);
      } catch (err) {
        console.error("Failed to pull Weekly Challenge streak from cloud:", err);
      }
      const result = recordWeeklyChallengeResult(state);
      setWeeklyChallengeState(result);
      if (result.lastPlayedWeek) {
        syncWeeklyChallengeStreak(client, uid, result.streak, result.bestStreak, result.lastPlayedWeek).catch(
          (err) => {
            console.error("Failed to sync Weekly Challenge streak:", err);
          }
        );
        // Records a verified completion toward the account's real streak
        // (see solo-verify/index.ts and migration 0039) — same reasoning
        // as the Daily Deal payload above: the sync call pushes this
        // device's own locally-computed numbers, but a leaderboard_entries
        // trigger silently overwrites them with whatever
        // weekly_challenge_completions actually has on file.
        const payload = buildWeeklyChallengeVerifyPayload(state, getSeed(), getMoveLog(), isoWeekKey());
        if (payload) {
          verifySoloGame(client, payload).catch((err) => {
            console.error("Failed to record a verified Weekly Challenge completion:", err);
          });
        }
      }
    })();
  }, [isWeeklyChallenge, state, user, getSeed, getMoveLog]);

  // Without live multiplayer, a shared result is this game's only social
  // loop — the sole way one player's game becomes someone else's reason to
  // open the app. Both the image (renderShareCard) and the text fallback are
  // built from the exact standings/isTie/winners this screen already
  // computes, so neither can drift from what's on screen. Never called
  // during a tutorial — see the button's own !isTutorial guard below.
  function levelLabel(p: (typeof standings)[number]): string {
    if (p.id === YOU_PLAYER_ID && level) return t("game.levelBadge", { level: level.level });
    if (p.isAI && p.difficulty) return t("game.levelBadge", { level: AI_THEORETICAL_LEVEL[p.difficulty] });
    return "";
  }

  function shareHeadline(): string {
    return isTie
      ? t("gameOver.share.tied", { names: joinNames(winners.map((w) => w.name)) })
      : t("gameOver.share.won", { name: winners[0].name });
  }

  function shareText(): string {
    // One player per line, same shape as the in-game header's own score list.
    const lines = standings.map((p) => {
      const lv = levelLabel(p);
      return `${lv ? lv + " " : ""}${p.name}: ${p.cumulativeScore}`;
    });
    return `🃏 ${shareHeadline()}\n${lines.join("\n")}\n${SITE_URL}`;
  }

  async function shareImageFile(): Promise<File | null> {
    try {
      const blob = await renderShareCard({
        headline: shareHeadline(),
        rows: standings.map((p) => ({
          rank: standings.filter((o) => o.cumulativeScore < p.cumulativeScore).length + 1,
          level: levelLabel(p),
          name: p.name,
          score: p.cumulativeScore,
          isWinner: winners.some((w) => w.id === p.id),
        })),
      });
      return blob ? new File([blob], "books-and-runs.png", { type: "image/png" }) : null;
    } catch (err) {
      console.error("Failed to render the share image:", err);
      return null;
    }
  }

  async function handleShare() {
    const file = await shareImageFile();

    // 1. Native share sheet with the image attached — the good path on
    //    phones. `text` is just the URL, not the headline again — the image
    //    already shows the headline and standings, so repeating it in the
    //    caption was pure redundancy. The URL is what the picture alone
    //    can't give the recipient: an actual way to go open the game.
    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: SITE_URL });
      } catch {
        // cancelled — not a failure worth surfacing
      }
      return;
    }

    // 2. Desktop / no file share: put the actual image on the clipboard
    //    where that's supported, so a paste into a chat or doc drops the
    //    scoreboard, not a line of text.
    if (file && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": file })]);
        setShareState("copied");
        setTimeout(() => setShareState("idle"), 2000);
        return;
      } catch {
        // fall through to text
      }
    }

    // 3. Last resort — no file share and no image-clipboard support: the
    //    multi-line text (shareText, url appended) is the only content, so
    //    it needs the full breakdown, unlike case 1's file-share caption.
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText() });
      } catch {
        /* cancelled */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${shareText()}\n${window.location.origin}`);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2000);
    } catch {
      setShareState("error");
    }
  }

  function playAgain() {
    quitToHome();
    router.push("/new-game/local");
  }

  function goHome() {
    quitToHome();
    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
      {/* Fires once on mount — every path to this screen (a real win, a
          tie, or finishing the tutorial) is the one moment the whole game
          actually builds to, so this doesn't gate on `winners`/`isTie` at
          all. Purely decorative and non-blocking (see Confetti's own doc). */}
      <Confetti />
      <UnlockToast items={newlyUnlockedCosmetics} onDismiss={() => setNewlyUnlockedCosmetics([])} />
      <div className="text-center">
        <p className="text-sm uppercase tracking-wide text-[var(--faint)]">
          {isTutorial
            ? t("gameOver.tutorialComplete")
            : isDailyDeal
              ? t("gameOver.dailyDeal")
              : isWeeklyChallenge
                ? t("gameOver.weeklyChallenge")
                : t("gameOver.gameOver")}
        </p>
        {!isTutorial && wentOut && (
          <p className="mt-1 break-words text-base font-semibold text-[var(--muted)]">{t("roundSummary.wentOut", { name: wentOut.name })}</p>
        )}
        <h1 className="win-announce mt-1 break-words text-3xl font-bold text-[var(--heading)]">
          {isTutorial
            ? t("gameOver.niceWork")
            : isTie
              ? t("gameOver.tied", { names: joinNames(winners.map((w) => w.name)) })
              : t("gameOver.won", { name: winners[0].name })}
        </h1>
        {isTutorial && (
          <p className="mt-2 text-sm text-[var(--muted)]">{t("gameOver.tutorialBody")}</p>
        )}
      </div>

      {showReviewPrompt && <ReviewPrompt onDismiss={() => setShowReviewPrompt(false)} />}

      <ol className="flex flex-col gap-2">
        {standings.map((p) => {
          // Competition ranking (1, 1, 3, 4 — not 1, 2, 3, 4), so a tie
          // anywhere in the standings shares a place instead of implying a
          // margin that isn't there.
          const rank = standings.filter((o) => o.cumulativeScore < p.cumulativeScore).length + 1;
          return (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg bg-[var(--panel)] px-4 py-3"
            >
              <span className="font-medium">
                {rank}. {p.name}
              </span>
              <span className="font-semibold text-[var(--heading)]">{t("game.hand.pts", { count: p.cumulativeScore })}</span>
            </li>
          );
        })}
      </ol>

      {!isTutorial && (
        <div className="text-center">
          <button
            onClick={handleShare}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            {shareState === "copied" ? t("gameOver.share.copied") : shareState === "error" ? t("gameOver.share.copyError") : t("gameOver.share.button")}
          </button>
        </div>
      )}

      {isTutorial && (
        <div className="rounded-xl bg-[var(--panel-soft)] p-4 text-sm text-[var(--muted)]">
          <p className="font-semibold text-[var(--heading)]">{t("gameOver.scoring.heading")}</p>
          <p className="mt-1">{t("gameOver.scoring.body")}</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <li>{t("gameOver.scoring.numbers")}</li>
            <li>{t("gameOver.scoring.faceCards")}</li>
            <li>{t("gameOver.scoring.ace")}</li>
            <li>{t("gameOver.scoring.wild")}</li>
            <li>{t("gameOver.scoring.jokerCard")}</li>
          </ul>
        </div>
      )}

      {/* Its own local streak, not the Supabase saved-to-your-stats status
          below (isDailyDeal is excluded from that block entirely — see
          dailyDealStore.ts's own doc for why this never touches Supabase). */}
      {isDailyDeal && dailyDealState && (
        <div className="rounded-xl bg-[var(--panel-soft)] p-4 text-center">
          <p className="text-3xl" aria-hidden="true">
            🔥
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--heading)]">
            {tPlural("gameOver.dayStreak", dailyDealState.streak)}
          </p>
          <p className="mt-1 text-xs text-[var(--faint)]">
            {t("gameOver.bestStreakDaily", { best: dailyDealState.bestStreak })}
          </p>
        </div>
      )}

      {/* Signed out — the streak effect above never ran, so there's nothing
          to show but the nudge to actually get one going. */}
      {isDailyDeal && !user && (
        <div className="rounded-xl bg-[var(--panel-soft)] p-4 text-center">
          <p className="text-sm text-[var(--muted)]">{t("gameOver.signInForStreak")}</p>
        </div>
      )}

      {/* Same treatment as Daily Deal's streak card above, weeks instead of
          days. */}
      {isWeeklyChallenge && weeklyChallengeState && (
        <div className="rounded-xl bg-[var(--panel-soft)] p-4 text-center">
          <p className="text-3xl" aria-hidden="true">
            🏆
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--heading)]">
            {tPlural("gameOver.weekStreak", weeklyChallengeState.streak)}
          </p>
          <p className="mt-1 text-xs text-[var(--faint)]">
            {t("gameOver.bestStreakWeekly", { best: weeklyChallengeState.bestStreak })}
          </p>
        </div>
      )}

      {isWeeklyChallenge && !user && (
        <div className="rounded-xl bg-[var(--panel-soft)] p-4 text-center">
          <p className="text-sm text-[var(--muted)]">{t("gameOver.signInForStreak")}</p>
        </div>
      )}

      {/* Per-deal friend leaderboard (migration 0018). Only worth showing
          once it's actually a comparison — you plus at least one friend
          who's played today's same deal. */}
      {isDailyDeal && dailyDealFriendScores && dailyDealFriendScores.length >= 2 && (
        <div className="rounded-xl bg-[var(--panel-soft)] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
            {t("gameOver.friendsHeading")}
          </h3>
          <ol className="mt-2 flex flex-col gap-1">
            {dailyDealFriendScores.map((s, i) => (
              <li
                key={s.userId}
                className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm ${
                  s.isMe
                    ? "bg-[var(--accent)]/15 font-semibold text-[var(--heading)]"
                    : "text-[var(--text)]"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-4 shrink-0 text-right tabular-nums text-[var(--faint)]">{i + 1}</span>
                  <span className="truncate">
                    {s.isMe ? t("gameOver.you") : displayNameFor({ user_id: s.userId, display_name: s.displayName })}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {s.score}
                  {s.won ? " 🏆" : ""}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Previously this game-over screen had zero conversion nudge for a
          guest finishing a *regular* game — only Daily Deal (above) had
          one. A completed game is the moment the value of an account is
          most concrete (a level, achievement progress, a leaderboard spot,
          this exact result compared against friends), so this is also
          where the pitch is repeated, not just stated once on Home. */}
      {!isTutorial && !isDailyDeal && !isWeeklyChallenge && configured && !user && (
        <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4 text-center">
          <p className="text-sm font-semibold text-[var(--heading)]">{t("gameOver.notSaved")}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{t("gameOver.notSavedBody")}</p>
          <Link
            href="/sign-in"
            className="mt-3 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
          >
            {t("signIn.title")}
          </Link>
        </div>
      )}

      {!isTutorial && !isDailyDeal && !isWeeklyChallenge && user && !trackStats && (
        <p className="text-center text-xs text-[var(--faint)]">{t("gameOver.statsNotTracked")}</p>
      )}

      {!isTutorial && !isDailyDeal && !isWeeklyChallenge && user && trackStats && (
        <div className="text-center text-xs text-[var(--faint)]">
          <p>
            {saved === "saving" && t("gameOver.saving")}
            {saved === "saved" && t("gameOver.saved")}
            {saved === "error" && t("gameOver.saveError")}
          </p>
          {saved === "error" && (
            <button
              onClick={() => attemptSave()}
              className="mt-1 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
            >
              {t("common.retry")}
            </button>
          )}
          {saved === "saved" && xpGained !== null && (
            <div className="mt-1">
              <p className="text-sm font-semibold text-[var(--accent)]">
                {t("roundSummary.xpGained", { xp: xpGained })}
                {leveledUpTo !== null && (
                  <span className="level-up-pulse ml-1 inline-block font-bold">
                    {t("roundSummary.levelUp", { level: leveledUpTo })}
                  </span>
                )}
              </p>
              {xpBreakdown.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {xpBreakdown.map((item, i) => (
                    <li key={i} className="line-enter" style={{ animationDelay: `${i * 70}ms` }}>
                      {t("gameOver.xpLine", { amount: item.amount, label: item.label })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {saved === "saved" && (
        <AchievementUnlockCard
          items={unlockedAchievements}
          heading={tPlural("multiplayer.achievementUnlocked", unlockedAchievements.length)}
        />
      )}

      <div className="mt-4 flex flex-col gap-3">
        {/* Daily Deal skips "Play again" entirely — replaying today's deal
            from here wouldn't do anything the streak above hasn't already
            settled (see recordDailyDealResult's own idempotency), so a
            second button offering to redo it would just be a dead end. */}
        {!isDailyDeal && (
          <button
            onClick={playAgain}
            className="rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
          >
            {isTutorial ? t("gameOver.playRealGame") : t("gameOver.playAgain")}
          </button>
        )}
        <button
          onClick={goHome}
          className={
            isDailyDeal
              ? "rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
              : "rounded-lg border border-[var(--border)] px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          }
        >
          {t("common.home")}
        </button>
      </div>
    </main>
  );
}
