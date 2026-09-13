"use client";

// A player's profile — reachable by clicking a name on the Leaderboard or
// Friends page (see leaderboardStore.ts's playerProfileHref), or from
// Home's own "Profile" tile/level badge for your own. One page, in two
// parts:
//
//  - The top is public: the same snapshot the Leaderboard already exposes
//    (leaderboard_entries — any signed-in account can read any row, see
//    migration 0006) as a proper profile card — avatar, display name, bio,
//    level, and every public stat column. This part renders identically
//    whether you're looking at your own profile or someone else's.
//  - Viewing your own additionally shows "Edit profile" (avatar, display
//    name, bio — which is why those live here now, not the Account page)
//    and, below that, a private section only you can see: the detailed
//    stats breakdown, achievement showcase, and game history that used to
//    live on its own separate /stats page. Merged here instead of kept
//    apart — a player only ever has the one profile.
//
// A query param, not a dynamic route segment: this app is a static export
// (next.config.ts), and the Friends page's own `?add=CODE` link already
// uses the same pattern.

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ACHIEVEMENT_FAMILIES,
  ACHIEVEMENT_TIERS,
  AchievementCategory,
  AchievementInstance,
  AchievementProgressState,
  AchievementTier,
  allAchievements,
  EMPTY_PROGRESS_STATE,
  MP_WIN_RATE_MIN_GAMES,
  tierNumber,
  WIN_RATE_MIN_GAMES,
} from "@/achievements";
import { useAuth } from "../AuthContext";
import { usePlayerLevel } from "../PlayerLevelContext";
import { AchievementIcon } from "../components/AchievementIcons";
import { EmptyState } from "../components/EmptyState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { PremiumBadgeIcon } from "../components/PremiumBadgeIcon";
import {
  COLOR_OPTIONS,
  EMOJI_OPTIONS,
  isPremiumEmojiUnlocked,
  PREMIUM_EMOJI_OPTIONS,
  premiumEmojiRequirementLabel,
} from "../lib/avatarPresets";
import { InvalidAvatarFileError, uploadAvatarPhoto } from "../lib/avatarUpload";
import { formatScore } from "../lib/formatScore";
import { getFriendRequests, getFriends, sendFriendRequest } from "../lib/friendsStore";
import {
  AvatarInfo,
  DisplayNameTakenError,
  LeaderboardEntry,
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  MAX_SHOWCASE_ITEMS,
  PremiumEmojiLockedError,
  displayNameFor,
  isDisplayNameAvailable,
  reportProfilePhoto,
  revertToEmojiAvatar,
  showcaseKeyFor,
  syncLeaderboardStats,
  updateLeaderboardAvatarEmoji,
  updateLeaderboardAvatarPhoto,
  updateLeaderboardBio,
  updateLeaderboardDisplayName,
  updateLeaderboardShowcase,
} from "../lib/leaderboardStore";
import { EMPTY_MP_STATS, getMyMpHistory, getMyMpStats, MpHistoryEntry, MpStats } from "../lib/mpStore";
import { RoundHistoryEntry } from "../lib/recordGameResult";
import { supabase } from "../lib/supabaseClient";

const TOTAL_ACHIEVEMENTS = ACHIEVEMENT_FAMILIES.length * ACHIEVEMENT_TIERS.length;
const TIER_LABEL: Record<AchievementTier, string> = {
  beginner: "Beginner",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};
const DIFFICULTIES = ["beginner", "easy", "medium", "hard", "expert"];
const PAST_GAMES_LIMIT = 10;

// Medal-ring colors for the trophy case — bronze/silver/gold/platinum/
// diamond, matching the beginner→expert tier language used everywhere else
// in the achievement system.
const TIER_RING_COLOR: Record<AchievementTier, string> = {
  beginner: "#CD7F32",
  easy: "#B0B8C1",
  medium: "#F5C518",
  hard: "#4FD1C5",
  expert: "#38BDF8",
};

const FAMILY_BY_ID = new Map(ACHIEVEMENT_FAMILIES.map((f) => [f.id, f]));

interface ShowcaseItem {
  key: string;
  familyId: string;
  familyTitle: string;
  category: AchievementCategory;
  tier: AchievementTier;
}

/** Parses a "familyId:tier" showcase entry against the live family list —
 * returns null for anything that no longer resolves (a family renamed or
 * removed since the account pinned it), so a stale entry just quietly
 * doesn't render instead of crashing the page. */
function resolveShowcaseItem(key: string): ShowcaseItem | null {
  const sep = key.lastIndexOf(":");
  if (sep === -1) return null;
  const familyId = key.slice(0, sep);
  const tier = key.slice(sep + 1) as AchievementTier;
  const family = FAMILY_BY_ID.get(familyId);
  if (!family || !ACHIEVEMENT_TIERS.includes(tier)) return null;
  return { key, familyId, familyTitle: family.title, category: family.category, tier };
}

type SaveState = "idle" | "saving" | "saved" | "error";

interface PlayerStats {
  games_played: number;
  games_won: number;
  games_tied: number;
  best_score: number | null;
  worst_score: number | null;
  average_score: number | null;
  wins_by_difficulty: Record<string, number>;
}

interface GameHistoryRow {
  id: string;
  opponents: { name: string; difficulty: string | null }[];
  winner: string;
  winner_score: number | null;
  rounds: RoundHistoryEntry[] | null;
  played_at: string;
}

/**
 * Your final score for this game, or null if it can't be determined (a row
 * from before the `rounds` column existed, or your seat's name colliding
 * with an opponent's). The last entry in `rounds` has every player's final
 * cumulative total keyed by name — "your" name is whichever key isn't a
 * recorded opponent's.
 */
function yourScoreFor(g: GameHistoryRow): number | null {
  if (!g.rounds || g.rounds.length === 0) return null;
  const lastRound = g.rounds[g.rounds.length - 1];
  const opponentNames = new Set(g.opponents.map((o) => o.name));
  const candidates = Object.keys(lastRound.totals).filter((name) => !opponentNames.has(name));
  return candidates.length === 1 ? lastRound.totals[candidates[0]] : null;
}

function PersonAddIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M18 8.5v5M15.5 11h5" />
    </svg>
  );
}

function PersonCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M15 11.5l2 2 4-4" />
    </svg>
  );
}

function formatWinRate(gamesPlayed: number, gamesWon: number): string {
  if (gamesPlayed < WIN_RATE_MIN_GAMES) return "—";
  return `${Math.round((100 * gamesWon) / gamesPlayed)}%`;
}

function formatMpWinRate(mpPlayed: number, mpWon: number): string {
  if (mpPlayed < MP_WIN_RATE_MIN_GAMES) return "—";
  return `${Math.round((100 * mpWon) / mpPlayed)}%`;
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-center">
      <p className="text-lg font-bold tabular-nums text-[var(--heading)]">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--faint)]">{label}</p>
      {sub && <p className="text-[10px] text-[var(--faint)]">{sub}</p>}
    </div>
  );
}

function Highlight({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[var(--panel)] p-4">
      <p className="text-[10px] uppercase tracking-wide text-[var(--faint)]">{label}</p>
      <div className="mt-1 text-sm font-semibold text-[var(--heading)]">{children}</div>
    </div>
  );
}

/** One pinned achievement, rendered as a medal: the achievement system's
 * existing category icon, framed in a ring colored for the tier it was
 * earned at (bronze beginner → diamond expert). */
function TrophyBadge({ item, size = 56 }: { item: ShowcaseItem; size?: number }) {
  return (
    <div className="flex flex-col items-center gap-1" title={`${item.familyTitle} · ${TIER_LABEL[item.tier]}`}>
      <div
        className="grid place-items-center rounded-full p-[3px]"
        style={{ width: size, height: size, backgroundColor: TIER_RING_COLOR[item.tier] }}
      >
        <div className="grid h-full w-full place-items-center rounded-full bg-[var(--panel)]">
          <AchievementIcon category={item.category} className="h-1/2 w-1/2 text-[var(--heading)]" />
        </div>
      </div>
      <p className="max-w-[4.5rem] truncate text-[10px] text-[var(--faint)]">{item.familyTitle}</p>
    </div>
  );
}

/** An unfilled trophy slot — self-view only, a quiet invite to pin one via
 * Edit profile rather than an empty gap. */
function EmptyTrophySlot({ size = 56 }: { size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full border-2 border-dashed border-[var(--border)] text-[var(--faint)]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      +
    </div>
  );
}

/** A blank placeholder for a real account that hasn't synced a
 * leaderboard_entries row yet (never finished a tracked game or Daily Deal
 * — see migration 0006) — a friend can exist, and be viewable, before
 * they've played anything. */
function emptyEntry(userId: string): LeaderboardEntry {
  return {
    user_id: userId,
    display_name: null,
    bio: null,
    avatar_kind: "emoji",
    avatar_emoji: null,
    avatar_color: null,
    avatar_photo_path: null,
    showcase: [],
    level: 0,
    total_xp: 0,
    achievements_unlocked: 0,
    games_played: 0,
    games_won: 0,
    average_score: null,
    worst_score: null,
    daily_deal_streak: 0,
    daily_deal_best_streak: 0,
    mp_games_played: 0,
    mp_games_won: 0,
    mp_best_win_streak: 0,
    updated_at: new Date(0).toISOString(),
  };
}

export default function PlayerProfilePage() {
  const { configured, loading: authLoading, user } = useAuth();
  const { level } = usePlayerLevel();
  const [profileId, setProfileId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setProfileId(new URLSearchParams(window.location.search).get("id"));
  }, []);

  const [entry, setEntry] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const isSelf = !!user && !!profileId && user.id === profileId;

  useEffect(() => {
    if (!supabase || !user || !profileId) return;
    let cancelled = false;
    const client = supabase;
    setLoading(true);
    setLoadError(false);
    (async () => {
      // A self-view self-heals its own row first — same reasoning as
      // Account/Leaderboard's own sync-on-visit (a past failed sync, or an
      // account that predates a stats column entirely).
      if (profileId === user.id) await syncLeaderboardStats(client, profileId).catch(() => {});
      const { data, error } = await client.from("leaderboard_entries").select("*").eq("user_id", profileId).maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("Failed to load profile:", error);
        setLoadError(true);
      } else {
        setEntry((data as LeaderboardEntry | null) ?? emptyEntry(profileId));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, profileId]);

  // Friend status (only meaningful for someone else's profile).
  const [related, setRelated] = useState<"none" | "related" | "requested">("none");
  useEffect(() => {
    if (!supabase || !user || !profileId || isSelf) return;
    Promise.all([getFriends(supabase), getFriendRequests(supabase)])
      .then(([friends, requests]) => {
        const isRelated =
          friends.some((f) => f.userId === profileId) || requests.some((r) => r.otherUserId === profileId);
        setRelated(isRelated ? "related" : "none");
      })
      .catch((err) => console.error("Failed to load friend state:", err));
  }, [user, profileId, isSelf]);

  async function addFriend() {
    if (!supabase || !profileId) return;
    setRelated("requested");
    try {
      await sendFriendRequest(supabase, profileId);
    } catch (err) {
      console.error("Add friend failed:", err);
      setRelated("none");
    }
  }

  // ── Report photo ──────────────────────────────────────────────────────
  const [reportState, setReportState] = useState<"idle" | "open" | "sending" | "sent" | "error">("idle");
  const [reportReason, setReportReason] = useState("");

  async function submitReport(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user || !profileId) return;
    setReportState("sending");
    try {
      await reportProfilePhoto(supabase, user.id, profileId, reportReason.trim() || null);
      setReportState("sent");
    } catch (err) {
      console.error("Failed to report photo:", err);
      setReportState("error");
    }
  }

  // ── Edit profile (self only) — collapsed until asked for ───────────────
  const [editingProfile, setEditingProfile] = useState(false);

  // ── Self-editing: display name ────────────────────────────────────────
  const [nameInput, setNameInput] = useState("");
  const [nameSaveState, setNameSaveState] = useState<SaveState>("idle");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameAvailability, setNameAvailability] = useState<"idle" | "checking" | "available" | "taken">("idle");

  useEffect(() => {
    if (entry && isSelf) setNameInput(entry.display_name ?? "");
  }, [entry, isSelf]);

  // Debounced live availability check as the self-viewer types a new name —
  // best-effort only (see isDisplayNameAvailable's own doc); the actual
  // Save below is what's guaranteed correct.
  useEffect(() => {
    if (!isSelf || !supabase || !user) return;
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === (entry?.display_name ?? "")) {
      setNameAvailability("idle");
      return;
    }
    setNameAvailability("checking");
    const client = supabase;
    const uid = user.id;
    const handle = setTimeout(() => {
      isDisplayNameAvailable(client, trimmed, uid)
        .then((available) => setNameAvailability(available ? "available" : "taken"))
        .catch(() => setNameAvailability("idle"));
    }, 400);
    return () => clearTimeout(handle);
  }, [nameInput, isSelf, entry?.display_name, user]);

  async function handleSaveName(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    setNameError(null);
    const trimmed = nameInput.trim();
    if (trimmed.length === 0) {
      setNameError("Enter a name — leave it blank and pick one later if you're not sure yet.");
      return;
    }
    setNameSaveState("saving");
    try {
      await updateLeaderboardDisplayName(supabase, user.id, trimmed);
      setEntry((prev) => (prev ? { ...prev, display_name: trimmed } : prev));
      setNameSaveState("saved");
    } catch (err) {
      if (err instanceof DisplayNameTakenError) {
        setNameError(err.message);
      } else {
        console.error("Failed to save display name:", err);
      }
      setNameSaveState("error");
    }
  }

  // ── Self-editing: bio ──────────────────────────────────────────────────
  const [bioInput, setBioInput] = useState("");
  const [bioSaveState, setBioSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    if (entry && isSelf) setBioInput(entry.bio ?? "");
  }, [entry, isSelf]);

  async function handleSaveBio(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    setBioSaveState("saving");
    try {
      const trimmed = bioInput.trim();
      await updateLeaderboardBio(supabase, user.id, trimmed.length > 0 ? trimmed : null);
      setEntry((prev) => (prev ? { ...prev, bio: trimmed || null } : prev));
      setBioSaveState("saved");
    } catch (err) {
      console.error("Failed to save bio:", err);
      setBioSaveState("error");
    }
  }

  // ── Self-editing: avatar ───────────────────────────────────────────────
  const [avatarTab, setAvatarTab] = useState<"emoji" | "photo">("emoji");
  const [pendingEmoji, setPendingEmoji] = useState<string | null>(null);
  const [pendingColor, setPendingColor] = useState<string | null>(null);
  const [avatarSaveState, setAvatarSaveState] = useState<SaveState>("idle");
  const [avatarSaveError, setAvatarSaveError] = useState<string | null>(null);
  const [photoState, setPhotoState] = useState<"idle" | "uploading" | "error">("idle");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!entry || !isSelf) return;
    setAvatarTab(entry.avatar_kind === "photo" && entry.avatar_photo_path ? "photo" : "emoji");
    setPendingEmoji(entry.avatar_emoji);
    setPendingColor(entry.avatar_color);
  }, [entry, isSelf]);

  async function saveEmojiAvatar() {
    if (!supabase || !user || !pendingEmoji || !pendingColor) return;
    setAvatarSaveState("saving");
    setAvatarSaveError(null);
    try {
      await updateLeaderboardAvatarEmoji(supabase, user.id, pendingEmoji, pendingColor);
      setEntry((prev) =>
        prev ? { ...prev, avatar_kind: "emoji", avatar_emoji: pendingEmoji, avatar_color: pendingColor } : prev
      );
      setAvatarSaveState("saved");
    } catch (err) {
      if (err instanceof PremiumEmojiLockedError) {
        setAvatarSaveError(err.message);
      } else {
        console.error("Failed to save avatar:", err);
      }
      setAvatarSaveState("error");
    }
  }

  async function handlePhotoChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !supabase || !user) return;
    setPhotoState("uploading");
    setPhotoError(null);
    try {
      const path = await uploadAvatarPhoto(supabase, user.id, file);
      await updateLeaderboardAvatarPhoto(supabase, user.id, path);
      setEntry((prev) =>
        prev ? { ...prev, avatar_kind: "photo", avatar_photo_path: path, updated_at: new Date().toISOString() } : prev
      );
      setPhotoState("idle");
    } catch (err) {
      setPhotoError(err instanceof InvalidAvatarFileError ? err.message : "Couldn't upload that photo — try again.");
      setPhotoState("error");
    }
  }

  async function handleUseEmojiInstead() {
    if (!supabase || !user) return;
    try {
      await revertToEmojiAvatar(supabase, user.id);
      setEntry((prev) => (prev ? { ...prev, avatar_kind: "emoji" } : prev));
    } catch (err) {
      console.error("Failed to switch avatar:", err);
    }
  }

  // ── Private section (self only): the old /stats page's own data ────────
  const [privateStats, setPrivateStats] = useState<PlayerStats | null>(null);
  const [history, setHistory] = useState<GameHistoryRow[]>([]);
  const [progress, setProgress] = useState<AchievementProgressState>(EMPTY_PROGRESS_STATE);
  const [dailyDealBestStreak, setDailyDealBestStreak] = useState<number | null>(null);
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
    const client = supabase;
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
    ]).then(([statsRes, historyRes, countersRes, dailyDealRes, mp]) => {
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
      setPrivateLoading(false);
    });

    getMyMpHistory(client, 20).then(setMpHistory).catch(() => setMpHistory([]));
  }, [user, isSelf]);

  const achievements = useMemo(() => allAchievements(progress), [progress]);
  const unlocked = useMemo(() => achievements.filter((a) => a.unlocked), [achievements]);
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
    const m = Object.fromEntries(ACHIEVEMENT_TIERS.map((t) => [t, 0])) as Record<AchievementTier, number>;
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

  if (!authLoading && !configured) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--heading)]">Profiles aren&apos;t set up yet</h1>
        <p className="text-sm text-[var(--muted)]">This app doesn&apos;t have a Supabase project connected yet.</p>
        <Link href="/" className="mt-2 rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]">
          Back to Home
        </Link>
      </main>
    );
  }

  if (!authLoading && configured && !user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--heading)]">Sign in to see this profile</h1>
        <p className="text-sm text-[var(--muted)]">
          Profiles are only visible to signed-in accounts — not the general public.
        </p>
        <Link href="/sign-in" className="mt-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]">
          Sign in
        </Link>
        <Link href="/" className="rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]">
          Back to Home
        </Link>
      </main>
    );
  }

  if (profileId === null) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--heading)]">No profile to show</h1>
        <p className="text-sm text-[var(--muted)]">This link is missing whose profile to open.</p>
        <Link href="/" className="mt-2 rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]">
          Back to Home
        </Link>
      </main>
    );
  }

  const avatarInfo: AvatarInfo | undefined = entry
    ? {
        kind: entry.avatar_kind,
        emoji: entry.avatar_emoji,
        color: entry.avatar_color,
        photoPath: entry.avatar_photo_path,
      }
    : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <Link href="/" className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]">
        ← Home
      </Link>

      {authLoading || loading || !entry ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-[var(--danger)]">Couldn&apos;t load this profile — check your connection.</p>
      ) : (
        <>
          <PageTip id="player-profile" title={isSelf ? "Your profile" : "Player profiles"}>
            {isSelf
              ? "The top is what other players see on the Leaderboard and Friends list — tap Edit profile to change your name, bio, picture, or pin achievements to your Trophy Case. Leveling up and mastering achievement categories also unlocks exclusive avatar emoji. Everything below the edit section (stats breakdown, achievements, game history) is only ever visible to you."
              : "Every signed-in player has one of these — tap a name anywhere (Leaderboard, Friends) to open it. Add them as a friend right from here."}
          </PageTip>

          {/* ── Public — same for everyone, including your own view ── */}
          <section className="flex flex-col items-center gap-2 text-center">
            <PlayerAvatar avatar={avatarInfo} updatedAt={entry.updated_at} size={88} />
            <h1 className="text-xl font-bold text-[var(--heading)]">{displayNameFor(entry)}</h1>
            <span className="rounded-full bg-[var(--accent)]/15 px-3 py-1 text-xs font-semibold text-[var(--accent)]">
              Level {entry.level}
            </span>
            {entry.bio && <p className="max-w-xs text-sm text-[var(--muted)]">{entry.bio}</p>}

            {!isSelf && (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {related !== "related" && (
                  <button
                    onClick={addFriend}
                    disabled={related === "requested"}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)] disabled:opacity-60"
                  >
                    {related === "requested" ? <PersonCheckIcon /> : <PersonAddIcon />}
                    {related === "requested" ? "Request sent" : "Add friend"}
                  </button>
                )}
                {entry.avatar_kind === "photo" && entry.avatar_photo_path && reportState === "idle" && (
                  <button
                    onClick={() => setReportState("open")}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                  >
                    Report photo
                  </button>
                )}
              </div>
            )}
            {isSelf && (
              <button
                onClick={() => setEditingProfile((v) => !v)}
                className="mt-2 rounded-lg border border-[var(--accent)]/60 px-4 py-1.5 text-xs font-semibold text-[var(--heading)] hover:bg-[var(--panel-soft)]"
              >
                {editingProfile ? "Done editing" : "Edit profile"}
              </button>
            )}

            {(reportState === "open" || reportState === "sending") && (
              <form onSubmit={submitReport} className="mt-2 flex w-full flex-col gap-2 rounded-lg border border-[var(--border)] p-3 text-left">
                <label className="text-xs font-medium text-[var(--muted)]">
                  What&apos;s wrong with this photo? (optional)
                </label>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  maxLength={MAX_REPORT_REASON_LENGTH}
                  rows={2}
                  className="resize-none rounded-lg bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReportState("idle")}
                    disabled={reportState === "sending"}
                    className="flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={reportState === "sending"}
                    className="flex-1 rounded-lg bg-[var(--danger)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {reportState === "sending" ? "Reporting…" : "Report"}
                  </button>
                </div>
              </form>
            )}
            {reportState === "sent" && <p className="text-xs text-[var(--muted)]">Thanks — we&apos;ll take a look.</p>}
            {reportState === "error" && <p className="text-xs text-[var(--danger)]">Couldn&apos;t send that report — try again.</p>}
          </section>

          <section className="grid grid-cols-3 gap-2">
            <StatTile label="Achievements" value={`${entry.achievements_unlocked}/${TOTAL_ACHIEVEMENTS}`} />
            <StatTile label="Total XP" value={entry.total_xp} />
            <StatTile label="Games" value={entry.games_played} />
            <StatTile label="Win rate" value={formatWinRate(entry.games_played, entry.games_won)} />
            <StatTile label="Avg. score" value={formatScore(entry.average_score)} />
            <StatTile label="Worst score" value={formatScore(entry.worst_score)} />
            <StatTile label="Daily streak" value={entry.daily_deal_streak} />
            <StatTile label="Best streak" value={entry.daily_deal_best_streak} />
            <StatTile label="MP wins" value={entry.mp_games_won ?? 0} />
            <StatTile label="MP win rate" value={formatMpWinRate(entry.mp_games_played ?? 0, entry.mp_games_won ?? 0)} />
            <StatTile label="MP streak" value={entry.mp_best_win_streak ?? 0} />
          </section>

          {/* ── Trophy case — public; empty slots only shown to yourself ── */}
          {(entry.showcase.length > 0 || isSelf) && (
            <section>
              <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                Trophy Case
              </h2>
              <div className="flex flex-wrap justify-center gap-3">
                {entry.showcase.map(resolveShowcaseItem).map((item, i) =>
                  item ? <TrophyBadge key={item.key} item={item} /> : <EmptyTrophySlot key={`stale-${i}`} />
                )}
                {isSelf &&
                  Array.from({ length: Math.max(0, MAX_SHOWCASE_ITEMS - entry.showcase.length) }).map((_, i) => (
                    <EmptyTrophySlot key={`empty-${i}`} />
                  ))}
              </div>
            </section>
          )}

          {/* ── Edit profile (self only, collapsed by default) ── */}
          {isSelf && editingProfile && (
            <>
              <section className="flex flex-col gap-3 rounded-xl border border-[var(--border)] p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">Profile picture</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAvatarTab("emoji")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${avatarTab === "emoji" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}
                  >
                    Emoji
                  </button>
                  <button
                    onClick={() => setAvatarTab("photo")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${avatarTab === "photo" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}
                  >
                    Photo
                  </button>
                </div>

                {avatarTab === "emoji" ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-8 gap-1.5">
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => setPendingEmoji(emoji)}
                          aria-label={`Use ${emoji} as your avatar`}
                          className={`grid aspect-square place-items-center rounded-lg text-lg transition ${
                            pendingEmoji === emoji ? "bg-[var(--accent)]/20 ring-2 ring-[var(--accent)]" : "bg-[var(--panel-soft)] hover:bg-[var(--panel)]"
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>

                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)]">
                        Premium — earned, not picked
                      </p>
                      <div className="grid grid-cols-8 gap-1.5">
                        {PREMIUM_EMOJI_OPTIONS.map((option) => {
                          const unlocked = isPremiumEmojiUnlocked(option, level?.level ?? 0, progress);
                          return (
                            <button
                              key={option.emoji}
                              onClick={() => (unlocked ? setPendingEmoji(option.emoji) : undefined)}
                              aria-label={
                                unlocked
                                  ? `Use ${option.emoji} as your avatar`
                                  : `${option.emoji} locked — ${premiumEmojiRequirementLabel(option.unlock)}`
                              }
                              title={unlocked ? undefined : premiumEmojiRequirementLabel(option.unlock)}
                              className={`relative grid aspect-square place-items-center rounded-lg text-[var(--heading)] transition ${
                                !unlocked
                                  ? "cursor-default bg-[var(--panel-soft)] opacity-40"
                                  : pendingEmoji === option.emoji
                                    ? "bg-[var(--accent)]/20 ring-2 ring-[var(--accent)]"
                                    : "bg-[var(--panel-soft)] hover:bg-[var(--panel)]"
                              }`}
                            >
                              <PremiumBadgeIcon option={option} className="block h-2/3 w-2/3" />
                              {!unlocked && (
                                <span
                                  aria-hidden="true"
                                  className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-[var(--bg)] text-[8px] leading-none"
                                >
                                  🔒
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {pendingEmoji && PREMIUM_EMOJI_OPTIONS.some((o) => o.emoji === pendingEmoji) && (
                        <p className="mt-1.5 text-[10px] text-[var(--faint)]">
                          {
                            premiumEmojiRequirementLabel(
                              PREMIUM_EMOJI_OPTIONS.find((o) => o.emoji === pendingEmoji)!.unlock
                            )
                          }
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map((color) => (
                        <button
                          key={color.hex}
                          onClick={() => setPendingColor(color.hex)}
                          aria-label={`Background color ${color.label}`}
                          title={color.label}
                          className={`h-7 w-7 rounded-full transition ${pendingColor === color.hex ? "ring-2 ring-offset-2 ring-offset-[var(--bg)] ring-[var(--accent)]" : ""}`}
                          style={{ backgroundColor: color.hex }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={saveEmojiAvatar}
                      disabled={avatarSaveState === "saving" || !pendingEmoji || !pendingColor}
                      className="self-start rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-50"
                    >
                      {avatarSaveState === "saving" ? "Saving…" : "Save avatar"}
                    </button>
                    {avatarSaveState === "saved" && <p className="text-xs text-[var(--muted)]">Saved.</p>}
                    {avatarSaveState === "error" && (
                      <p className="text-xs text-[var(--danger)]">{avatarSaveError ?? "Couldn't save — try again."}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePhotoChosen}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={photoState === "uploading"}
                      className="self-start rounded-lg border border-[var(--accent)]/60 px-4 py-2.5 text-sm font-semibold text-[var(--heading)] disabled:opacity-50"
                    >
                      {photoState === "uploading" ? "Uploading…" : entry.avatar_photo_path ? "Replace photo" : "Upload a photo"}
                    </button>
                    {entry.avatar_photo_path && entry.avatar_kind === "photo" && (
                      <button onClick={handleUseEmojiInstead} className="self-start text-xs text-[var(--faint)] underline hover:text-[var(--text)]">
                        Use my emoji avatar instead
                      </button>
                    )}
                    {photoError && <p className="text-xs text-[var(--danger)]">{photoError}</p>}
                    <p className="text-xs text-[var(--faint)]">JPEG, PNG, or WebP. It&apos;s cropped to a square automatically.</p>
                  </div>
                )}
              </section>

              <section className="flex flex-col gap-2 rounded-xl border border-[var(--border)] p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">Display name</h2>
                <p className="text-xs text-[var(--faint)]">
                  Shown here and on the Leaderboard — unique across every player, so it may already be taken.
                </p>
                <form onSubmit={handleSaveName} className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Your name"
                      maxLength={MAX_DISPLAY_NAME_LENGTH}
                      className="flex-1 rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
                    />
                    <button
                      type="submit"
                      disabled={nameSaveState === "saving"}
                      className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                  {nameAvailability === "checking" && <p className="text-xs text-[var(--faint)]">Checking…</p>}
                  {nameAvailability === "available" && <p className="text-xs text-[var(--accent)]">Available.</p>}
                  {nameAvailability === "taken" && <p className="text-xs text-[var(--danger)]">Already taken.</p>}
                </form>
                {nameError && <p className="text-xs text-[var(--danger)]">{nameError}</p>}
                {nameSaveState === "saved" && !nameError && <p className="text-xs text-[var(--muted)]">Saved.</p>}
                {nameSaveState === "error" && !nameError && <p className="text-xs text-[var(--danger)]">Couldn&apos;t save — check your connection.</p>}
              </section>

              <section className="flex flex-col gap-2 rounded-xl border border-[var(--border)] p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">Bio</h2>
                <p className="text-xs text-[var(--faint)]">A short line other players see on your profile. Optional.</p>
                <form onSubmit={handleSaveBio} className="flex flex-col gap-2">
                  <textarea
                    value={bioInput}
                    onChange={(e) => setBioInput(e.target.value)}
                    placeholder="Say something about yourself…"
                    maxLength={MAX_BIO_LENGTH}
                    rows={2}
                    className="resize-none rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--faint)]">{bioInput.length} / {MAX_BIO_LENGTH}</span>
                    <button type="submit" disabled={bioSaveState === "saving"} className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-50">
                      Save
                    </button>
                  </div>
                </form>
                {bioSaveState === "saved" && <p className="text-xs text-[var(--muted)]">Saved.</p>}
                {bioSaveState === "error" && <p className="text-xs text-[var(--danger)]">Couldn&apos;t save — check your connection.</p>}
              </section>

              <section className="flex flex-col gap-3 rounded-xl border border-[var(--border)] p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
                  Trophy case
                  <span className="ml-2 font-normal normal-case text-[var(--faint)]">
                    {showcaseSelection.length} / {MAX_SHOWCASE_ITEMS}
                  </span>
                </h2>
                <p className="text-xs text-[var(--faint)]">
                  Pick up to {MAX_SHOWCASE_ITEMS} achievements to feature at the top of your profile.
                </p>
                {privateLoading ? (
                  <p className="text-xs text-[var(--faint)]">Loading your achievements…</p>
                ) : pickableTrophies.length === 0 ? (
                  <p className="text-xs text-[var(--faint)]">
                    Nothing unlocked yet — play a game or two, then come back to pick your favorites.
                  </p>
                ) : (
                  <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
                    {pickableTrophies.map((a) => {
                      const key = showcaseKeyFor(a.familyId, a.tier);
                      const selected = showcaseSelection.includes(key);
                      return (
                        <button
                          key={key}
                          onClick={() => toggleShowcaseItem(key)}
                          disabled={!selected && showcaseSelection.length >= MAX_SHOWCASE_ITEMS}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            selected ? "bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]" : "bg-[var(--panel-soft)] hover:bg-[var(--panel)]"
                          }`}
                        >
                          <span
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
                            style={{ backgroundColor: TIER_RING_COLOR[a.tier] }}
                          >
                            <AchievementIcon category={a.category} className="h-3.5 w-3.5 text-[var(--bg)]" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[var(--heading)]">{a.familyTitle}</span>
                          <span className="shrink-0 text-xs text-[var(--faint)]">{TIER_LABEL[a.tier]}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <button
                  onClick={saveShowcase}
                  disabled={showcaseSaveState === "saving"}
                  className="self-start rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-50"
                >
                  {showcaseSaveState === "saving" ? "Saving…" : "Save trophy case"}
                </button>
                {showcaseSaveState === "saved" && <p className="text-xs text-[var(--muted)]">Saved.</p>}
                {showcaseSaveState === "error" && <p className="text-xs text-[var(--danger)]">Couldn&apos;t save — check your connection.</p>}
              </section>
            </>
          )}

          {/* ── Private — only you can see this ── */}
          {isSelf && (
            <>
              <div className="flex items-center gap-3 border-t border-[var(--border)] pt-6">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">Your activity</h2>
                <span className="text-[10px] text-[var(--faint)]">Only you can see what&apos;s below here</span>
              </div>

              {privateLoading ? (
                <LoadingSpinner />
              ) : privateStatsError ? (
                <p className="text-sm text-[var(--danger)]">
                  Couldn&apos;t load your stats — check your connection, or that this Supabase project has
                  every migration in <code>supabase/migrations/</code> applied.
                </p>
              ) : privateStats ? (
                <>
                  {/* Level */}
                  <section className="flex items-center gap-4 rounded-2xl bg-[var(--panel)] p-5">
                    <div className="relative grid h-20 w-20 shrink-0 place-items-center">
                      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
                        <circle cx="20" cy="20" r="17" fill="none" stroke="var(--panel-soft)" strokeWidth="4" />
                        <circle
                          cx="20"
                          cy="20"
                          r="17"
                          fill="none"
                          stroke="var(--accent)"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 17}`}
                          strokeDashoffset={`${2 * Math.PI * 17 * (1 - (level?.progressFraction ?? 0))}`}
                        />
                      </svg>
                      <span className="text-2xl font-extrabold text-[var(--heading)]">{level?.level ?? 0}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-[var(--faint)]">Level progress</p>
                      {level && (
                        <p className="text-xs text-[var(--faint)]">
                          {level.xpIntoLevel} / {level.xpSpanForLevel} XP to level {level.level + 1} · {level.totalXp} total
                        </p>
                      )}
                    </div>
                  </section>

                  {/* Highlights */}
                  <section className="grid grid-cols-2 gap-3">
                    <Highlight label="Rarest unlock">
                      {rarest ? (
                        <span className="flex items-center gap-1.5">
                          <AchievementIcon category={rarest.category} className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                          <span className="truncate">
                            {rarest.familyTitle} {tierNumber(rarest.tier)}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                      <span className="mt-0.5 block text-[10px] text-[var(--faint)]">
                        {rarest ? `${TIER_LABEL[rarest.tier]} tier` : "nothing unlocked yet"}
                      </span>
                    </Highlight>
                    <Highlight label="Toughest AI beaten">
                      <span className="capitalize">{toughestBeaten ?? "—"}</span>
                      <span className="mt-0.5 block text-[10px] text-[var(--faint)]">
                        {toughestBeaten
                          ? `${privateStats.wins_by_difficulty?.[toughestBeaten] ?? 0} win${
                              (privateStats.wins_by_difficulty?.[toughestBeaten] ?? 0) === 1 ? "" : "s"
                            }`
                          : "no wins recorded"}
                      </span>
                    </Highlight>
                    <Highlight label="Best Daily Deal streak">
                      {(dailyDealBestStreak ?? 0) > 0 ? `🔥 ${dailyDealBestStreak}` : "—"}
                      <span className="mt-0.5 block text-[10px] text-[var(--faint)]">days in a row</span>
                    </Highlight>
                    <Highlight label="Best game">
                      {formatScore(privateStats.best_score)}
                      <span className="mt-0.5 block text-[10px] text-[var(--faint)]">lowest final score</span>
                    </Highlight>
                  </section>

                  {/* The two figures not already shown in the public tiles above
                      (which cover games played/win rate/avg/worst already). */}
                  <section className="grid grid-cols-2 gap-3">
                    <StatTile label="Games won" value={privateStats.games_won} />
                    <StatTile label="Games tied" value={privateStats.games_tied} sub="a rare result" />
                  </section>

                  {/* Wins by difficulty */}
                  <section>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                      Wins by AI difficulty faced
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {DIFFICULTIES.map((d) => (
                        <div key={d} className="rounded-lg bg-[var(--panel)] px-3 py-2 text-center text-sm capitalize">
                          <div className="font-semibold text-[var(--heading)]">{privateStats.wins_by_difficulty[d] ?? 0}</div>
                          <div className="text-xs text-[var(--faint)]">{d}</div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Multiplayer — vs. real people only (these games also feed
                      the overall stats above). */}
                  {mpStats && mpStats.played > 0 && (
                    <section>
                      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                        Multiplayer (vs. people)
                      </h2>
                      <div className="grid grid-cols-3 gap-3">
                        <StatTile label="Played" value={mpStats.played} />
                        <StatTile
                          label="Win streak"
                          value={mpStats.currentWinStreak}
                          sub={mpStats.bestWinStreak > 0 ? `best ${mpStats.bestWinStreak}` : undefined}
                        />
                        <StatTile label="Podium finishes" value={mpStats.podiums} sub="top half of the table" />
                        {mpStats.biggestTableBeaten > 0 && (
                          <StatTile label="Biggest table won" value={`${mpStats.biggestTableBeaten}p`} />
                        )}
                      </div>
                    </section>
                  )}

                  {/* Achievement showcase */}
                  <section className="rounded-2xl bg-[var(--panel)] p-5">
                    <div className="flex items-baseline justify-between">
                      <h2 className="text-sm font-semibold text-[var(--heading)]">Achievements</h2>
                      <Link href="/achievements" className="text-xs font-medium text-[var(--accent)] hover:underline">
                        View all →
                      </Link>
                    </div>
                    <p className="mt-1 text-2xl font-extrabold text-[var(--heading)]">
                      {unlocked.length}
                      <span className="text-base font-medium text-[var(--faint)]"> / {TOTAL_ACHIEVEMENTS}</span>
                    </p>
                    <p className="text-xs text-[var(--faint)]">
                      {masteredFamilies} of {ACHIEVEMENT_FAMILIES.length} families mastered
                    </p>
                    <div className="mt-3 flex gap-1.5">
                      {ACHIEVEMENT_TIERS.map((t) => {
                        const n = unlockedByTier[t];
                        const max = ACHIEVEMENT_FAMILIES.length;
                        return (
                          <div key={t} className="flex-1 text-center">
                            <div className="flex h-16 w-full items-end overflow-hidden rounded-md bg-[var(--panel-soft)]">
                              <div className="w-full rounded-t-[3px] bg-[var(--accent)]" style={{ height: `${(n / max) * 100}%` }} />
                            </div>
                            <p className="mt-1 text-[10px] text-[var(--faint)]">{TIER_LABEL[t]}</p>
                            <p className="text-[10px] font-semibold text-[var(--muted)]">{n}</p>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* Past games — collapsed; it's the longest thing on the page */}
                  <details className="group rounded-lg border border-[var(--border)]">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--faint)] [&::-webkit-details-marker]:hidden">
                      <span>
                        Past games
                        <span className="ml-2 font-normal normal-case tracking-normal text-[var(--faint)]">
                          last {Math.min(history.length, PAST_GAMES_LIMIT)}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-[var(--faint)] transition group-open:rotate-180">
                        ▼
                      </span>
                    </summary>
                    {history.length === 0 ? (
                      <p className="border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--faint)]">
                        No games recorded yet.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2 border-t border-[var(--border)] p-3">
                        {history.map((g) => {
                          const yourScore = yourScoreFor(g);
                          const wonOrTied = yourScore !== null && g.winner_score != null && yourScore === g.winner_score;
                          return (
                            <li key={g.id} className="rounded-lg bg-[var(--panel)] px-4 py-3 text-sm">
                              <div className="flex items-center justify-between">
                                <span className={`font-medium ${wonOrTied ? "text-[var(--accent)]" : "text-[var(--heading)]"}`}>
                                  Winner: {g.winner}
                                  {g.winner_score != null && (
                                    <span className={`font-normal ${wonOrTied ? "" : "text-[var(--faint)]"}`}> ({g.winner_score} pts)</span>
                                  )}
                                </span>
                                <span className="text-xs text-[var(--faint)]">
                                  {new Date(g.played_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                                </span>
                              </div>
                              {yourScore !== null && !wonOrTied && (
                                <p className="mt-0.5 text-xs text-[var(--muted)]">Your score: {yourScore} pts</p>
                              )}
                              <p className="mt-1 text-xs text-[var(--faint)]">vs. {g.opponents.map((o) => o.name).join(", ")}</p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </details>

                  {mpHistory.length > 0 && (
                    <details className="group rounded-lg border border-[var(--border)]">
                      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--faint)] [&::-webkit-details-marker]:hidden">
                        <span>
                          Past multiplayer games
                          <span className="ml-2 font-normal normal-case tracking-normal text-[var(--faint)]">last {mpHistory.length}</span>
                        </span>
                        <span aria-hidden="true" className="text-[var(--faint)] transition group-open:rotate-180">
                          ▼
                        </span>
                      </summary>
                      <ul className="flex flex-col gap-2 border-t border-[var(--border)] p-3">
                        {mpHistory.map((mg) => {
                          const mySeat = mg.seats.find((s) => s.userId === user?.id)?.seat;
                          const myScore = mySeat != null ? mg.cumulative_scores[String(mySeat)] : undefined;
                          const winnerName = mg.winner_user_id
                            ? mg.seats.find((s) => s.userId === mg.winner_user_id)?.name ?? "Someone"
                            : "an AI";
                          const won = mg.your_outcome === "won";
                          return (
                            <li key={mg.game_id} className="rounded-lg bg-[var(--panel)] px-4 py-3 text-sm">
                              <div className="flex items-center justify-between">
                                <span className={`font-medium ${won ? "text-[var(--accent)]" : "text-[var(--heading)]"}`}>
                                  {won ? "You won" : mg.your_outcome === "resigned" ? "You left" : `Lost — ${winnerName} won`}
                                </span>
                                <span className="text-xs text-[var(--faint)]">
                                  {mg.completed_at ? new Date(mg.completed_at).toLocaleDateString(undefined, { dateStyle: "medium" }) : ""}
                                </span>
                              </div>
                              {myScore != null && <p className="mt-0.5 text-xs text-[var(--muted)]">Your score: {myScore} pts</p>}
                              <p className="mt-1 text-xs text-[var(--faint)]">
                                vs. {mg.seats.filter((s) => s.userId !== user?.id).map((s) => s.name).join(", ")}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                </>
              ) : (
                <EmptyState
                  icon="📊"
                  action={
                    <Link href="/new-game" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]">
                      New Game
                    </Link>
                  }
                >
                  No games recorded yet — play one to see your stats here. Your level still counts every
                  achievement you unlock along the way.
                </EmptyState>
              )}
            </>
          )}
        </>
      )}

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        Back to Home
      </Link>
    </main>
  );
}
