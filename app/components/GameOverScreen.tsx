"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { allAchievements, tierNumber } from "@/achievements";
import { Confetti } from "./Confetti";
import { Difficulty, GameState } from "@/types";
import { ACHIEVEMENT_TIER_XP, DIFFICULTY_WIN_XP, FINISH_GAME_XP, WIN_GAME_XP } from "@/leveling";
import { useAuth } from "../AuthContext";
import { useGame } from "../GameContext";
import { usePlayerLevel } from "../PlayerLevelContext";
import { DailyDealState, recordDailyDealResult } from "../lib/dailyDealStore";
import { joinNames } from "../lib/formatNames";
import { syncLeaderboardStats } from "../lib/leaderboardStore";
import { loadAchievementProgressState } from "../lib/loadAchievementProgress";
import { removePendingSave, setActiveForegroundGame, upsertPendingSave } from "../lib/pendingSaveQueue";
import { recordAchievementProgress } from "../lib/recordAchievementProgress";
import { recordGameResult, YOU_PLAYER_ID } from "../lib/recordGameResult";
import { playAchievementUnlock, playLevelUp } from "../lib/sound";
import { supabase } from "../lib/supabaseClient";

interface XpLineItem {
  label: string;
  amount: number;
}

export function GameOverScreen({ state }: { state: GameState }) {
  const router = useRouter();
  const { quitToHome, roundHistory, getSessionCounters, clearSessionCounters, isTutorial, isDailyDeal, trackStats } =
    useGame();
  const { user } = useAuth();
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
  // Tracked separately from `saved` so a retry after a partial failure (one
  // write went through, the other didn't) only re-sends the write that
  // actually failed — neither recordGameResult nor recordAchievementProgress
  // is safe to run twice, since each one adds its own deltas on top of
  // whatever's already stored rather than overwriting.
  const gameResultDoneRef = useRef(false);
  const achievementDoneRef = useRef(false);
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
    const counters = { ...getSessionCounters() };
    if (you && you.cumulativeScore === 0) {
      counters.zero_penalty_games = (counters.zero_penalty_games ?? 0) + 1;
    }

    // The per-game XP sources (finishing, winning, difficulty bonus) are
    // fully known from this game alone — matches the exact rule
    // recordGameResult uses for which AI difficulties count toward a win.
    // A tie for the lowest score is a tie, not a win — no "Won" XP bonus.
    const won = !!you && !isTie && you.cumulativeScore === lowestScore;
    const breakdown: XpLineItem[] = [{ label: "Finished the game", amount: FINISH_GAME_XP }];
    if (won) {
      breakdown.push({ label: "Won", amount: WIN_GAME_XP });
      const difficultiesFaced = new Set(
        state.players
          .filter((p) => p.id !== you!.id && p.isAI && p.difficulty)
          .map((p) => p.difficulty as Difficulty)
      );
      for (const d of difficultiesFaced) {
        breakdown.push({ label: `Beat a ${d} AI`, amount: DIFFICULTY_WIN_XP[d] ?? 0 });
      }
    }

    const [gameResult, achievementResult] = await Promise.allSettled([
      gameResultDoneRef.current ? Promise.resolve() : recordGameResult(supabase, user.id, state, roundHistory),
      achievementDoneRef.current ? Promise.resolve() : recordAchievementProgress(supabase, user.id, counters),
    ]);

    // Promise.all's single opaque error made this genuinely undiagnosable
    // from the outside — logging which write failed and why is the only
    // way anyone (developer or a report from a player) can tell a real
    // Supabase/schema problem apart from an actual network blip.
    if (gameResult.status === "fulfilled") {
      gameResultDoneRef.current = true;
    } else {
      console.error("Failed to save game result:", gameResult.reason);
    }
    if (achievementResult.status === "fulfilled") {
      achievementDoneRef.current = true;
    } else {
      console.error("Failed to save achievement progress:", achievementResult.reason);
    }
    if (gameResult.status === "rejected" || achievementResult.status === "rejected") {
      // Not fully saved — queue it so this game's result survives leaving
      // this screen or closing the app. PendingSaveSync retries it once the
      // connection's back, even if this screen never gets revisited.
      upsertPendingSave({
        id: gameId,
        userId: user.id,
        state,
        roundHistory,
        counters,
        gameResultDone: gameResultDoneRef.current,
        achievementDone: achievementDoneRef.current,
      });
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

      let achievementLines: XpLineItem[] = [];
      if (achievementBonus > 0 && beforeAchievementsRef.current) {
        try {
          const afterProgress = await loadAchievementProgressState(supabase, user.id);
          const beforeUnlocked = new Set(
            allAchievements(beforeAchievementsRef.current)
              .filter((a) => a.unlocked)
              .map((a) => `${a.familyId}:${a.tier}`)
          );
          achievementLines = allAchievements(afterProgress)
            .filter((a) => a.unlocked && !beforeUnlocked.has(`${a.familyId}:${a.tier}`))
            .map((a) => ({
              label: `${a.familyTitle} ${tierNumber(a.tier)}`,
              amount: ACHIEVEMENT_TIER_XP[a.tier],
            }));
        } catch (err) {
          console.error("Failed to determine which achievements this game unlocked:", err);
        }
      }

      setXpBreakdown(
        achievementLines.length > 0
          ? [...breakdown, ...achievementLines]
          : achievementBonus > 0
            ? [...breakdown, { label: "Achievements unlocked", amount: achievementBonus }]
            : breakdown
      );
      const didLevelUp = after.level > beforeLevel;
      if (didLevelUp) setLeveledUpTo(after.level);
      // Same "don't layer two chimes at once" priority the round/game-win
      // effect in game/page.tsx already uses for its own overlapping case —
      // a level up already means real progress happened this game, so it
      // takes priority over the smaller achievement ping rather than both
      // firing together and clashing.
      if (didLevelUp) {
        playLevelUp();
      } else if (achievementLines.length > 0 || achievementBonus > 0) {
        playAchievementUnlock();
      }
    }
    // `level` is only read for the before/after diff — it must not retrigger
    // a fresh save as PlayerLevelProvider's own state updates after refresh().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, roundHistory, user, getSessionCounters, clearSessionCounters, refreshLevel, gameId]);

  useEffect(() => {
    // Tutorial games are scripted practice, and Daily Deal is its own
    // separate local streak (see the effect below) — neither ever touches
    // Supabase, so neither can inflate stats/achievements or count toward
    // "games played." trackStats is New Game's own opt-out (offered for 2+
    // pass-and-play human players) — same rule, skip the write outright.
    if (recordedRef.current || !supabase || !user || isTutorial || isDailyDeal || !trackStats) return;
    recordedRef.current = true;
    attemptSave();
  }, [user, isTutorial, isDailyDeal, trackStats, attemptSave]);

  // Local-only, and deliberately separate from the Supabase save above —
  // see dailyDealStore.ts's own doc for why this needs no sign-in and never
  // touches real stats. recordDailyDealResult is itself idempotent (a no-op
  // once today's already recorded), so the ref here is just to avoid a
  // redundant localStorage read/write on every re-render, not correctness.
  const dailyDealRecordedRef = useRef(false);
  const [dailyDealState, setDailyDealState] = useState<DailyDealState | null>(null);
  useEffect(() => {
    if (!isDailyDeal || dailyDealRecordedRef.current) return;
    dailyDealRecordedRef.current = true;
    setDailyDealState(recordDailyDealResult(state));
  }, [isDailyDeal, state]);

  // Without live multiplayer, a shared result is this game's only social
  // loop — the sole way one player's game becomes someone else's reason to
  // open the app. Built from the exact standings/isTie/winners this screen
  // already computes above, so it can never drift from what's actually on
  // screen. Never called during a tutorial — see the button's own !isTutorial
  // guard below (a scripted practice round isn't a result worth sharing).
  function shareText(): string {
    const headline = isTie
      ? `${joinNames(winners.map((w) => w.name))} tied in Books & Runs!`
      : `${winners[0].name} won Books & Runs!`;
    const scores = standings.map((p) => `${p.name} ${p.cumulativeScore}`).join(" · ");
    return `🃏 ${headline}\n${scores}`;
  }

  async function handleShare() {
    const text = shareText();
    // navigator.share (where available — mainly mobile browsers and
    // Capacitor's iOS wrapper) hands the OS's own native share sheet a
    // separate url field rather than one it has to parse back out of the
    // text itself.
    if (navigator.share) {
      try {
        await navigator.share({ text, url: window.location.origin });
      } catch {
        // The share sheet itself throws if the player just cancels it —
        // not a real failure worth surfacing as one.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${window.location.origin}`);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2000);
    } catch {
      setShareState("error");
    }
  }

  function playAgain() {
    quitToHome();
    router.push("/new-game");
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
      <div className="text-center">
        <p className="text-sm uppercase tracking-wide text-[var(--faint)]">
          {isTutorial ? "Tutorial complete" : isDailyDeal ? "Daily Deal" : "Game over"}
        </p>
        {!isTutorial && wentOut && (
          <p className="mt-1 text-base font-semibold text-[var(--muted)]">{wentOut.name} went out!</p>
        )}
        <h1 className="win-announce mt-1 text-3xl font-bold text-[var(--heading)]">
          {isTutorial
            ? "Nice work!"
            : isTie
              ? `${joinNames(winners.map((w) => w.name))} tied!`
              : `${winners[0].name} won!`}
        </h1>
        {isTutorial && (
          <p className="mt-2 text-sm text-[var(--muted)]">
            You just played a full round — draw, meld, discard, and everything in between. This
            practice round didn&apos;t count toward your stats or achievements. Ready for a real
            game?
          </p>
        )}
      </div>

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
              <span className="font-semibold text-[var(--heading)]">{p.cumulativeScore} pts</span>
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
            {shareState === "copied" ? "Copied to clipboard ✓" : shareState === "error" ? "Couldn't copy — try again" : "Share result"}
          </button>
        </div>
      )}

      {isTutorial && (
        <div className="rounded-xl bg-[var(--panel-soft)] p-4 text-sm text-[var(--muted)]">
          <p className="font-semibold text-[var(--heading)]">How scoring works</p>
          <p className="mt-1">
            Lower is better. Only cards left in your hand when the round ends count against
            you — anything melded or laid off is free. In a full game, whoever has the lowest
            total score after every round wins.
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <li>3 – 9: 5 pts each</li>
            <li>10, J, Q, K: 10 pts each</li>
            <li>Ace: 15 pts each</li>
            <li>Wild (2): 20 pts each</li>
            <li>Joker: 50 pts each</li>
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
            {dailyDealState.streak}-day streak
          </p>
          <p className="mt-1 text-xs text-[var(--faint)]">
            Best streak: {dailyDealState.bestStreak}. Come back tomorrow for the next one.
          </p>
        </div>
      )}

      {!isTutorial && !isDailyDeal && user && !trackStats && (
        <p className="text-center text-xs text-[var(--faint)]">
          Stats weren&apos;t tracked for this game — you turned that off on the New Game screen.
        </p>
      )}

      {!isTutorial && !isDailyDeal && user && trackStats && (
        <div className="text-center text-xs text-[var(--faint)]">
          <p>
            {saved === "saving" && "Saving to your stats…"}
            {saved === "saved" && "Saved to your stats."}
            {saved === "error" && "Couldn't save to your stats — check your connection."}
          </p>
          {saved === "error" && (
            <button
              onClick={() => attemptSave()}
              className="mt-1 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
            >
              Try again
            </button>
          )}
          {saved === "saved" && xpGained !== null && (
            <div className="mt-1">
              <p className="text-sm font-semibold text-[var(--accent)]">
                +{xpGained} XP
                {leveledUpTo !== null && (
                  <span className="level-up-pulse ml-1 inline-block font-bold">
                    — Level up! Now level {leveledUpTo}
                  </span>
                )}
              </p>
              {xpBreakdown.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {xpBreakdown.map((item, i) => (
                    <li key={i} className="line-enter" style={{ animationDelay: `${i * 70}ms` }}>
                      +{item.amount} XP — {item.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
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
            {isTutorial ? "Play a real game" : "Play again"}
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
          Home
        </button>
      </div>
    </main>
  );
}
