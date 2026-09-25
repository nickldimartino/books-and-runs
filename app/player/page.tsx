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
import { useRouter } from "next/navigation";
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
import { loadPendingSessionCounters, withSessionCounters } from "../lib/pendingProgress";
import { AchievementIcon } from "../components/AchievementIcons";
import { AvatarFrame } from "../components/AvatarFrame";
import { BackLink } from "../components/BackLink";
import { CenteredMessage } from "../components/CenteredMessage";
import { EmptyState } from "../components/EmptyState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { EmojiOrBadge, PremiumBadgeIcon } from "../components/PremiumBadgeIcon";
import { ProfileBanner } from "../components/ProfileBanner";
import { fetchAchievementRarity, formatRarity, RarityMap } from "../lib/achievementRarity";
import {
  COLOR_OPTIONS,
  EMOJI_OPTIONS,
  findPremiumEmojiOption,
  isPremiumEmojiUnlocked,
  PREMIUM_EMOJI_OPTIONS,
  premiumEmojiRequirementLabel,
  type PremiumEmojiOption,
} from "../lib/avatarPresets";
import { InvalidAvatarFileError, uploadAvatarPhoto } from "../lib/avatarUpload";
import { BANNER_OPTIONS, findBannerOption } from "../lib/bannerPresets";
import { cosmeticRequirementLabel, isCosmeticUnlocked, makeUnlockContext } from "../lib/cosmeticUnlocks";
import { LOCKED_ITEM_CLASS, lockedCaption } from "../lib/cosmeticLockStyle";
import { defaultRarityForUnlock, RARITY_TEXT_ACCENT } from "../lib/cosmeticRarity";
import { formatScore } from "../lib/formatScore";
import { getFriendRequests, getFriends, sendFriendRequest } from "../lib/friendsStore";
import type { TranslationKey } from "../lib/i18n/keys";
import { useT } from "../lib/i18n/LocaleProvider";
import {
  AvatarInfo,
  avatarPhotoUrlFor,
  CosmeticLockedError,
  DisplayNameTakenError,
  LeaderboardEntry,
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  MAX_SHOWCASE_ITEMS,
  displayNameFor,
  isDisplayNameAvailable,
  playerProfileHref,
  reportProfilePhoto,
  revertToEmojiAvatar,
  showcaseKeyFor,
  syncLeaderboardStats,
  updateLeaderboardAvatarEmoji,
  updateLeaderboardAvatarFrame,
  updateLeaderboardAvatarPhoto,
  updateLeaderboardBadge,
  updateLeaderboardBanner,
  updateLeaderboardBio,
  updateLeaderboardDisplayName,
  updateLeaderboardShowcase,
  updateLeaderboardTitle,
} from "../lib/leaderboardStore";
import { EMPTY_MP_STATS, getMyMpHistory, getMyMpStats, MpHistoryEntry, MpStats } from "../lib/mpStore";
import { AVATAR_FRAME_COLOR, AVATAR_FRAME_OPTIONS, findAvatarFrameOption, findTitleOption, TITLE_OPTIONS } from "../lib/profileCosmetics";
import {
  buildProfileShareCardInput,
  formatWinRate,
  resolveShowcaseItem,
  ShowcaseItem,
  TOTAL_ACHIEVEMENTS,
} from "../lib/profileShareCard";
import { RoundHistoryEntry } from "../lib/recordGameResult";
import { renderProfileShareCard } from "../lib/shareCard";
import { supabase } from "../lib/supabaseClient";
import { capitalize } from "../lib/text";
import { translateError } from "../lib/i18n/serverErrors";

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

// ShowcaseItem/resolveShowcaseItem/formatWinRate/TOTAL_ACHIEVEMENTS now live
// in profileShareCard.ts — shared with friends/page.tsx's own "share to add
// me" card, which needs the identical transform from a leaderboard_entries
// row. See that file's own doc.

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

/** The universal pencil-on-a-line "edit" glyph. */
function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/** The universal "box with an arrow escaping upward" share glyph. */
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
    </svg>
  );
}

/** A small star glyph for the Creator badge — same "earned recognition"
 * visual language as a verified/staff badge on other platforms. */
function CreatorBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5" aria-hidden="true">
      <path d="M12 2.5l2.7 6.28 6.8.57-5.18 4.5 1.57 6.65L12 16.9l-5.89 3.6 1.57-6.65-5.18-4.5 6.8-.57Z" />
    </svg>
  );
}

function formatMpWinRate(mpPlayed: number, mpWon: number): string {
  if (mpPlayed < MP_WIN_RATE_MIN_GAMES) return "—";
  return `${Math.round((100 * mpWon) / mpPlayed)}%`;
}

function StatTile({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  /** Extra classes on the outer tile — used to give a tile an explicit
   * width in a flex-wrap layout (see the public stat row below), where a
   * plain grid would leave a partial last row hugging the left edge
   * instead of centered. */
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-center ${className ?? ""}`}>
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
 * earned at (bronze beginner → diamond expert). Expert-tier medals get an
 * animated foil sweep — the rarest tier is the one worth a little shine. */
function TrophyBadge({ item, size = 56, rarityLabel }: { item: ShowcaseItem; size?: number; rarityLabel?: string | null }) {
  const { t } = useT();
  const tierLabel = capitalize(t(`common.difficulty.${item.tier}` as TranslationKey));
  return (
    <div
      className="flex flex-col items-center gap-1"
      title={`${item.familyTitle} · ${tierLabel}${rarityLabel ? ` · ${rarityLabel}` : ""}`}
    >
      <div
        className={`grid place-items-center rounded-full p-[3px] ${item.tier === "expert" ? "trophy-foil" : ""}`}
        style={{ width: size, height: size, backgroundColor: TIER_RING_COLOR[item.tier] }}
      >
        <div className="grid h-full w-full place-items-center rounded-full bg-[var(--panel)]">
          <AchievementIcon category={item.category} className="h-1/2 w-1/2 text-[var(--heading)]" />
        </div>
      </div>
      <p className="max-w-[4.5rem] truncate text-[10px] text-[var(--faint)]">{item.familyTitle}</p>
      {rarityLabel && <p className="max-w-[4.5rem] truncate text-[9px] text-[var(--accent)]">{rarityLabel}</p>}
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
    avatar_frame: null,
    badge: null,
    title: null,
    banner: null,
    joined_at: null,
    is_creator: false,
    is_test_account: false,
    level: 0,
    total_xp: 0,
    achievements_unlocked: 0,
    games_played: 0,
    games_won: 0,
    average_score: null,
    worst_score: null,
    daily_deal_streak: 0,
    daily_deal_best_streak: 0,
    weekly_challenge_best_streak: 0,
    mp_games_played: 0,
    mp_games_won: 0,
    mp_best_win_streak: 0,
    updated_at: new Date(0).toISOString(),
  };
}

export default function PlayerProfilePage() {
  const { configured, loading: authLoading, user } = useAuth();
  const { level } = usePlayerLevel();
  const router = useRouter();
  const { t, tPlural, locale } = useT();
  const [profileId, setProfileId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // A bare "/player" (no `?id=`) means "my own profile" — UnlockToast and
    // this page's own Account tip both link that way rather than building
    // playerProfileHref(user.id) themselves. Without this fallback,
    // profileId stayed null forever for a signed-in visitor (nothing below
    // ever loads without one), so the page just hung on its loading
    // spinner. Re-runs once `user` resolves, since auth loads async and
    // may not be ready on the first pass.
    const idParam = new URLSearchParams(window.location.search).get("id");
    if (idParam) setProfileId(idParam);
    else if (user) setProfileId(user.id);
  }, [user]);

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
      if (profileId === user.id) {
        await syncLeaderboardStats(client, profileId, user.created_at).catch((err) =>
          console.error("Failed to sync leaderboard stats (a missing migration would fail silently otherwise):", err)
        );
      }
      const { data, error } = await client.from("leaderboard_entries").select("*").eq("user_id", profileId).maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("Failed to load profile:", error);
        setLoadError(true);
      } else {
        const row = (data as LeaderboardEntry | null) ?? emptyEntry(profileId);
        setEntry(row);
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

  // ── Head-to-head record (only meaningful for someone else's profile) ───
  // Your own multiplayer history, not theirs — mp_my_history only ever
  // returns games *you* played in, filtered here to the ones this
  // profile's account also sat at. "Beat them" means your score was
  // better in a game you both finished, independent of who won the whole
  // table — the closest a >2-player game has to a real 1v1 record.
  const [h2hHistory, setH2hHistory] = useState<MpHistoryEntry[]>([]);
  useEffect(() => {
    if (!supabase || !user || !profileId || isSelf) {
      setH2hHistory([]);
      return;
    }
    getMyMpHistory(supabase, 200)
      .then(setH2hHistory)
      .catch((err) => console.error("Failed to load head-to-head history:", err));
  }, [user, profileId, isSelf]);

  const headToHead = useMemo(() => {
    if (!user || !profileId || isSelf) return null;
    let wins = 0;
    let losses = 0;
    let ties = 0;
    for (const g of h2hHistory) {
      const me = g.seats.find((s) => s.userId === user.id);
      const them = g.seats.find((s) => s.userId === profileId);
      if (!me || !them) continue;
      const myScore = g.cumulative_scores[String(me.seat)];
      const theirScore = g.cumulative_scores[String(them.seat)];
      if (myScore == null || theirScore == null) continue;
      if (myScore < theirScore) wins++;
      else if (myScore > theirScore) losses++;
      else ties++;
    }
    const gamesTogether = wins + losses + ties;
    return gamesTogether > 0 ? { wins, losses, ties, gamesTogether } : null;
  }, [h2hHistory, user, profileId, isSelf]);

  // ── Report photo ──────────────────────────────────────────────────────
  const [reportState, setReportState] = useState<"idle" | "open" | "sending" | "sent" | "error">("idle");
  const [reportReason, setReportReason] = useState("");

  async function submitReport(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user || !profileId) return;
    setReportState("sending");
    try {
      await reportProfilePhoto(supabase, profileId, reportReason.trim() || null);
      setReportState("sent");
    } catch (err) {
      console.error("Failed to report photo:", err);
      setReportState("error");
    }
  }

  // ── Edit profile (self only) — collapsed until asked for ───────────────
  const [editingProfile, setEditingProfile] = useState(false);
  const [editTab, setEditTab] = useState<
    "picture" | "badge" | "trophies" | "frame" | "title" | "banner" | "boutique" | "name"
  >("picture");

  // ── Achievement rarity ("Only N% of players have this") ────────────────
  // Global, so it can't be computed client-side (see achievementRarity.ts) —
  // fetched once from the daily-refreshed summary table.
  const [rarity, setRarity] = useState<RarityMap | null>(null);
  useEffect(() => {
    if (!supabase) return;
    fetchAchievementRarity(supabase)
      .then(setRarity)
      .catch((err) => console.error("Failed to load achievement rarity:", err));
  }, []);

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
      setNameError(t("player.nameEditor.emptyError"));
      return;
    }
    setNameSaveState("saving");
    try {
      await updateLeaderboardDisplayName(supabase, user.id, trimmed);
      setEntry((prev) => (prev ? { ...prev, display_name: trimmed } : prev));
      setNameSaveState("saved");
    } catch (err) {
      if (err instanceof DisplayNameTakenError) {
        setNameError(translateError(err.message, t));
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
  const [photoState, setPhotoState] = useState<"idle" | "uploading" | "error">("idle");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!entry || !isSelf) return;
    setAvatarTab(entry.avatar_kind === "photo" && entry.avatar_photo_path ? "photo" : "emoji");
    setPendingEmoji(entry.avatar_emoji);
    setPendingColor(entry.avatar_color);
  }, [entry, isSelf]);

  // Takes the emoji/color explicitly rather than reading pendingEmoji/
  // pendingColor state — called right from each button's onClick (see
  // chooseEmoji/chooseColor below) with the value that was just clicked, so
  // this saves immediately like every other cosmetic picker instead of
  // needing a separate "Save" button (which read as redundant next to
  // frame/title/banner, all of which already save on click).
  async function saveEmojiAvatar(emoji: string | null, color: string | null) {
    if (!supabase || !user || !emoji || !color) return;
    setAvatarSaveState("saving");
    try {
      await updateLeaderboardAvatarEmoji(supabase, user.id, emoji, color);
      setEntry((prev) => (prev ? { ...prev, avatar_kind: "emoji", avatar_emoji: emoji, avatar_color: color } : prev));
      setAvatarSaveState("saved");
    } catch (err) {
      console.error("Failed to save avatar:", err);
      setAvatarSaveState("error");
    }
  }

  function chooseEmoji(emoji: string) {
    setPendingEmoji(emoji);
    saveEmojiAvatar(emoji, pendingColor);
  }

  function chooseColor(color: string) {
    setPendingColor(color);
    saveEmojiAvatar(pendingEmoji, color);
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
      setPhotoError(err instanceof InvalidAvatarFileError ? translateError(err.message, t) : t("player.photo.uploadError"));
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

  // ── Self-editing: avatar frame ──────────────────────────────────────────
  const [frameSaveState, setFrameSaveState] = useState<SaveState>("idle");
  const [frameSaveError, setFrameSaveError] = useState<string | null>(null);
  // Tapping any gated option (locked or already-earned) shows how it's
  // unlocked — the hover `title` tooltip these buttons also carry never
  // reaches a touch device, so without this a phone had no way to see the
  // requirement at all, before or after earning it.
  const [frameInfo, setFrameInfo] = useState<string | null>(null);

  async function chooseFrame(frameId: string | null) {
    if (!supabase || !user) return;
    setFrameSaveState("saving");
    setFrameSaveError(null);
    try {
      await updateLeaderboardAvatarFrame(supabase, user.id, frameId);
      setEntry((prev) => (prev ? { ...prev, avatar_frame: frameId } : prev));
      setFrameSaveState("saved");
    } catch (err) {
      if (err instanceof CosmeticLockedError) setFrameSaveError(translateError(err.message, t));
      else console.error("Failed to save avatar frame:", err);
      setFrameSaveState("error");
    }
  }

  // ── Self-editing: nameplate title ───────────────────────────────────────
  const [titleSaveState, setTitleSaveState] = useState<SaveState>("idle");
  const [titleSaveError, setTitleSaveError] = useState<string | null>(null);
  const [titleInfo, setTitleInfo] = useState<string | null>(null);

  async function chooseTitle(titleId: string | null) {
    if (!supabase || !user) return;
    setTitleSaveState("saving");
    setTitleSaveError(null);
    try {
      await updateLeaderboardTitle(supabase, user.id, titleId);
      setEntry((prev) => (prev ? { ...prev, title: titleId } : prev));
      setTitleSaveState("saved");
    } catch (err) {
      if (err instanceof CosmeticLockedError) setTitleSaveError(translateError(err.message, t));
      else console.error("Failed to save title:", err);
      setTitleSaveState("error");
    }
  }

  // ── Self-editing: profile banner ────────────────────────────────────────
  const [bannerSaveState, setBannerSaveState] = useState<SaveState>("idle");
  const [bannerSaveError, setBannerSaveError] = useState<string | null>(null);
  const [bannerInfo, setBannerInfo] = useState<string | null>(null);

  async function chooseBanner(bannerId: string | null) {
    if (!supabase || !user) return;
    setBannerSaveState("saving");
    setBannerSaveError(null);
    try {
      await updateLeaderboardBanner(supabase, user.id, bannerId);
      setEntry((prev) => (prev ? { ...prev, banner: bannerId } : prev));
      setBannerSaveState("saved");
    } catch (err) {
      if (err instanceof CosmeticLockedError) setBannerSaveError(translateError(err.message, t));
      else console.error("Failed to save banner:", err);
      setBannerSaveState("error");
    }
  }

  // ── Self-editing: badge — an earned overlay on the avatar's corner,
  // separate from the picture itself (see migration 0031's own doc). ──────
  const [badgeSaveState, setBadgeSaveState] = useState<SaveState>("idle");
  const [badgeSaveError, setBadgeSaveError] = useState<string | null>(null);
  // The option itself, not a pre-formatted string — the info line below
  // needs to render the same custom icon (PremiumBadgeIcon) the grid tile
  // above it uses, not the raw emoji character, or the two visibly
  // disagree about what the badge looks like.
  const [badgeInfo, setBadgeInfo] = useState<PremiumEmojiOption | null>(null);

  async function chooseBadge(badge: string | null) {
    if (!supabase || !user) return;
    setBadgeSaveState("saving");
    setBadgeSaveError(null);
    try {
      await updateLeaderboardBadge(supabase, user.id, badge);
      setEntry((prev) => (prev ? { ...prev, badge } : prev));
      setBadgeSaveState("saved");
    } catch (err) {
      if (err instanceof CosmeticLockedError) setBadgeSaveError(translateError(err.message, t));
      else console.error("Failed to save badge:", err);
      setBadgeSaveState("error");
    }
  }

  // ── Share profile card ──────────────────────────────────────────────────
  const [shareState, setShareState] = useState<"idle" | "working" | "shared" | "error">("idle");

  async function shareProfileCard() {
    if (!entry) return;
    setShareState("working");
    try {
      // Re-fetch this account's own row instead of trusting local `entry`
      // state — it's normally fresh (every cosmetic picker above updates it
      // immediately on save), but a share should always reflect exactly
      // what's actually saved, not whatever happens to be in memory.
      let freshEntry = entry;
      if (supabase) {
        const { data } = await supabase.from("leaderboard_entries").select("*").eq("user_id", entry.user_id).maybeSingle();
        if (data) freshEntry = data as LeaderboardEntry;
      }
      const url = `${window.location.origin}${playerProfileHref(entry.user_id)}`;
      const blob = await renderProfileShareCard(buildProfileShareCardInput(supabase, freshEntry, displayLevel, t));
      if (!blob) throw new Error("Canvas unavailable");
      const file = new File([blob], "books-and-runs-profile.png", { type: "image/png" });
      // One share action carries both the picture and the link — no
      // separate clipboard copy. A couple of real devices have been seen
      // silently dropping the picture when a `url` rides along with
      // `files`, so this only adds `url` when canShare confirms the
      // combined payload actually works; otherwise it falls back to the
      // picture alone rather than risk losing it.
      const canShareBoth = navigator.canShare?.({ files: [file], url });
      if (navigator.share && canShareBoth) {
        await navigator.share({ files: [file], url });
      } else if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
        // No native share sheet on this platform to hand the link to
        // alongside the picture — copying it is the closest one-action
        // equivalent, so it still travels with the download.
        try {
          await navigator.clipboard?.writeText(url);
        } catch {
          // Best-effort — the picture still opened either way.
        }
      }
      setShareState("shared");
      setTimeout(() => setShareState((s) => (s === "shared" ? "idle" : s)), 4000);
    } catch (err) {
      // A user backing out of the native share sheet also lands here (some
      // platforms reject navigator.share's promise on cancel) — that's not
      // really a failure worth alarming over, but there's no reliable way
      // to tell it apart from a real error, so it still surfaces the same
      // message; worst case someone taps Share again.
      console.error("Failed to share profile card:", err);
      setShareState("error");
    }
  }

  // ── Private section (self only): the old /stats page's own data ────────
  const [privateStats, setPrivateStats] = useState<PlayerStats | null>(null);
  const [history, setHistory] = useState<GameHistoryRow[]>([]);
  const [progress, setProgress] = useState<AchievementProgressState>(EMPTY_PROGRESS_STATE);
  const [dailyDealBestStreak, setDailyDealBestStreak] = useState<number | null>(null);
  // Whether this account has ever completed a tip (migration 0043's
  // supporter_payments — written only by the stripe-webhook function, so
  // this is a read of real ground truth, not anything self-reported).
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
      // Needs migration 0043 — a query error (an unmigrated project, no
      // such table yet) resolves with data: null same as any other
      // Supabase error, never rejects, so `?? []` alone already covers it.
      client
        .from("supporter_payments")
        .select("user_id")
        .eq("user_id", user.id)
        .limit(1)
        .then((res) => res.data ?? []),
    ]).then(([statsRes, historyRes, countersRes, dailyDealRes, mp, supporterRows]) => {
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
      setIsSupporter(supporterRows.length > 0);
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
  const unlockCtx = useMemo(
    () =>
      makeUnlockContext({
        level: level?.level ?? entry?.level ?? 0,
        progress,
        gamesPlayed: entry?.games_played ?? 0,
        dailyDealBestStreak: entry?.daily_deal_best_streak ?? 0,
        weeklyChallengeBestStreak: entry?.weekly_challenge_best_streak ?? 0,
        isCreator: entry?.is_creator ?? false,
        isSupporter,
        // Both already loaded on this page for the Stats section below —
        // no new fetch needed for any of the 4 newer requirement_kinds.
        worstScore: privateStats?.worst_score ?? null,
        averageScore: privateStats?.average_score ?? null,
        gamesTied: privateStats?.games_tied ?? 0,
        mpBestWinStreak: entry?.mp_best_win_streak ?? 0,
      }),
    [level, entry, progress, isSupporter, privateStats]
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
  }, [user, isSelf, entry, level, unlockCtx, privateLoading]);

  const achievements = useMemo(() => allAchievements(progress), [progress]);
  const unlocked = useMemo(() => achievements.filter((a) => a.unlocked), [achievements]);
  // Same "closest goal" nudge Home already shows for its own card — surfaced
  // here too, since it's exactly the kind of thing a profile visit is for.
  const [pendingSessionCounters, setPendingSessionCounters] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (isSelf) setPendingSessionCounters(loadPendingSessionCounters());
  }, [isSelf]);
  const closestAchievement = useMemo(
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

  if (!authLoading && !configured) {
    return (
      <CenteredMessage title={t("player.notConfigured.title")} body={t("player.notConfigured.body")} />
    );
  }

  if (!authLoading && configured && !user) {
    return (
      <CenteredMessage
        title={t("player.signInGate.title")}
        body={t("player.signInGate.body")}
        signIn
      />
    );
  }

  if (profileId === null) {
    return <CenteredMessage title={t("player.noProfile.title")} body={t("player.noProfile.body")} />;
  }

  const avatarInfo: AvatarInfo | undefined = entry
    ? {
        kind: entry.avatar_kind,
        emoji: entry.avatar_emoji,
        color: entry.avatar_color,
        photoPath: entry.avatar_photo_path,
      }
    : undefined;
  const titleOption = entry ? findTitleOption(entry.title) : null;
  // entry.level is a synced snapshot (leaderboard_entries.level) — only as
  // fresh as the last successful syncLeaderboardStats call, which silently
  // no-ops on any error (a missing migration, a network blip). The exact
  // same gated cosmetics on this page (frame/title/emoji tabs, just below)
  // check the live PlayerLevelContext value instead, which has no such
  // lag — showing entry.level here instead could read "Level 25" right
  // next to an already-equipped Diamond frame that actually needed level
  // 100, with no way to tell the two numbers ever disagreed. Self-view
  // shows the same live number the unlock checks use; a visitor has no
  // access to your private progress, so their view still shows the
  // synced snapshot — the best a public profile can do.
  const displayLevel = isSelf && level ? level.level : (entry?.level ?? 0);
  // A banner's gradient is always dark enough to need light text — see
  // ProfileBanner's own scrim, which guarantees this regardless of which
  // preset is picked.
  const onBanner = !!findBannerOption(entry?.banner ?? null);
  const joinedLabel = entry?.joined_at
    ? t("player.joined", {
        date: new Date(entry.joined_at).toLocaleDateString(locale, { month: "short", year: "numeric" }),
      })
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <BackLink
        label={t("common.back")}
        onClick={() => {
          // Return to wherever this profile was opened from (the Friends
          // list, Leaderboard, a Clubs roster, ...) instead of always
          // landing on Home — history.length > 1 means this tab actually
          // has an in-app page to go back to; a profile opened fresh (a
          // shared link, a new tab) has nothing behind it, so Home is the
          // only sane fallback.
          if (typeof window !== "undefined" && window.history.length > 1) router.back();
          else router.push("/");
        }}
      />

      {authLoading || loading || !entry ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-[var(--danger)]">{t("player.loadError")}</p>
      ) : (
        <>
          <PageTip id="player-profile" title={isSelf ? t("player.tip.selfTitle") : t("player.tip.otherTitle")}>
            {isSelf ? t("player.tip.selfBody") : t("player.tip.otherBody")}
          </PageTip>

          {/* ── Public — same for everyone, including your own view ── */}
          <ProfileBanner banner={entry.banner}>
            {isSelf ? (
              <button
                onClick={() => setEditingProfile((v) => !v)}
                aria-label={editingProfile ? t("player.editProfile.done") : t("player.editProfile.edit")}
                title={editingProfile ? t("player.editProfile.done") : t("player.editProfile.edit")}
                className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/20 text-white backdrop-blur-sm transition hover:bg-black/30"
              >
                <EditIcon />
              </button>
            ) : (
              related !== "related" && (
                <button
                  onClick={addFriend}
                  disabled={related === "requested"}
                  aria-label={related === "requested" ? t("player.friend.requestSent") : t("player.friend.add")}
                  title={related === "requested" ? t("player.friend.requestSent") : t("player.friend.add")}
                  className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/20 text-white backdrop-blur-sm transition hover:bg-black/30 disabled:opacity-60"
                >
                  {related === "requested" ? <PersonCheckIcon /> : <PersonAddIcon />}
                </button>
              )
            )}
            <button
              onClick={shareProfileCard}
              disabled={shareState === "working"}
              aria-label={t("player.share.button")}
              title={t("player.share.button")}
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/20 text-white backdrop-blur-sm transition hover:bg-black/30 disabled:opacity-60"
            >
              <ShareIcon />
            </button>
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="relative">
                <AvatarFrame frame={entry.avatar_frame} size={88}>
                  <PlayerAvatar avatar={avatarInfo} updatedAt={entry.updated_at} size={88} />
                </AvatarFrame>
                {entry.badge && (
                  <span
                    title={t("player.badge.earned")}
                    className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--bg)] bg-[var(--panel)] p-1 shadow"
                  >
                    <EmojiOrBadge emoji={entry.badge} className="h-full w-full text-[var(--heading)]" />
                  </span>
                )}
              </div>

              {/* Identity: name, title, level — kept tight and on-brand
                  regardless of banner, unlike bio/cosmetics/actions below,
                  which read fine in the page's normal muted tones. */}
              <h1 className={`flex items-center gap-1.5 text-xl font-bold ${onBanner ? "text-white" : "text-[var(--heading)]"}`}>
                {displayNameFor(entry)}
                {entry.is_creator && (
                  <span
                    title={t("player.creator.title")}
                    aria-label={t("player.creator.title")}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${onBanner ? "bg-white/20 text-yellow-200" : "bg-[var(--accent)]/15 text-[var(--accent)]"}`}
                  >
                    <CreatorBadgeIcon />
                    {t("player.creator.label")}
                  </span>
                )}
              </h1>
              {titleOption && (
                <p className={`-mt-1 text-xs font-semibold uppercase tracking-wide ${onBanner ? "text-yellow-300" : "text-[var(--accent)]"}`}>
                  {titleOption.label}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${onBanner ? "bg-white/20 text-white" : "bg-[var(--accent)]/15 text-[var(--accent)]"}`}
                >
                  {t("home.levelN", { level: displayLevel })}
                </span>
                {joinedLabel && (
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${onBanner ? "bg-white/10 text-white/80" : "bg-[var(--panel-soft)] text-[var(--faint)]"}`}>
                    {joinedLabel}
                  </span>
                )}
              </div>

              {entry.bio && (
                <p className={`max-w-xs text-sm ${onBanner ? "text-white/90" : "text-[var(--muted)]"}`}>{entry.bio}</p>
              )}

              {/* Actions — deliberately smaller/quieter than the stat tiles
                  below: these are things you do occasionally, not the
                  content itself. */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {!isSelf && entry.avatar_kind === "photo" && entry.avatar_photo_path && reportState === "idle" && (
                  <button
                    onClick={() => setReportState("open")}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${onBanner ? "border-white/30 text-white/90 hover:bg-white/10" : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"}`}
                  >
                    {t("player.report.button")}
                  </button>
                )}
              </div>
              {shareState === "shared" && (
                <p className={`text-xs ${onBanner ? "text-white/90" : "text-[var(--muted)]"}`}>{t("player.share.shared")}</p>
              )}
              {shareState === "error" && (
                <p className="text-xs text-[var(--danger)]">{t("player.share.error")}</p>
              )}

              {(reportState === "open" || reportState === "sending") && (
                <form onSubmit={submitReport} className="mt-2 flex w-full flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-left">
                  <label className="text-xs font-medium text-[var(--muted)]">
                    {t("player.report.prompt")}
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
                      {t("common.cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={reportState === "sending"}
                      className="flex-1 rounded-lg bg-[var(--danger)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {reportState === "sending" ? t("player.report.sending") : t("player.report.submit")}
                    </button>
                  </div>
                </form>
              )}
              {reportState === "sent" && <p className="text-xs text-[var(--muted)]">{t("player.report.sent")}</p>}
              {reportState === "error" && <p className="text-xs text-[var(--danger)]">{t("player.report.error")}</p>}
            </div>
          </ProfileBanner>

          {/* ── Edit profile (self only, collapsed by default) — tabbed so
              only one editor is open at a time; Trophies sits second, not
              last, since curating your showcase is at least as common a
              reason to open this as changing your picture. ── */}
          {isSelf && editingProfile && (
            <section className="flex flex-col gap-4 rounded-xl border border-[var(--border)] p-4">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["picture", t("player.tab.picture")],
                    ["badge", t("player.tab.badge")],
                    ["trophies", t("player.tab.trophies")],
                    ["frame", t("player.tab.frame")],
                    ["title", t("player.tab.title")],
                    ["banner", t("player.tab.banner")],
                    ["boutique", t("player.tab.boutique")],
                    ["name", t("player.tab.nameAndBio")],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setEditTab(id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      editTab === id
                        ? "bg-[var(--accent)] text-[var(--on-accent)]"
                        : "bg-[var(--panel-soft)] text-[var(--muted)] hover:bg-[var(--panel)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {editTab === "picture" && (
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.picture.heading")}</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAvatarTab("emoji")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${avatarTab === "emoji" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}
                  >
                    {t("player.picture.emojiTab")}
                  </button>
                  <button
                    onClick={() => setAvatarTab("photo")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${avatarTab === "photo" ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}
                  >
                    {t("player.picture.photoTab")}
                  </button>
                </div>

                {avatarTab === "emoji" ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-8 gap-1.5">
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => chooseEmoji(emoji)}
                          aria-label={t("player.picture.useEmoji", { emoji })}
                          className={`grid aspect-square place-items-center rounded-lg text-lg transition ${
                            pendingEmoji === emoji ? "bg-[var(--accent)]/20 ring-2 ring-[var(--accent)]" : "bg-[var(--panel-soft)] hover:bg-[var(--panel)]"
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map((color) => (
                        <button
                          key={color.hex}
                          onClick={() => chooseColor(color.hex)}
                          aria-label={t("player.picture.backgroundColor", { label: color.label })}
                          title={color.label}
                          className={`h-7 w-7 rounded-full transition ${pendingColor === color.hex ? "ring-2 ring-offset-2 ring-offset-[var(--bg)] ring-[var(--accent)]" : ""}`}
                          style={{ backgroundColor: color.hex }}
                        />
                      ))}
                    </div>
                    {avatarSaveState === "saving" && <p className="text-xs text-[var(--faint)]">{t("common.saving")}</p>}
                    {avatarSaveState === "saved" && <p className="text-xs text-[var(--muted)]">{t("common.saved")}</p>}
                    {avatarSaveState === "error" && (
                      <p className="text-xs text-[var(--danger)]">{t("player.saveError")}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-4">
                      {entry.avatar_photo_path && entry.avatar_kind === "photo" ? (
                        <PlayerAvatar avatar={avatarInfo} updatedAt={entry.updated_at} size={96} />
                      ) : (
                        <div
                          className="grid shrink-0 place-items-center rounded-full border border-dashed border-[var(--border)] text-[10px] text-[var(--faint)]"
                          style={{ width: 96, height: 96 }}
                        >
                          {t("player.photo.none")}
                        </div>
                      )}
                      <p className="text-xs text-[var(--faint)]">
                        {t("player.photo.formatHint")}
                      </p>
                    </div>
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
                      {photoState === "uploading" ? t("player.photo.uploading") : entry.avatar_photo_path ? t("player.photo.replace") : t("player.photo.upload")}
                    </button>
                    {entry.avatar_photo_path && entry.avatar_kind === "photo" && (
                      <button onClick={handleUseEmojiInstead} className="self-start text-xs text-[var(--faint)] underline hover:text-[var(--text)]">
                        {t("player.photo.useEmojiInstead")}
                      </button>
                    )}
                    {photoError && <p className="text-xs text-[var(--danger)]">{photoError}</p>}
                  </div>
                )}
              </div>
              )}

              {editTab === "badge" && (
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.tab.badge")}</h2>
                <p className="text-xs text-[var(--faint)]">
                  {t("player.badge.description")}
                </p>
                <div className="grid grid-cols-8 gap-1.5">
                  <button
                    onClick={() => {
                      chooseBadge(null);
                      setBadgeInfo(null);
                    }}
                    aria-label={t("player.badge.none")}
                    className={`grid aspect-square place-items-center rounded-lg text-[10px] text-[var(--faint)] transition ${
                      !entry.badge ? "bg-[var(--accent)]/20 ring-2 ring-[var(--accent)]" : "bg-[var(--panel-soft)] hover:bg-[var(--panel)]"
                    }`}
                  >
                    {t("common.none")}
                  </button>
                  {PREMIUM_EMOJI_OPTIONS.filter((option) => option.source !== "boutique").map((option) => {
                    const unlocked = isPremiumEmojiUnlocked(option, unlockCtx);
                    return (
                      <button
                        key={option.emoji}
                        onClick={() => {
                          if (unlocked) chooseBadge(option.emoji);
                          // Tapping shows how it's unlocked whether or not
                          // it's earned yet — the hover `title` below never
                          // reaches a touch device.
                          setBadgeInfo(option);
                        }}
                        aria-label={
                          unlocked
                            ? t("player.badge.useEmoji", { emoji: option.emoji })
                            : t("player.badge.lockedAriaLabel", { emoji: option.emoji, requirement: premiumEmojiRequirementLabel(option.unlock) })
                        }
                        title={unlocked ? undefined : premiumEmojiRequirementLabel(option.unlock)}
                        className={`relative grid aspect-square place-items-center rounded-lg text-[var(--heading)] transition ${
                          !unlocked
                            ? `bg-[var(--panel-soft)] ${LOCKED_ITEM_CLASS}`
                            : entry.badge === option.emoji
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
                {(() => {
                  // Whatever was last tapped, falling back to an
                  // explanation of the currently-equipped badge so this
                  // line isn't just blank the moment the tab opens.
                  const equippedOption = entry.badge ? PREMIUM_EMOJI_OPTIONS.find((o) => o.emoji === entry.badge) : undefined;
                  const shown = badgeInfo ?? equippedOption;
                  if (!shown) return null;
                  // The same PremiumBadgeIcon the grid tile above renders,
                  // not the raw emoji character — otherwise this line
                  // visibly disagrees with the icon shape it's describing
                  // (e.g. the compass-star icon vs. a literal 🧭 glyph).
                  return (
                    <p className="flex items-center gap-1.5 text-[10px] text-[var(--faint)]">
                      <PremiumBadgeIcon option={shown} className="block h-3 w-3 shrink-0" />
                      <span>— {premiumEmojiRequirementLabel(shown.unlock)}</span>
                    </p>
                  );
                })()}
                {badgeSaveState === "saving" && <p className="text-xs text-[var(--faint)]">{t("common.saving")}</p>}
                {badgeSaveState === "saved" && <p className="text-xs text-[var(--muted)]">{t("common.saved")}</p>}
                {badgeSaveState === "error" && (
                  <p className="text-xs text-[var(--danger)]">{badgeSaveError ?? t("player.saveError")}</p>
                )}
              </div>
              )}

              {editTab === "trophies" && (
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
                  {t("player.trophies.heading")}
                  <span className="ml-2 font-normal normal-case text-[var(--faint)]">
                    {showcaseSelection.length} / {MAX_SHOWCASE_ITEMS}
                  </span>
                </h2>
                <p className="text-xs text-[var(--faint)]">
                  {t("player.trophies.description", { max: MAX_SHOWCASE_ITEMS })}
                </p>
                {privateLoading ? (
                  <p className="text-xs text-[var(--faint)]">{t("player.trophies.loading")}</p>
                ) : pickableTrophies.length === 0 ? (
                  <p className="text-xs text-[var(--faint)]">
                    {t("player.trophies.empty")}
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
                          <span className="min-w-0 flex-1 truncate text-[var(--heading)]">{t(a.familyTitleKey as TranslationKey)}</span>
                          <span className="shrink-0 text-xs text-[var(--faint)]">{capitalize(t(`common.difficulty.${a.tier}` as TranslationKey))}</span>
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
                  {showcaseSaveState === "saving" ? t("common.saving") : t("player.trophies.save")}
                </button>
                {showcaseSaveState === "saved" && <p className="text-xs text-[var(--muted)]">{t("common.saved")}</p>}
                {showcaseSaveState === "error" && <p className="text-xs text-[var(--danger)]">{t("common.error")}</p>}
              </div>
              )}

              {editTab === "frame" && (
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.frame.heading")}</h2>
                <p className="text-xs text-[var(--faint)]">
                  {t("player.frame.description")}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      chooseFrame(null);
                      setFrameInfo(null);
                    }}
                    className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${
                      !entry.avatar_frame ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]" : "hover:bg-[var(--panel-soft)]"
                    }`}
                  >
                    <AvatarFrame frame={null} size={44}>
                      <PlayerAvatar avatar={avatarInfo} updatedAt={entry.updated_at} size={44} />
                    </AvatarFrame>
                    <span className="text-[10px] text-[var(--faint)]">{t("common.none")}</span>
                  </button>
                  {AVATAR_FRAME_OPTIONS.filter(
                    (option) => (option.unlock?.kind !== "creatorOnly" || unlockCtx.isCreator) && option.source !== "boutique"
                  ).map((option) => {
                    const unlocked = !option.unlock || isCosmeticUnlocked(option.unlock, unlockCtx);
                    return (
                      <button
                        key={option.id}
                        onClick={() => {
                          if (unlocked) chooseFrame(option.id);
                          // A tap surfaces the requirement whether or not
                          // it's earned yet — the hover `title` below never
                          // reaches a touch device, and even an already-
                          // unlocked item is worth a reminder of how it
                          // was earned.
                          if (option.unlock) setFrameInfo(`${option.label} — ${cosmeticRequirementLabel(option.unlock)}`);
                        }}
                        title={unlocked ? undefined : option.unlock && cosmeticRequirementLabel(option.unlock)}
                        className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${
                          !unlocked
                            ? LOCKED_ITEM_CLASS
                            : entry.avatar_frame === option.id
                              ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]"
                              : "hover:bg-[var(--panel-soft)]"
                        }`}
                      >
                        <AvatarFrame frame={option.id} size={44}>
                          <PlayerAvatar avatar={avatarInfo} updatedAt={entry.updated_at} size={44} />
                        </AvatarFrame>
                        <span className="text-[10px] text-[var(--faint)]">{lockedCaption(option.label, unlocked)}</span>
                      </button>
                    );
                  })}
                </div>
                {frameInfo && <p className="text-[11px] text-[var(--faint)]">{frameInfo}</p>}
                {frameSaveState === "saving" && <p className="text-xs text-[var(--faint)]">{t("common.saving")}</p>}
                {frameSaveState === "saved" && <p className="text-xs text-[var(--muted)]">{t("common.saved")}</p>}
                {frameSaveState === "error" && (
                  <p className="text-xs text-[var(--danger)]">{frameSaveError ?? t("player.saveError")}</p>
                )}
              </div>
              )}

              {editTab === "title" && (
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.tab.title")}</h2>
                <p className="text-xs text-[var(--faint)]">{t("player.title.description")}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      chooseTitle(null);
                      setTitleInfo(null);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      !entry.title ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                    }`}
                  >
                    {t("common.none")}
                  </button>
                  {TITLE_OPTIONS.filter((option) => option.source !== "boutique").map((option) => {
                    const unlocked = !option.unlock || isCosmeticUnlocked(option.unlock, unlockCtx);
                    // A title has no art to put a ring/foil on — just a
                    // colored border/text instead once it's genuinely rare
                    // (epic+), so browsing the list telegraphs which ones
                    // are a bigger deal even before selecting one.
                    const rarity = option.rarity ?? defaultRarityForUnlock(option.unlock);
                    const accent = RARITY_TEXT_ACCENT[rarity];
                    const selected = entry.title === option.id;
                    return (
                      <button
                        key={option.id}
                        onClick={() => {
                          if (unlocked) chooseTitle(option.id);
                          if (option.unlock) setTitleInfo(`${option.label} — ${cosmeticRequirementLabel(option.unlock)}`);
                        }}
                        title={unlocked || !option.unlock ? undefined : cosmeticRequirementLabel(option.unlock)}
                        style={unlocked && accent && !selected ? { borderColor: accent, color: accent } : undefined}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          !unlocked
                            ? `border-[var(--border)] text-[var(--faint)] ${LOCKED_ITEM_CLASS}`
                            : selected
                              ? "border-[var(--accent)] text-[var(--accent)]"
                              : accent
                                ? "hover:bg-[var(--panel-soft)]"
                                : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                        }`}
                      >
                        {lockedCaption(option.label, unlocked)}
                      </button>
                    );
                  })}
                </div>
                {titleInfo && <p className="text-[11px] text-[var(--faint)]">{titleInfo}</p>}
                {titleSaveState === "saving" && <p className="text-xs text-[var(--faint)]">{t("common.saving")}</p>}
                {titleSaveState === "saved" && <p className="text-xs text-[var(--muted)]">{t("common.saved")}</p>}
                {titleSaveState === "error" && (
                  <p className="text-xs text-[var(--danger)]">{titleSaveError ?? t("player.saveError")}</p>
                )}
              </div>
              )}

              {editTab === "banner" && (
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.banner.heading")}</h2>
                <p className="text-xs text-[var(--faint)]">
                  {t("player.banner.description")}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => {
                      chooseBanner(null);
                      setBannerInfo(null);
                    }}
                    className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${
                      !entry.banner ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]" : "hover:bg-[var(--panel-soft)]"
                    }`}
                  >
                    <div className="h-10 w-16 rounded-md border border-[var(--border)] bg-[var(--panel)]" />
                    <span className="text-[10px] text-[var(--faint)]">{t("common.none")}</span>
                  </button>
                  {BANNER_OPTIONS.filter(
                    (option) => (option.unlock?.kind !== "creatorOnly" || unlockCtx.isCreator) && option.source !== "boutique"
                  ).map((option) => {
                    const unlocked = !option.unlock || isCosmeticUnlocked(option.unlock, unlockCtx);
                    return (
                      <button
                        key={option.id}
                        onClick={() => {
                          if (unlocked) chooseBanner(option.id);
                          if (option.unlock) setBannerInfo(`${option.label} — ${cosmeticRequirementLabel(option.unlock)}`);
                        }}
                        title={unlocked ? undefined : option.unlock && cosmeticRequirementLabel(option.unlock)}
                        className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${
                          !unlocked
                            ? LOCKED_ITEM_CLASS
                            : entry.banner === option.id
                              ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]"
                              : "hover:bg-[var(--panel-soft)]"
                        }`}
                      >
                        <div className="h-10 w-16 rounded-md" style={{ background: option.css }} />
                        <span className="text-[10px] text-[var(--faint)]">{lockedCaption(option.label, unlocked)}</span>
                      </button>
                    );
                  })}
                </div>
                {bannerInfo && <p className="text-[11px] text-[var(--faint)]">{bannerInfo}</p>}
                {bannerSaveState === "saving" && <p className="text-xs text-[var(--faint)]">{t("common.saving")}</p>}
                {bannerSaveState === "saved" && <p className="text-xs text-[var(--muted)]">{t("common.saved")}</p>}
                {bannerSaveState === "error" && (
                  <p className="text-xs text-[var(--danger)]">{bannerSaveError ?? t("player.saveError")}</p>
                )}
              </div>
              )}

              {editTab === "boutique" && (() => {
                // A curated cross-category view, not a separate data store —
                // every boutique item lives in its home catalog (badge/
                // frame/title/banner) tagged `source: "boutique"`, saved
                // through that exact same update function a pick from its
                // own tab would use. Gated on the "boutique" unlock kind
                // (cosmeticUnlocks.ts) — creator-only for now, simulating
                // the real purchase flow it'll become — so it gets the same
                // visible-but-locked treatment as every other gated tab
                // instead of being unconditionally pickable.
                const boutiqueBadges = PREMIUM_EMOJI_OPTIONS.filter((o) => o.source === "boutique");
                const boutiqueFrames = AVATAR_FRAME_OPTIONS.filter((o) => o.source === "boutique");
                const boutiqueTitles = TITLE_OPTIONS.filter((o) => o.source === "boutique");
                const boutiqueBanners = BANNER_OPTIONS.filter((o) => o.source === "boutique");
                const isEmpty =
                  boutiqueBadges.length === 0 &&
                  boutiqueFrames.length === 0 &&
                  boutiqueTitles.length === 0 &&
                  boutiqueBanners.length === 0;
                return (
                  <div className="flex flex-col gap-5">
                    <div>
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.tab.boutique")}</h2>
                      <p className="text-xs text-[var(--faint)]">
                        {unlockCtx.isCreator
                          ? t("player.boutique.descriptionCreator")
                          : t("player.boutique.description")}
                      </p>
                    </div>
                    {isEmpty && (
                      <EmptyState icon="🛍️">{t("player.boutique.empty")}</EmptyState>
                    )}
                    {boutiqueBadges.length > 0 && (
                      <section className="flex flex-col gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.boutique.badges")}</h3>
                        <div className="flex flex-wrap gap-2">
                          {boutiqueBadges.map((option) => {
                            const unlocked = isCosmeticUnlocked(option.unlock!, unlockCtx);
                            const requirement = cosmeticRequirementLabel(option.unlock!);
                            return (
                              <button
                                key={option.emoji}
                                onClick={() => unlocked && chooseBadge(option.emoji)}
                                aria-label={unlocked ? t("player.badge.useEmoji", { emoji: option.emoji }) : t("player.badge.lockedAriaLabel", { emoji: option.emoji, requirement })}
                                title={unlocked ? undefined : requirement}
                                className={`relative grid aspect-square w-11 place-items-center rounded-lg text-[var(--heading)] transition ${
                                  !unlocked
                                    ? `bg-[var(--panel-soft)] ${LOCKED_ITEM_CLASS}`
                                    : entry.badge === option.emoji
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
                      </section>
                    )}
                    {boutiqueFrames.length > 0 && (
                      <section className="flex flex-col gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.boutique.frames")}</h3>
                        <div className="flex flex-wrap gap-3">
                          {boutiqueFrames.map((option) => {
                            const unlocked = isCosmeticUnlocked(option.unlock!, unlockCtx);
                            return (
                              <button
                                key={option.id}
                                onClick={() => unlocked && chooseFrame(option.id)}
                                title={unlocked ? undefined : cosmeticRequirementLabel(option.unlock!)}
                                className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${
                                  !unlocked
                                    ? LOCKED_ITEM_CLASS
                                    : entry.avatar_frame === option.id
                                      ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]"
                                      : "hover:bg-[var(--panel-soft)]"
                                }`}
                              >
                                <AvatarFrame frame={option.id} size={44}>
                                  <PlayerAvatar avatar={avatarInfo} updatedAt={entry.updated_at} size={44} />
                                </AvatarFrame>
                                <span className="text-[10px] text-[var(--faint)]">{lockedCaption(option.label, unlocked)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}
                    {boutiqueTitles.length > 0 && (
                      <section className="flex flex-col gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.boutique.titles")}</h3>
                        <div className="flex flex-wrap gap-2">
                          {boutiqueTitles.map((option) => {
                            const unlocked = isCosmeticUnlocked(option.unlock!, unlockCtx);
                            return (
                              <button
                                key={option.id}
                                onClick={() => unlocked && chooseTitle(option.id)}
                                title={unlocked ? undefined : cosmeticRequirementLabel(option.unlock!)}
                                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                  !unlocked
                                    ? `border-[var(--border)] text-[var(--faint)] ${LOCKED_ITEM_CLASS}`
                                    : entry.title === option.id
                                      ? "border-[var(--accent)] text-[var(--accent)]"
                                      : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                                }`}
                              >
                                {lockedCaption(option.label, unlocked)}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}
                    {boutiqueBanners.length > 0 && (
                      <section className="flex flex-col gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.boutique.banners")}</h3>
                        <div className="flex flex-wrap gap-3">
                          {boutiqueBanners.map((option) => {
                            const unlocked = isCosmeticUnlocked(option.unlock!, unlockCtx);
                            return (
                              <button
                                key={option.id}
                                onClick={() => unlocked && chooseBanner(option.id)}
                                title={unlocked ? undefined : cosmeticRequirementLabel(option.unlock!)}
                                className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${
                                  !unlocked
                                    ? LOCKED_ITEM_CLASS
                                    : entry.banner === option.id
                                      ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]"
                                      : "hover:bg-[var(--panel-soft)]"
                                }`}
                              >
                                <div className="h-10 w-16 rounded-md" style={{ background: option.css }} />
                                <span className="text-[10px] text-[var(--faint)]">{lockedCaption(option.label, unlocked)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}
                  </div>
                );
              })()}

              {editTab === "name" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.nameEditor.heading")}</h2>
                <p className="text-xs text-[var(--faint)]">
                  {t("player.nameEditor.description")}
                </p>
                <form onSubmit={handleSaveName} className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder={t("player.nameEditor.placeholder")}
                      maxLength={MAX_DISPLAY_NAME_LENGTH}
                      className="flex-1 rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
                    />
                    <button
                      type="submit"
                      disabled={nameSaveState === "saving"}
                      className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-50"
                    >
                      {t("common.save")}
                    </button>
                  </div>
                  {nameAvailability === "checking" && <p className="text-xs text-[var(--faint)]">{t("player.nameEditor.checking")}</p>}
                  {nameAvailability === "available" && <p className="text-xs text-[var(--accent)]">{t("player.nameEditor.available")}</p>}
                  {nameAvailability === "taken" && <p className="text-xs text-[var(--danger)]">{t("player.nameEditor.taken")}</p>}
                </form>
                {nameError && <p className="text-xs text-[var(--danger)]">{nameError}</p>}
                {nameSaveState === "saved" && !nameError && <p className="text-xs text-[var(--muted)]">{t("common.saved")}</p>}
                {nameSaveState === "error" && !nameError && <p className="text-xs text-[var(--danger)]">{t("common.error")}</p>}
                </div>

                <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.bioEditor.heading")}</h2>
                <p className="text-xs text-[var(--faint)]">{t("player.bioEditor.description")}</p>
                <form onSubmit={handleSaveBio} className="flex flex-col gap-2">
                  <textarea
                    value={bioInput}
                    onChange={(e) => setBioInput(e.target.value)}
                    placeholder={t("player.bioEditor.placeholder")}
                    maxLength={MAX_BIO_LENGTH}
                    rows={2}
                    className="resize-none rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--faint)]">{bioInput.length} / {MAX_BIO_LENGTH}</span>
                    <button type="submit" disabled={bioSaveState === "saving"} className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow disabled:opacity-50">
                      {t("common.save")}
                    </button>
                  </div>
                </form>
                {bioSaveState === "saved" && <p className="text-xs text-[var(--muted)]">{t("common.saved")}</p>}
                {bioSaveState === "error" && <p className="text-xs text-[var(--danger)]">{t("common.error")}</p>}
                </div>
              </div>
              )}
            </section>
          )}

          {!isSelf && headToHead && (
            <section>
              <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                {t("player.headToHead.heading")}
              </h2>
              <div className="grid grid-cols-3 gap-2">
                <StatTile label={t("player.headToHead.wins")} value={headToHead.wins} />
                <StatTile label={t("player.headToHead.losses")} value={headToHead.losses} />
                <StatTile label={t("player.headToHead.ties")} value={headToHead.ties} />
              </div>
              <p className="mt-1.5 text-center text-[10px] text-[var(--faint)]">
                {tPlural("player.headToHead.games", headToHead.gamesTogether, { count: headToHead.gamesTogether })}
              </p>
            </section>
          )}

          {/* flex-wrap + a fixed 3-per-row basis (not grid-cols-3) so an
              incomplete last row — 11 tiles is 3 full rows plus a row of
              2 — centers instead of hugging the grid's left edge. */}
          <section className="flex flex-wrap justify-center gap-2">
            {[
              { id: "achievements", label: t("player.stats.achievements"), value: `${entry.achievements_unlocked}/${TOTAL_ACHIEVEMENTS}` },
              { id: "totalXp", label: t("player.stats.totalXp"), value: entry.total_xp },
              { id: "games", label: t("player.stats.games"), value: entry.games_played },
              { id: "winRate", label: t("player.stats.winRate"), value: formatWinRate(entry.games_played, entry.games_won) },
              { id: "avgScore", label: t("player.stats.avgScore"), value: formatScore(entry.average_score) },
              { id: "worstScore", label: t("player.stats.worstScore"), value: formatScore(entry.worst_score) },
              { id: "dailyStreak", label: t("player.stats.dailyStreak"), value: entry.daily_deal_streak },
              { id: "bestStreak", label: t("player.stats.bestStreak"), value: entry.daily_deal_best_streak },
              { id: "mpWins", label: t("player.stats.mpWins"), value: entry.mp_games_won ?? 0 },
              { id: "mpWinRate", label: t("player.stats.mpWinRate"), value: formatMpWinRate(entry.mp_games_played ?? 0, entry.mp_games_won ?? 0) },
              { id: "mpStreak", label: t("player.stats.mpStreak"), value: entry.mp_best_win_streak ?? 0 },
            ].map((tile) => (
              <StatTile key={tile.id} label={tile.label} value={tile.value} className="w-[calc((100%-1rem)/3)]" />
            ))}
          </section>

          {/* ── Trophy case — public; empty slots only shown to yourself ── */}
          {(entry.showcase.length > 0 || isSelf) && (
            <section>
              <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                {t("player.trophyCase.heading")}
              </h2>
              <div className="flex flex-wrap justify-center gap-3">
                {entry.showcase.map((key) => resolveShowcaseItem(key, t)).map((item, i) =>
                  item ? (
                    <TrophyBadge key={item.key} item={item} rarityLabel={formatRarity(rarity?.[item.key])} />
                  ) : (
                    <EmptyTrophySlot key={`stale-${i}`} />
                  )
                )}
                {isSelf &&
                  Array.from({ length: Math.max(0, MAX_SHOWCASE_ITEMS - entry.showcase.length) }).map((_, i) => (
                    <EmptyTrophySlot key={`empty-${i}`} />
                  ))}
              </div>
            </section>
          )}


          {/* ── Private — only you can see this ── */}
          {isSelf && (
            <>
              <div className="flex items-center gap-3 border-t border-[var(--border)] pt-6">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.activity.heading")}</h2>
                <span className="text-[10px] text-[var(--faint)]">{t("player.activity.privacyNote")}</span>
              </div>

              {privateLoading ? (
                <LoadingSpinner />
              ) : privateStatsError ? (
                <p className="text-sm text-[var(--danger)]">{t("player.stats.loadError")}</p>
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
                      <p className="text-xs uppercase tracking-wide text-[var(--faint)]">{t("player.level.progress")}</p>
                      {level && (
                        <p className="text-xs text-[var(--faint)]">
                          {t("player.level.xpProgress", {
                            into: level.xpIntoLevel,
                            span: level.xpSpanForLevel,
                            next: level.level + 1,
                            total: level.totalXp,
                          })}
                        </p>
                      )}
                    </div>
                  </section>

                  {/* Closest goal — same nudge Home shows on its own card,
                      surfaced here too since a profile visit is exactly
                      the moment to see what's next. */}
                  {closestAchievement && (
                    <section className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4">
                      <div className="flex items-center gap-3">
                        <AchievementIcon
                          category={closestAchievement.category}
                          className="h-6 w-6 shrink-0 text-[var(--accent)]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[var(--heading)]">
                            {t("player.closestGoal.progress", {
                              pct: Math.round(closestAchievement.progressFraction * 100),
                              tier: capitalize(t(`common.difficulty.${closestAchievement.tier}` as TranslationKey)),
                              family: t(closestAchievement.familyTitleKey as TranslationKey),
                            })}
                          </p>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
                            <div
                              className="h-full rounded-full bg-[var(--accent)]"
                              style={{ width: `${Math.round(closestAchievement.progressFraction * 100)}%` }}
                            />
                          </div>
                        </div>
                        <Link href="/achievements" className="shrink-0 text-xs font-medium text-[var(--accent)] hover:underline">
                          {t("player.closestGoal.view")}
                        </Link>
                      </div>
                    </section>
                  )}

                  {/* Highlights */}
                  <section className="grid grid-cols-2 gap-3">
                    <Highlight label={t("player.highlights.rarestUnlock")}>
                      {rarest ? (
                        <span className="flex items-center gap-1.5">
                          <AchievementIcon category={rarest.category} className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                          <span className="truncate">
                            {t(rarest.familyTitleKey as TranslationKey)} {tierNumber(rarest.tier)}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                      <span className="mt-0.5 block text-[10px] text-[var(--faint)]">
                        {rarest
                          ? t("player.highlights.tierSuffix", { tier: capitalize(t(`common.difficulty.${rarest.tier}` as TranslationKey)) })
                          : t("player.highlights.nothingUnlocked")}
                      </span>
                    </Highlight>
                    <Highlight label={t("player.highlights.toughestAiBeaten")}>
                      <span className="capitalize">{toughestBeaten ? t(`common.difficulty.${toughestBeaten}` as TranslationKey) : "—"}</span>
                      <span className="mt-0.5 block text-[10px] text-[var(--faint)]">
                        {toughestBeaten
                          ? tPlural("player.highlights.wins", privateStats.wins_by_difficulty?.[toughestBeaten] ?? 0, {
                              count: privateStats.wins_by_difficulty?.[toughestBeaten] ?? 0,
                            })
                          : t("player.highlights.noWinsRecorded")}
                      </span>
                    </Highlight>
                    <Highlight label={t("player.highlights.bestDailyStreak")}>
                      {(dailyDealBestStreak ?? 0) > 0 ? `🔥 ${dailyDealBestStreak}` : "—"}
                      <span className="mt-0.5 block text-[10px] text-[var(--faint)]">{t("player.highlights.daysInARow")}</span>
                    </Highlight>
                    <Highlight label={t("player.highlights.bestGame")}>
                      {formatScore(privateStats.best_score)}
                      <span className="mt-0.5 block text-[10px] text-[var(--faint)]">{t("player.highlights.lowestFinalScore")}</span>
                    </Highlight>
                  </section>

                  {/* The two figures not already shown in the public tiles above
                      (which cover games played/win rate/avg/worst already). */}
                  <section className="grid grid-cols-2 gap-3">
                    <StatTile label={t("player.stats.gamesWon")} value={privateStats.games_won} />
                    <StatTile label={t("player.stats.gamesTied")} value={privateStats.games_tied} sub={t("player.stats.rareResult")} />
                  </section>

                  {/* Wins by difficulty */}
                  <section>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                      {t("player.winsByDifficulty.heading")}
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {DIFFICULTIES.map((d) => (
                        <div key={d} className="rounded-lg bg-[var(--panel)] px-3 py-2 text-center text-sm capitalize">
                          <div className="font-semibold text-[var(--heading)]">{privateStats.wins_by_difficulty[d] ?? 0}</div>
                          <div className="text-xs text-[var(--faint)]">{t(`common.difficulty.${d}` as TranslationKey)}</div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Multiplayer — vs. real people only (these games also feed
                      the overall stats above). */}
                  {mpStats && mpStats.played > 0 && (
                    <section>
                      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                        {t("player.multiplayerStats.heading")}
                      </h2>
                      <div className="grid grid-cols-3 gap-3">
                        <StatTile label={t("player.stats.played")} value={mpStats.played} />
                        <StatTile
                          label={t("player.stats.winStreak")}
                          value={mpStats.currentWinStreak}
                          sub={mpStats.bestWinStreak > 0 ? t("player.stats.bestStreakSub", { count: mpStats.bestWinStreak }) : undefined}
                        />
                        <StatTile label={t("player.stats.podiumFinishes")} value={mpStats.podiums} sub={t("player.stats.topHalfOfTable")} />
                        {mpStats.biggestTableBeaten > 0 && (
                          <StatTile
                            label={t("player.stats.biggestTableWon")}
                            value={t("player.stats.tableSizeAbbr", { count: mpStats.biggestTableBeaten })}
                          />
                        )}
                      </div>
                    </section>
                  )}

                  {/* Achievement showcase */}
                  <section className="rounded-2xl bg-[var(--panel)] p-5">
                    <div className="flex items-baseline justify-between">
                      <h2 className="text-sm font-semibold text-[var(--heading)]">{t("player.stats.achievements")}</h2>
                      <Link href="/achievements" className="text-xs font-medium text-[var(--accent)] hover:underline">
                        {t("player.achievements.viewAll")}
                      </Link>
                    </div>
                    <p className="mt-1 text-2xl font-extrabold text-[var(--heading)]">
                      {unlocked.length}
                      <span className="text-base font-medium text-[var(--faint)]"> / {TOTAL_ACHIEVEMENTS}</span>
                    </p>
                    <p className="text-xs text-[var(--faint)]">
                      {t("player.achievements.familiesMastered", { count: masteredFamilies, total: ACHIEVEMENT_FAMILIES.length })}
                    </p>
                    <div className="mt-3 flex gap-1.5">
                      {ACHIEVEMENT_TIERS.map((tier) => {
                        const n = unlockedByTier[tier];
                        const max = ACHIEVEMENT_FAMILIES.length;
                        return (
                          <div key={tier} className="flex-1 text-center">
                            <div className="flex h-16 w-full items-end overflow-hidden rounded-md bg-[var(--panel-soft)]">
                              <div className="w-full rounded-t-[3px] bg-[var(--accent)]" style={{ height: `${(n / max) * 100}%` }} />
                            </div>
                            <p className="mt-1 text-[10px] text-[var(--faint)]">{capitalize(t(`common.difficulty.${tier}` as TranslationKey))}</p>
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
                        {t("player.pastGames.heading")}
                        <span className="ml-2 font-normal normal-case tracking-normal text-[var(--faint)]">
                          {t("player.pastGames.lastN", { count: Math.min(history.length, PAST_GAMES_LIMIT) })}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-[var(--faint)] transition group-open:rotate-180">
                        ▼
                      </span>
                    </summary>
                    {history.length === 0 ? (
                      <div className="border-t border-[var(--border)] p-3">
                        <EmptyState icon="🎲">{t("player.pastGames.empty")}</EmptyState>
                      </div>
                    ) : (
                      <ul className="flex flex-col gap-2 border-t border-[var(--border)] p-3">
                        {history.map((g) => {
                          const yourScore = yourScoreFor(g);
                          const wonOrTied = yourScore !== null && g.winner_score != null && yourScore === g.winner_score;
                          return (
                            <li key={g.id} className="rounded-lg bg-[var(--panel)] px-4 py-3 text-sm">
                              <div className="flex items-center justify-between">
                                <span className={`font-medium ${wonOrTied ? "text-[var(--accent)]" : "text-[var(--heading)]"}`}>
                                  {t("player.pastGames.winner", { name: g.winner })}
                                  {g.winner_score != null && (
                                    <span className={`font-normal ${wonOrTied ? "" : "text-[var(--faint)]"}`}> ({t("game.hand.pts", { count: g.winner_score })})</span>
                                  )}
                                </span>
                                <span className="text-xs text-[var(--faint)]">
                                  {new Date(g.played_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                                </span>
                              </div>
                              {yourScore !== null && !wonOrTied && (
                                <p className="mt-0.5 text-xs text-[var(--muted)]">{t("player.pastGames.yourScore", { score: yourScore })}</p>
                              )}
                              <p className="mt-1 text-xs text-[var(--faint)]">{t("player.pastGames.vs", { names: g.opponents.map((o) => o.name).join(", ") })}</p>
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
                          {t("player.pastGames.mpHeading")}
                          <span className="ml-2 font-normal normal-case tracking-normal text-[var(--faint)]">{t("player.pastGames.lastN", { count: mpHistory.length })}</span>
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
                            ? mg.seats.find((s) => s.userId === mg.winner_user_id)?.name ?? t("multiplayer.someone")
                            : t("player.pastGames.anAi");
                          const won = mg.your_outcome === "won";
                          return (
                            <li key={mg.game_id} className="rounded-lg bg-[var(--panel)] px-4 py-3 text-sm">
                              <div className="flex items-center justify-between">
                                <span className={`font-medium ${won ? "text-[var(--accent)]" : "text-[var(--heading)]"}`}>
                                  {won
                                    ? t("player.pastGames.youWon")
                                    : mg.your_outcome === "resigned"
                                      ? t("player.pastGames.youLeft")
                                      : t("player.pastGames.lostTo", { winner: winnerName })}
                                </span>
                                <span className="text-xs text-[var(--faint)]">
                                  {mg.completed_at ? new Date(mg.completed_at).toLocaleDateString(locale, { dateStyle: "medium" }) : ""}
                                </span>
                              </div>
                              {myScore != null && <p className="mt-0.5 text-xs text-[var(--muted)]">{t("player.pastGames.yourScore", { score: myScore })}</p>}
                              <p className="mt-1 text-xs text-[var(--faint)]">
                                {t("player.pastGames.vs", { names: mg.seats.filter((s) => s.userId !== user?.id).map((s) => s.name).join(", ") })}
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
                      {t("home.newGame")}
                    </Link>
                  }
                >
                  {t("player.noGames.body")}
                </EmptyState>
              )}
            </>
          )}
        </>
      )}

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        {t("common.backToHome")}
      </Link>
    </main>
  );
}
