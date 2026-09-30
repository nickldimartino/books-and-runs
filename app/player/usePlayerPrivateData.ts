import type { SupabaseClient, User } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACHIEVEMENT_TIERS,
  AchievementInstance,
  AchievementProgressState,
  AchievementTier,
  allAchievements,
  EMPTY_PROGRESS_STATE,
  tierNumber,
} from "@/achievements";
import { findAvatarFrameOption, findTitleOption } from "../lib/profileCosmetics";
import { isCosmeticUnlocked, makeUnlockContext, UnlockContext } from "../lib/cosmeticUnlocks";
import { findBannerOption } from "../lib/bannerPresets";
import { findPremiumEmojiOption, isPremiumEmojiUnlocked } from "../lib/avatarPresets";
import { useEntitlements } from "../lib/entitlementsStore";
import {
  LeaderboardEntry,
  MAX_SHOWCASE_ITEMS,
  updateLeaderboardAvatarFrame,
  updateLeaderboardBadge,
  updateLeaderboardBanner,
  updateLeaderboardShowcase,
  updateLeaderboardTitle,
} from "../lib/leaderboardStore";
import { EMPTY_MP_STATS, getMyMpHistory, getMyMpStats, MpHistoryEntry, MpStats } from "../lib/mpStore";
import { loadPendingSessionCounters, withSessionCounters } from "../lib/pendingProgress";
import type { RoundHistoryEntry } from "../lib/recordGameResult";
import type { LevelProgress } from "@/leveling";
import { supabase } from "../lib/supabaseClient";

export const DIFFICULTIES = ["beginner", "easy", "medium", "hard", "expert"];
const PAST_GAMES_LIMIT = 10;

export interface PlayerStats {
  games_played: number;
  games_won: number;
  games_tied: number;
  best_score: number | null;
  worst_score: number | null;
  average_score: number | null;
  wins_by_difficulty: Record<string, number>;
}

export interface GameHistoryRow {
  id: string;
  opponents: { name: string; difficulty: string | null }[];
  winner: string;
  winner_score: number | null;
  rounds: RoundHistoryEntry[] | null;
  played_at: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Everything that only exists once you're looking at YOUR OWN profile: the
 * old /stats page's data (player_stats/game_history/achievement_counters/MP
 * stats), the achievement math derived from it, the trophy-case (showcase)
 * editor, and the unlock context + self-heal effect that keeps an equipped
 * cosmetic from staying over-privileged after a gate tightens or a stat
 * resets. One hook because the unlock context genuinely needs data from
 * every one of those sources (progress, isSupporter, worst/average score,
 * owned Boutique skus) — splitting it further would just mean threading the
 * same handful of values through another prop boundary.
 */
export function usePlayerPrivateData(
  user: User | null,
  isSelf: boolean,
  entry: LeaderboardEntry | null,
  setEntry: (updater: (prev: LeaderboardEntry | null) => LeaderboardEntry | null) => void,
  level: LevelProgress | null
) {
  const [privateStats, setPrivateStats] = useState<PlayerStats | null>(null);
  const [history, setHistory] = useState<GameHistoryRow[]>([]);
  const [progress, setProgress] = useState<AchievementProgressState>(EMPTY_PROGRESS_STATE);
  const [dailyDealBestStreak, setDailyDealBestStreak] = useState<number | null>(null);
  // Whether this account has ever completed a tip (migration 0043's
  // supporter_payments) or a Boutique purchase (migration 0085's
  // purchases) — both written only by the stripe-webhook function, so this
  // is a read of real ground truth, not anything self-reported.
  const [isSupporter, setIsSupporter] = useState(false);
  const [mpStats, setMpStats] = useState<MpStats | null>(null);
  const [mpHistory, setMpHistory] = useState<MpHistoryEntry[]>([]);
  const [privateLoading, setPrivateLoading] = useState(true);
  // Distinct from "privateStats is null because you haven't played yet" — a
  // query error (e.g. an unapplied migration) also leaves it null.
  const [privateStatsError, setPrivateStatsError] = useState(false);

  useEffect(() => {
    if (!supabase || !user || !isSelf) {
      setPrivateLoading(false);
      return;
    }
    const client: SupabaseClient = supabase;
    setPrivateLoading(true);
    setPrivateStatsError(false);
    Promise.all([
      client
        .from("player_stats")
        .select("games_played, games_won, games_tied, best_score, worst_score, average_score, wins_by_difficulty")
        .eq("user_id", user.id)
        .maybeSingle<PlayerStats>(),
      client
        .from("game_history")
        .select("id, opponents, winner, winner_score, rounds, played_at")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false })
        .limit(PAST_GAMES_LIMIT),
      client
        .from("achievement_counters")
        .select("counters")
        .eq("user_id", user.id)
        .maybeSingle<{ counters: Record<string, number> }>(),
      client
        .from("leaderboard_entries")
        .select("daily_deal_best_streak")
        .eq("user_id", user.id)
        .maybeSingle<{ daily_deal_best_streak: number }>(),
      // Best-effort (needs migrations 0010/0011).
      getMyMpStats(client).catch(() => ({ ...EMPTY_MP_STATS })),
      // Needs migration 0043 — a query error (an unmigrated project, no
      // such table yet) resolves with data: null same as any other
      // Supabase error, never rejects, so `?? []` alone already covers it.
      client
        .from("supporter_payments")
        .select("user_id")
        .eq("user_id", user.id)
        .limit(1)
        .then((res) => res.data ?? []),
      // Any completed Boutique purchase also counts as supporting the
      // developer, same as a tip — needs migration 0085. `purchases` rows
      // only ever come from a real Stripe checkout (the launch-grandfather
      // migration writes `entitlements` only, never `purchases`), so this
      // is exactly "has this account ever paid for anything," not "owns a
      // grandfathered item."
      client
        .from("purchases")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .then((res) => res.data ?? []),
    ]).then(([statsRes, historyRes, countersRes, dailyDealRes, mp, supporterRows, purchaseRows]) => {
      if (statsRes.error) {
        setPrivateStatsError(true);
      } else {
        setPrivateStats(statsRes.data);
      }
      setHistory((historyRes.data as GameHistoryRow[]) ?? []);
      setMpStats(mp);
      setProgress({
        counters: countersRes.data?.counters ?? {},
        gamesPlayed: statsRes.data?.games_played ?? 0,
        gamesWon: statsRes.data?.games_won ?? 0,
        bestScore: statsRes.data?.best_score ?? null,
        winsByDifficulty: statsRes.data?.wins_by_difficulty ?? {},
        mpGamesPlayed: mp.played,
        mpGamesWon: mp.won,
        mpBestWinStreak: mp.bestWinStreak,
      });
      setDailyDealBestStreak(dailyDealRes.data?.daily_deal_best_streak ?? 0);
      setIsSupporter(supporterRows.length > 0 || purchaseRows.length > 0);
      setPrivateLoading(false);
    });

    getMyMpHistory(client, 20).then(setMpHistory).catch(() => setMpHistory([]));
  }, [user, isSelf]);

  // Every unlock check on this page (the self-heal below, and each
  // picker's own locked/unlocked state) reads from this one context —
  // built from the live level (self-view only has that; see displayLevel's
  // own doc) plus whatever this account's entry/progress already say.
  // Only ever meaningful in a self-view, but harmless to compute either
  // way since nothing outside isSelf-gated code reads it.
  // Only ever meaningful (and only ever fetched) in a self-view — a
  // signed-out or someone-else's-profile read costs nothing extra since
  // useEntitlements reads as an empty set without a matching userId.
  const { ownedSkus } = useEntitlements(supabase, isSelf ? user?.id : undefined);
  const unlockCtx: UnlockContext = useMemo(
    () =>
      makeUnlockContext({
        level: level?.level ?? entry?.level ?? 0,
        progress,
        gamesPlayed: entry?.games_played ?? 0,
        dailyDealBestStreak: entry?.daily_deal_best_streak ?? 0,
        weeklyChallengeBestStreak: entry?.weekly_challenge_best_streak ?? 0,
        isCreator: entry?.is_creator ?? false,
        isSupporter,
        ownedSkus,
        // Both already loaded on this page for the Stats section below —
        // no new fetch needed for any of the 4 newer requirement_kinds.
        worstScore: privateStats?.worst_score ?? null,
        averageScore: privateStats?.average_score ?? null,
        gamesTied: privateStats?.games_tied ?? 0,
        mpBestWinStreak: entry?.mp_best_win_streak ?? 0,
      }),
    [level, entry, progress, isSupporter, privateStats, ownedSkus]
  );

  // Self-heal: an equipped cosmetic can end up over-privileged relative to
  // today's live level/progress — stale data from before a gate was
  // tightened, or account stats that changed after the fact (e.g. a reset
  // for testing). Runs once per profile load, after both the live level
  // and this account's own achievement progress have loaded, and clears
  // anything that no longer passes its own unlock check rather than
  // leaving it looking permanently (and incorrectly) earned.
  const revalidatedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase || !user || !isSelf || !entry || !level || privateLoading) return;
    if (revalidatedForRef.current === entry.user_id) return;
    revalidatedForRef.current = entry.user_id;
    const client = supabase;

    const frameOption = findAvatarFrameOption(entry.avatar_frame);
    if (frameOption?.unlock && !isCosmeticUnlocked(frameOption.unlock, unlockCtx)) {
      updateLeaderboardAvatarFrame(client, user.id, null)
        .then(() => setEntry((prev) => (prev ? { ...prev, avatar_frame: null } : prev)))
        .catch((err) => console.error("Failed to clear an over-privileged avatar frame:", err));
    }

    const titleOption = findTitleOption(entry.title);
    if (titleOption?.unlock && !isCosmeticUnlocked(titleOption.unlock, unlockCtx)) {
      updateLeaderboardTitle(client, user.id, null)
        .then(() => setEntry((prev) => (prev ? { ...prev, title: null } : prev)))
        .catch((err) => console.error("Failed to clear an over-privileged title:", err));
    }

    const bannerOption = findBannerOption(entry.banner);
    if (bannerOption?.unlock && !isCosmeticUnlocked(bannerOption.unlock, unlockCtx)) {
      updateLeaderboardBanner(client, user.id, null)
        .then(() => setEntry((prev) => (prev ? { ...prev, banner: null } : prev)))
        .catch((err) => console.error("Failed to clear an over-privileged banner:", err));
    }

    const badgeOption = entry.badge ? findPremiumEmojiOption(entry.badge) : null;
    if (badgeOption && !isPremiumEmojiUnlocked(badgeOption, unlockCtx)) {
      updateLeaderboardBadge(client, user.id, null)
        .then(() => setEntry((prev) => (prev ? { ...prev, badge: null } : prev)))
        .catch((err) => console.error("Failed to clear an over-privileged badge:", err));
    }
  }, [user, isSelf, entry, level, unlockCtx, privateLoading, setEntry]);

  const achievements = useMemo(() => allAchievements(progress), [progress]);
  const unlocked = useMemo(() => achievements.filter((a) => a.unlocked), [achievements]);
  // Same "closest goal" nudge Home already shows for its own card — surfaced
  // here too, since it's exactly the kind of thing a profile visit is for.
  const [pendingSessionCounters, setPendingSessionCounters] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (isSelf) setPendingSessionCounters(loadPendingSessionCounters());
  }, [isSelf]);
  const closestAchievement = useMemo<AchievementInstance | null>(
    () =>
      allAchievements(withSessionCounters(progress, pendingSessionCounters))
        .filter((a) => !a.unlocked && a.progressFraction > 0 && a.progressFraction < 1)
        .sort((a, b) => b.progressFraction - a.progressFraction)[0] ?? null,
    [progress, pendingSessionCounters]
  );
  const masteredFamilies = useMemo(() => {
    const per = new Map<string, number>();
    for (const a of unlocked) per.set(a.familyId, (per.get(a.familyId) ?? 0) + 1);
    return [...per.values()].filter((n) => n === ACHIEVEMENT_TIERS.length).length;
  }, [unlocked]);
  const rarest = useMemo(() => {
    for (const tier of [...ACHIEVEMENT_TIERS].reverse()) {
      const hit = unlocked.find((a) => a.tier === tier);
      if (hit) return hit;
    }
    return null;
  }, [unlocked]);
  const toughestBeaten = useMemo(() => {
    for (const d of [...DIFFICULTIES].reverse()) {
      if ((privateStats?.wins_by_difficulty?.[d] ?? 0) > 0) return d;
    }
    return null;
  }, [privateStats]);
  const unlockedByTier = useMemo(() => {
    const m = Object.fromEntries(ACHIEVEMENT_TIERS.map((tier) => [tier, 0])) as Record<AchievementTier, number>;
    for (const a of unlocked) m[a.tier] += 1;
    return m;
  }, [unlocked]);

  // ── Trophy case picker (self only) — the highest unlocked tier per
  // family, so a family you've mastered doesn't also clutter the picker
  // with its own already-superseded beginner/easy/etc. entries.
  const pickableTrophies = useMemo(() => {
    const bestPerFamily = new Map<string, AchievementInstance>();
    for (const a of unlocked) {
      const existing = bestPerFamily.get(a.familyId);
      if (!existing || tierNumber(a.tier) > tierNumber(existing.tier)) bestPerFamily.set(a.familyId, a);
    }
    return [...bestPerFamily.values()].sort((a, b) => tierNumber(b.tier) - tierNumber(a.tier));
  }, [unlocked]);

  const [showcaseSelection, setShowcaseSelection] = useState<string[]>([]);
  const [showcaseSaveState, setShowcaseSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    if (entry && isSelf) setShowcaseSelection(entry.showcase);
  }, [entry, isSelf]);

  function toggleShowcaseItem(key: string) {
    setShowcaseSelection((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MAX_SHOWCASE_ITEMS) return prev;
      return [...prev, key];
    });
    setShowcaseSaveState("idle");
  }

  async function saveShowcase() {
    if (!supabase || !user) return;
    setShowcaseSaveState("saving");
    try {
      await updateLeaderboardShowcase(supabase, user.id, showcaseSelection);
      setEntry((prev) => (prev ? { ...prev, showcase: showcaseSelection } : prev));
      setShowcaseSaveState("saved");
    } catch (err) {
      console.error("Failed to save trophy case:", err);
      setShowcaseSaveState("error");
    }
  }

  return {
    privateStats,
    history,
    progress,
    dailyDealBestStreak,
    isSupporter,
    mpStats,
    mpHistory,
    privateLoading,
    privateStatsError,
    unlockCtx,
    achievements,
    unlocked,
    closestAchievement,
    masteredFamilies,
    rarest,
    toughestBeaten,
    unlockedByTier,
    pickableTrophies,
    showcaseSelection,
    showcaseSaveState,
    toggleShowcaseItem,
    saveShowcase,
  };
}

export type PlayerPrivateData = ReturnType<typeof usePlayerPrivateData>;
