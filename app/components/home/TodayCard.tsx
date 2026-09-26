"use client";

// Home's single "Today" card: Daily Deal, Weekly Challenge and the rotating
// Quests behind one segmented control (they used to be three stacked cards).
// The streak + streak-shield row is rendered ONCE, for whichever of
// Daily / Weekly is selected, at the top of the panel.
//
// Which segment opens: the one the player picked last (remembered per device,
// lib/todayTab.ts), else — computed once when the data is ready, then left
// alone so the card never flips under a finger — Quests after a fresh payout,
// Daily if it isn't played yet, Weekly if that isn't, else Quests. A small dot
// marks segments with something waiting (signed in only: that's the only time
// we know the played state).
//
// Layout-shift notes: the panel reserves a minimum height (`.today-body`,
// keyed to `html[data-today-tab]`, which public/init.js stamps from the
// remembered tab before first paint), and the Quests segment is prerendered
// but hidden until this device has started a game (`data-home-quests`) — the
// same first-session calm the standalone Quests card had.

import { KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { UseQuests } from "../../lib/useQuests";
import { useT } from "../../lib/i18n/LocaleProvider";
import {
  DailyDealState,
  localDateKey,
  playedToday,
} from "../../lib/dailyDealStore";
import { WeeklyChallengeState, isoWeekKey, playedThisWeek } from "../../lib/weeklyChallengeStore";
import { defaultTodayTab, loadTodayTab, resolveTodayTab, saveTodayTab, TodayTab, TODAY_TABS } from "../../lib/todayTab";
import { dailyDisplayStreak, weeklyDisplayStreak } from "@/streakShield";
import { QuestsCard } from "./QuestsCard";
import { StreakShields } from "./StreakShields";

/** The Daily Deal streak worth showing right now: last played today or
 * yesterday, or — with a streak shield in hand — the day before that (the
 * shield covers the one missed day as soon as the deal is played). */
export function displayedDailyStreak(state: DailyDealState | null): number {
  if (!state) return 0;
  return dailyDisplayStreak(state.streak, state.lastPlayedDate, state.shields, localDateKey());
}

export function dailyStreakAlive(state: DailyDealState | null): boolean {
  return displayedDailyStreak(state) > 0;
}

export function displayedWeeklyStreak(state: WeeklyChallengeState | null): number {
  if (!state) return 0;
  return weeklyDisplayStreak(state.streak, state.lastPlayedWeek, state.shields, isoWeekKey());
}

export function TodayCard({
  signedIn,
  dailyDeal,
  weeklyChallenge,
  hasDailyDealSave,
  hasWeeklyChallengeSave,
  onPlayDaily,
  onPlayWeekly,
  quests,
  questsAvailable,
  isFirstSession,
}: {
  signedIn: boolean;
  dailyDeal: DailyDealState | null;
  weeklyChallenge: WeeklyChallengeState | null;
  hasDailyDealSave: boolean;
  hasWeeklyChallengeSave: boolean;
  onPlayDaily: () => void;
  onPlayWeekly: () => void;
  quests: UseQuests;
  /** False before the first game (calm first session) or when the server side
   * for quests isn't available. */
  questsAvailable: boolean;
  isFirstSession: boolean;
}) {
  const { t } = useT();

  const dailyPlayed = dailyDeal ? playedToday(dailyDeal) : false;
  const weeklyPlayed = weeklyChallenge ? playedThisWeek(weeklyChallenge) : false;
  const dailyStreak = displayedDailyStreak(dailyDeal);
  const weeklyStreak = displayedWeeklyStreak(weeklyChallenge);
  const questJustCompleted = quests.justClaimed.length > 0;

  // ── which segment ────────────────────────────────────────────────────────
  const [stored, setStored] = useState<TodayTab | null>(null);
  useLayoutEffect(() => setStored(loadTodayTab()), []);
  const ready = !signedIn || (!!dailyDeal && !!weeklyChallenge);
  const [auto, setAuto] = useState<TodayTab | null>(null);
  useEffect(() => {
    if (auto || !ready) return;
    setAuto(
      defaultTodayTab({
        questJustCompleted,
        dailyPlayedToday: signedIn ? dailyPlayed : false,
        weeklyPlayedThisWeek: signedIn ? weeklyPlayed : false,
        questsAvailable,
      })
    );
  }, [auto, ready, questJustCompleted, dailyPlayed, weeklyPlayed, signedIn, questsAvailable]);

  const tab = resolveTodayTab(stored, auto, questsAvailable);

  function select(next: TodayTab) {
    setStored(next);
    saveTodayTab(next);
  }

  const tabs = TODAY_TABS;
  const tabRefs = useRef<Partial<Record<TodayTab, HTMLButtonElement | null>>>({});
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const visible = tabs.filter((x) => x !== "quests" || questsAvailable);
    const i = visible.indexOf(tab);
    let next: TodayTab | null = null;
    if (e.key === "ArrowRight") next = visible[(i + 1) % visible.length];
    else if (e.key === "ArrowLeft") next = visible[(i - 1 + visible.length) % visible.length];
    else if (e.key === "Home") next = visible[0];
    else if (e.key === "End") next = visible[visible.length - 1];
    if (!next) return;
    e.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  }

  const dots: Record<TodayTab, boolean> = {
    daily: signedIn && !!dailyDeal && !dailyPlayed && tab !== "daily",
    weekly: signedIn && !!weeklyChallenge && !weeklyPlayed && tab !== "weekly",
    quests: questJustCompleted && tab !== "quests",
  };
  const labels: Record<TodayTab, string> = {
    daily: t("today.daily"),
    weekly: t("today.weekly"),
    quests: t("quests.title"),
  };

  // ── daily / weekly panel content ─────────────────────────────────────────
  const dailyShieldCovering =
    dailyStreak > 0 && !dailyPlayed && dailyDeal?.lastPlayedDate !== localDateKey(new Date(Date.now() - 86_400_000));
  const weeklyShieldCovering =
    weeklyStreak > 0 &&
    !weeklyPlayed &&
    weeklyChallenge?.lastPlayedWeek !== isoWeekKey(new Date(Date.now() - 7 * 86_400_000));

  const ctaClass = `flex h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold ${
    isFirstSession
      ? "border border-[var(--accent)]/50 text-[var(--accent)]"
      : "bg-[var(--accent)] text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
  }`;

  function challengePanel(kind: "daily" | "weekly") {
    const daily = kind === "daily";
    const streak = daily ? dailyStreak : weeklyStreak;
    const played = daily ? dailyPlayed : weeklyPlayed;
    const shieldCovering = daily ? dailyShieldCovering : weeklyShieldCovering;
    const hasSave = daily ? hasDailyDealSave : hasWeeklyChallengeSave;
    const state = daily ? dailyDeal : weeklyChallenge;
    return (
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--heading)]">
            {daily ? t("home.dailyDeal.title") : t("home.weeklyChallenge.title")}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {!signedIn
              ? daily
                ? t("home.dailyDeal.signInHint")
                : t("home.weeklyChallenge.signInHint")
              : streak > 0
                ? daily
                  ? t("home.dailyDeal.streak", { count: streak })
                  : t("home.weeklyChallenge.streak", { count: streak })
                : daily
                  ? t("home.dailyDeal.oneSeeded")
                  : t("home.weeklyChallenge.description")}
          </p>
          {played && (
            <p className="mt-0.5 text-[10px] text-[var(--faint)]">
              {daily ? t("home.dailyDeal.streakProtected") : t("home.weeklyChallenge.streakProtected")}
            </p>
          )}
          {shieldCovering && (
            <p className="mt-0.5 text-[10px] text-[var(--faint)]">
              {daily ? t("home.dailyDeal.shieldCovering") : t("home.weeklyChallenge.shieldCovering")}
            </p>
          )}
          {signedIn && state && (
            <StreakShields
              count={state.shields}
              max={daily ? 2 : 1}
              explainer={daily ? t("streakShield.dailyExplainer") : t("streakShield.weeklyExplainer")}
              testId={daily ? "daily-shields" : "weekly-shields"}
            />
          )}
          {!played && hasSave && <p className="mt-0.5 text-[10px] text-[var(--faint)]">{t("home.leftInProgress")}</p>}
        </div>
        <button onClick={daily ? onPlayDaily : onPlayWeekly} className={ctaClass}>
          {played
            ? t("home.playAgain")
            : hasSave
              ? daily
                ? t("home.dailyDeal.continue")
                : t("home.weeklyChallenge.continue")
              : daily
                ? t("home.dailyDeal.play")
                : t("home.weeklyChallenge.play")}
        </button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="today-heading"
      data-testid="today-card"
      className={`rounded-xl border px-4 py-3 text-left ${
        isFirstSession ? "border-[var(--border)]" : "border-[var(--border)] bg-[var(--panel)]"
      }`}
    >
      <h2 id="today-heading" className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
        {t("today.title")}
      </h2>
      <div
        role="tablist"
        aria-label={t("today.title")}
        onKeyDown={onKeyDown}
        className="mt-2 flex gap-1 rounded-lg bg-[var(--panel-soft)] p-1"
      >
        {tabs.map((id) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            role="tab"
            id={`today-tab-${id}`}
            type="button"
            aria-selected={tab === id}
            aria-controls="today-panel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => select(id)}
            // Prerendered for everyone, hidden pre-paint until this device has
            // started a game (html[data-started], public/init.js).
            data-home-quests={id === "quests" ? "" : undefined}
            hidden={id === "quests" && !questsAvailable}
            className={`relative flex h-9 min-w-0 flex-1 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
              tab === id
                ? "bg-[var(--accent)] text-[var(--on-accent)] shadow"
                : "text-[var(--muted)] hover:text-[var(--heading)]"
            }`}
          >
            <span className="truncate">{labels[id]}</span>
            {dots[id] && (
              <>
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--panel-soft)]"
                  data-testid={`today-dot-${id}`}
                />
                <span className="sr-only">{t("today.needsAttention")}</span>
              </>
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="today-panel" aria-labelledby={`today-tab-${tab}`} className="today-body mt-3">
        {tab === "quests" ? (
          <QuestsCard views={quests.views} earning={signedIn} now={quests.now} embedded />
        ) : (
          challengePanel(tab)
        )}
      </div>
    </section>
  );
}
