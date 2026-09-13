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
import { AvatarFrame } from "../components/AvatarFrame";
import { EmptyState } from "../components/EmptyState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { EmojiOrBadge, PremiumBadgeIcon } from "../components/PremiumBadgeIcon";
import { ProfileBanner } from "../components/ProfileBanner";
import { RankBadge } from "../components/RankBadge";
import { fetchAchievementRarity, formatRarity, RarityMap } from "../lib/achievementRarity";
import {
  COLOR_OPTIONS,
  EMOJI_OPTIONS,
  findPremiumEmojiOption,
  isPremiumEmojiUnlocked,
  PREMIUM_EMOJI_OPTIONS,
  premiumEmojiRequirementLabel,
} from "../lib/avatarPresets";
import { InvalidAvatarFileError, uploadAvatarPhoto } from "../lib/avatarUpload";
import { BANNER_OPTIONS, findBannerOption } from "../lib/bannerPresets";
import { loadLocalCardBack } from "../lib/cardBackStore";
import { loadLocalCardFace } from "../lib/cardFaceStore";
import { cosmeticRequirementLabel, isCosmeticUnlocked } from "../lib/cosmeticUnlocks";
import { formatScore } from "../lib/formatScore";
import { getFriendRequests, getFriends, sendFriendRequest } from "../lib/friendsStore";
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
  updateShowcaseCardBack,
  updateShowcaseCardFace,
} from "../lib/leaderboardStore";
import { EMPTY_MP_STATS, getMyMpHistory, getMyMpStats, MpHistoryEntry, MpStats } from "../lib/mpStore";
import { AVATAR_FRAME_COLOR, AVATAR_FRAME_OPTIONS, findAvatarFrameOption, findTitleOption, TITLE_OPTIONS } from "../lib/profileCosmetics";
import { computeRank } from "../lib/rank";
import { RoundHistoryEntry } from "../lib/recordGameResult";
import { renderProfileShareCard } from "../lib/shareCard";
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
 * earned at (bronze beginner → diamond expert). Expert-tier medals get an
 * animated foil sweep — the rarest tier is the one worth a little shine. */
function TrophyBadge({ item, size = 56, rarityLabel }: { item: ShowcaseItem; size?: number; rarityLabel?: string | null }) {
  return (
    <div
      className="flex flex-col items-center gap-1"
      title={`${item.familyTitle} · ${TIER_LABEL[item.tier]}${rarityLabel ? ` · ${rarityLabel}` : ""}`}
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
    showcase_card_back: null,
    showcase_card_face: null,
    banner: null,
    joined_at: null,
    is_creator: false,
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
        // Backfill the public card-back/face mirror for an account that
        // set these before migration 0028 existed — same bootstrap-push
        // idea as accountSettingsSync.ts's bootstrapMissingAccountSettings.
        // Self-view itself never needs to wait on this (see displayCardBack/
        // Face below, which read local storage directly for isSelf) — this
        // is purely so a *visitor* to this profile later sees it too.
        if (profileId === user.id) {
          if (row.showcase_card_back === null) {
            updateShowcaseCardBack(client, profileId, loadLocalCardBack()).catch(() => {});
          }
          if (row.showcase_card_face === null) {
            updateShowcaseCardFace(client, profileId, loadLocalCardFace()).catch(() => {});
          }
        }
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
      await reportProfilePhoto(supabase, user.id, profileId, reportReason.trim() || null);
      setReportState("sent");
    } catch (err) {
      console.error("Failed to report photo:", err);
      setReportState("error");
    }
  }

  // ── Edit profile (self only) — collapsed until asked for ───────────────
  const [editingProfile, setEditingProfile] = useState(false);
  const [editTab, setEditTab] = useState<"picture" | "badge" | "trophies" | "frame" | "title" | "banner" | "name">(
    "picture"
  );

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

  // ── Self-editing: avatar frame ──────────────────────────────────────────
  const [frameSaveState, setFrameSaveState] = useState<SaveState>("idle");
  const [frameSaveError, setFrameSaveError] = useState<string | null>(null);

  async function chooseFrame(frameId: string | null) {
    if (!supabase || !user) return;
    setFrameSaveState("saving");
    setFrameSaveError(null);
    try {
      await updateLeaderboardAvatarFrame(supabase, user.id, frameId);
      setEntry((prev) => (prev ? { ...prev, avatar_frame: frameId } : prev));
      setFrameSaveState("saved");
    } catch (err) {
      if (err instanceof CosmeticLockedError) setFrameSaveError(err.message);
      else console.error("Failed to save avatar frame:", err);
      setFrameSaveState("error");
    }
  }

  // ── Self-editing: nameplate title ───────────────────────────────────────
  const [titleSaveState, setTitleSaveState] = useState<SaveState>("idle");
  const [titleSaveError, setTitleSaveError] = useState<string | null>(null);

  async function chooseTitle(titleId: string | null) {
    if (!supabase || !user) return;
    setTitleSaveState("saving");
    setTitleSaveError(null);
    try {
      await updateLeaderboardTitle(supabase, user.id, titleId);
      setEntry((prev) => (prev ? { ...prev, title: titleId } : prev));
      setTitleSaveState("saved");
    } catch (err) {
      if (err instanceof CosmeticLockedError) setTitleSaveError(err.message);
      else console.error("Failed to save title:", err);
      setTitleSaveState("error");
    }
  }

  // ── Self-editing: profile banner ────────────────────────────────────────
  const [bannerSaveState, setBannerSaveState] = useState<SaveState>("idle");
  const [bannerSaveError, setBannerSaveError] = useState<string | null>(null);

  async function chooseBanner(bannerId: string | null) {
    if (!supabase || !user) return;
    setBannerSaveState("saving");
    setBannerSaveError(null);
    try {
      await updateLeaderboardBanner(supabase, user.id, bannerId);
      setEntry((prev) => (prev ? { ...prev, banner: bannerId } : prev));
      setBannerSaveState("saved");
    } catch (err) {
      if (err instanceof CosmeticLockedError) setBannerSaveError(err.message);
      else console.error("Failed to save banner:", err);
      setBannerSaveState("error");
    }
  }

  // ── Self-editing: badge — an earned overlay on the avatar's corner,
  // separate from the picture itself (see migration 0031's own doc). ──────
  const [badgeSaveState, setBadgeSaveState] = useState<SaveState>("idle");
  const [badgeSaveError, setBadgeSaveError] = useState<string | null>(null);

  async function chooseBadge(badge: string | null) {
    if (!supabase || !user) return;
    setBadgeSaveState("saving");
    setBadgeSaveError(null);
    try {
      await updateLeaderboardBadge(supabase, user.id, badge);
      setEntry((prev) => (prev ? { ...prev, badge } : prev));
      setBadgeSaveState("saved");
    } catch (err) {
      if (err instanceof CosmeticLockedError) setBadgeSaveError(err.message);
      else console.error("Failed to save badge:", err);
      setBadgeSaveState("error");
    }
  }

  // ── Share profile card ──────────────────────────────────────────────────
  const [shareState, setShareState] = useState<"idle" | "working" | "error">("idle");

  async function shareProfileCard() {
    if (!entry) return;
    setShareState("working");
    // Written first, before any await — Safari in particular only honors
    // navigator.clipboard.writeText while the click's user-activation is
    // still fresh, and it silently no-ops (the promise still resolves)
    // rather than throwing once that window has passed. Doing this before
    // the async canvas render below, not after, is what actually gets the
    // link onto the clipboard instead of just appearing to.
    try {
      await navigator.clipboard?.writeText(`${window.location.origin}${playerProfileHref(entry.user_id)}`);
    } catch {
      // Best-effort — the picture share below still goes ahead either way.
    }
    try {
      const frameOption = findAvatarFrameOption(entry.avatar_frame);
      const titleOption = findTitleOption(entry.title);
      const rank = computeRank(entry.games_played, entry.games_won);
      const blob = await renderProfileShareCard({
        displayName: displayNameFor(entry),
        titleLabel: titleOption?.label ?? null,
        level: displayLevel,
        rankLabel: rank.tier?.label ?? null,
        avatarKind: entry.avatar_kind,
        avatarEmoji: entry.avatar_emoji,
        avatarColor: entry.avatar_color,
        avatarPhotoUrl:
          entry.avatar_kind === "photo" && entry.avatar_photo_path && supabase
            ? avatarPhotoUrlFor(supabase, entry.avatar_photo_path, entry.updated_at)
            : null,
        frameColor: frameOption
          ? (frameOption.id === "grandmaster" ? "#a855f7" : AVATAR_FRAME_COLOR[frameOption.id])
          : null,
        badge: entry.badge,
        stats: [
          { label: "Games", value: String(entry.games_played) },
          { label: "Achievements", value: `${entry.achievements_unlocked}/${TOTAL_ACHIEVEMENTS}` },
          { label: "Win rate", value: formatWinRate(entry.games_played, entry.games_won) },
        ],
        trophyColors: entry.showcase
          .map(resolveShowcaseItem)
          .filter((i): i is ShowcaseItem => !!i)
          .map((i) => TIER_RING_COLOR[i.tier]),
      });
      if (!blob) throw new Error("Canvas unavailable");
      const file = new File([blob], "books-and-runs-profile.png", { type: "image/png" });
      // Deliberately not navigator.share({files, url}) in one call — tried
      // that twice already; on at least one real device, canShare({files,
      // url}) reported true but the actual share sheet still silently
      // dropped the picture and sent only the link. Sharing the file alone
      // is the one thing reliably supported wherever canShare says files
      // work at all; the clipboard copy above gets the link into the same
      // chat with one paste, without depending on any share target's
      // handling of a multi-part payload.
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
      setShareState("idle");
    } catch (err) {
      console.error("Failed to share profile card:", err);
      setShareState("error");
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
    if (frameOption && !isCosmeticUnlocked(frameOption.unlock, level.level, progress)) {
      updateLeaderboardAvatarFrame(client, user.id, null)
        .then(() => setEntry((prev) => (prev ? { ...prev, avatar_frame: null } : prev)))
        .catch((err) => console.error("Failed to clear an over-privileged avatar frame:", err));
    }

    const titleOption = findTitleOption(entry.title);
    if (titleOption && !isCosmeticUnlocked(titleOption.unlock, level.level, progress)) {
      updateLeaderboardTitle(client, user.id, null)
        .then(() => setEntry((prev) => (prev ? { ...prev, title: null } : prev)))
        .catch((err) => console.error("Failed to clear an over-privileged title:", err));
    }

    const bannerOption = findBannerOption(entry.banner);
    if (bannerOption?.unlock && !isCosmeticUnlocked(bannerOption.unlock, level.level, progress)) {
      updateLeaderboardBanner(client, user.id, null)
        .then(() => setEntry((prev) => (prev ? { ...prev, banner: null } : prev)))
        .catch((err) => console.error("Failed to clear an over-privileged banner:", err));
    }

    const badgeOption = entry.badge ? findPremiumEmojiOption(entry.badge) : null;
    if (badgeOption && !isPremiumEmojiUnlocked(badgeOption, level.level, progress)) {
      updateLeaderboardBadge(client, user.id, null)
        .then(() => setEntry((prev) => (prev ? { ...prev, badge: null } : prev)))
        .catch((err) => console.error("Failed to clear an over-privileged badge:", err));
    }
  }, [user, isSelf, entry, level, progress, privateLoading]);

  const achievements = useMemo(() => allAchievements(progress), [progress]);
  const unlocked = useMemo(() => achievements.filter((a) => a.unlocked), [achievements]);
  // Same "closest goal" nudge Home already shows for its own card — surfaced
  // here too, since it's exactly the kind of thing a profile visit is for.
  const closestAchievement = useMemo(
    () =>
      achievements
        .filter((a) => !a.unlocked && a.progressFraction > 0 && a.progressFraction < 1)
        .sort((a, b) => b.progressFraction - a.progressFraction)[0] ?? null,
    [achievements]
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
  const titleOption = entry ? findTitleOption(entry.title) : null;
  const rank = entry ? computeRank(entry.games_played, entry.games_won) : { tier: null, winRate: null };
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
    ? `Joined ${new Date(entry.joined_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`
    : null;

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
              ? "The top is what other players see on the Leaderboard and Friends list — tap Edit profile for tabs to change your picture, frame, title, banner, name, bio, or pin achievements to your Trophy Case. Leveling up and mastering achievement categories unlocks exclusive frames, titles, and avatar emoji. Everything under \"Your activity\" further down is only ever visible to you."
              : "Every signed-in player has one of these — tap a name anywhere (Leaderboard, Friends) to open it. Add them as a friend right from here."}
          </PageTip>

          {/* ── Public — same for everyone, including your own view ── */}
          <ProfileBanner banner={entry.banner}>
            {isSelf ? (
              <button
                onClick={() => setEditingProfile((v) => !v)}
                aria-label={editingProfile ? "Done editing profile" : "Edit profile"}
                title={editingProfile ? "Done editing profile" : "Edit profile"}
                className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/20 text-white backdrop-blur-sm transition hover:bg-black/30"
              >
                <EditIcon />
              </button>
            ) : (
              related !== "related" && (
                <button
                  onClick={addFriend}
                  disabled={related === "requested"}
                  aria-label={related === "requested" ? "Friend request sent" : "Add friend"}
                  title={related === "requested" ? "Friend request sent" : "Add friend"}
                  className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/20 text-white backdrop-blur-sm transition hover:bg-black/30 disabled:opacity-60"
                >
                  {related === "requested" ? <PersonCheckIcon /> : <PersonAddIcon />}
                </button>
              )
            )}
            <button
              onClick={shareProfileCard}
              disabled={shareState === "working"}
              aria-label="Share profile card"
              title="Share profile card"
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
                    title="Earned badge"
                    className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--bg)] bg-[var(--panel)] p-1 shadow"
                  >
                    <EmojiOrBadge emoji={entry.badge} className="h-full w-full text-[var(--heading)]" />
                  </span>
                )}
              </div>

              {/* Identity: name, title, level/rank — kept tight and on-brand
                  regardless of banner, unlike bio/cosmetics/actions below,
                  which read fine in the page's normal muted tones. */}
              <h1 className={`flex items-center gap-1.5 text-xl font-bold ${onBanner ? "text-white" : "text-[var(--heading)]"}`}>
                {displayNameFor(entry)}
                {entry.is_creator && (
                  <span
                    title="Creator of Books & Runs"
                    aria-label="Creator of Books & Runs"
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${onBanner ? "bg-white/20 text-yellow-200" : "bg-[var(--accent)]/15 text-[var(--accent)]"}`}
                  >
                    <CreatorBadgeIcon />
                    Creator
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
                  Level {displayLevel}
                </span>
                <RankBadge rank={rank} />
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
                    Report photo
                  </button>
                )}
              </div>
              {shareState === "error" && (
                <p className="text-xs text-[var(--danger)]">Couldn&apos;t prepare that image — try again.</p>
              )}

              {(reportState === "open" || reportState === "sending") && (
                <form onSubmit={submitReport} className="mt-2 flex w-full flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-left">
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
                    ["picture", "Picture"],
                    ["badge", "Badge"],
                    ["trophies", "Trophies"],
                    ["frame", "Frame"],
                    ["title", "Title"],
                    ["banner", "Banner"],
                    ["name", "Name & Bio"],
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
                          onClick={() => chooseEmoji(emoji)}
                          aria-label={`Use ${emoji} as your avatar`}
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
                          aria-label={`Background color ${color.label}`}
                          title={color.label}
                          className={`h-7 w-7 rounded-full transition ${pendingColor === color.hex ? "ring-2 ring-offset-2 ring-offset-[var(--bg)] ring-[var(--accent)]" : ""}`}
                          style={{ backgroundColor: color.hex }}
                        />
                      ))}
                    </div>
                    {avatarSaveState === "saving" && <p className="text-xs text-[var(--faint)]">Saving…</p>}
                    {avatarSaveState === "saved" && <p className="text-xs text-[var(--muted)]">Saved.</p>}
                    {avatarSaveState === "error" && (
                      <p className="text-xs text-[var(--danger)]">Couldn&apos;t save — try again.</p>
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
              </div>
              )}

              {editTab === "badge" && (
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">Badge</h2>
                <p className="text-xs text-[var(--faint)]">
                  A small earned overlay on the corner of your avatar — shown alongside your picture,
                  not instead of it. Leveling up and mastering achievement categories unlock more.
                </p>
                <div className="grid grid-cols-8 gap-1.5">
                  <button
                    onClick={() => chooseBadge(null)}
                    aria-label="No badge"
                    className={`grid aspect-square place-items-center rounded-lg text-[10px] text-[var(--faint)] transition ${
                      !entry.badge ? "bg-[var(--accent)]/20 ring-2 ring-[var(--accent)]" : "bg-[var(--panel-soft)] hover:bg-[var(--panel)]"
                    }`}
                  >
                    None
                  </button>
                  {PREMIUM_EMOJI_OPTIONS.map((option) => {
                    const unlocked = isPremiumEmojiUnlocked(option, level?.level ?? 0, progress);
                    return (
                      <button
                        key={option.emoji}
                        onClick={() => (unlocked ? chooseBadge(option.emoji) : undefined)}
                        aria-label={
                          unlocked
                            ? `Use ${option.emoji} as your badge`
                            : `${option.emoji} locked — ${premiumEmojiRequirementLabel(option.unlock)}`
                        }
                        title={unlocked ? undefined : premiumEmojiRequirementLabel(option.unlock)}
                        className={`relative grid aspect-square place-items-center rounded-lg text-[var(--heading)] transition ${
                          !unlocked
                            ? "cursor-default bg-[var(--panel-soft)] opacity-40"
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
                {entry.badge && (
                  <p className="text-[10px] text-[var(--faint)]">
                    {premiumEmojiRequirementLabel(PREMIUM_EMOJI_OPTIONS.find((o) => o.emoji === entry.badge)!.unlock)}
                  </p>
                )}
                {badgeSaveState === "saving" && <p className="text-xs text-[var(--faint)]">Saving…</p>}
                {badgeSaveState === "saved" && <p className="text-xs text-[var(--muted)]">Saved.</p>}
                {badgeSaveState === "error" && (
                  <p className="text-xs text-[var(--danger)]">{badgeSaveError ?? "Couldn't save — try again."}</p>
                )}
              </div>
              )}

              {editTab === "trophies" && (
              <div className="flex flex-col gap-3">
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
              </div>
              )}

              {editTab === "frame" && (
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">Avatar frame</h2>
                <p className="text-xs text-[var(--faint)]">
                  A ring around your whole avatar, separate from the picture inside it — earned by leveling up or
                  mastering an achievement category.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => chooseFrame(null)}
                    className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${
                      !entry.avatar_frame ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]" : "hover:bg-[var(--panel-soft)]"
                    }`}
                  >
                    <AvatarFrame frame={null} size={44}>
                      <PlayerAvatar avatar={avatarInfo} updatedAt={entry.updated_at} size={44} />
                    </AvatarFrame>
                    <span className="text-[10px] text-[var(--faint)]">None</span>
                  </button>
                  {AVATAR_FRAME_OPTIONS.map((option) => {
                    const unlocked = isCosmeticUnlocked(option.unlock, level?.level ?? 0, progress);
                    return (
                      <button
                        key={option.id}
                        onClick={() => (unlocked ? chooseFrame(option.id) : undefined)}
                        title={unlocked ? undefined : cosmeticRequirementLabel(option.unlock)}
                        className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${
                          !unlocked
                            ? "cursor-default opacity-40"
                            : entry.avatar_frame === option.id
                              ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]"
                              : "hover:bg-[var(--panel-soft)]"
                        }`}
                      >
                        <AvatarFrame frame={unlocked ? option.id : null} size={44}>
                          <PlayerAvatar avatar={avatarInfo} updatedAt={entry.updated_at} size={44} />
                        </AvatarFrame>
                        <span className="text-[10px] text-[var(--faint)]">
                          {unlocked ? option.label : "🔒"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {frameSaveState === "saving" && <p className="text-xs text-[var(--faint)]">Saving…</p>}
                {frameSaveState === "saved" && <p className="text-xs text-[var(--muted)]">Saved.</p>}
                {frameSaveState === "error" && (
                  <p className="text-xs text-[var(--danger)]">{frameSaveError ?? "Couldn't save — try again."}</p>
                )}
              </div>
              )}

              {editTab === "title" && (
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">Title</h2>
                <p className="text-xs text-[var(--faint)]">Shown under your name — the same earn-it-first rewards as your avatar frame.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => chooseTitle(null)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      !entry.title ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                    }`}
                  >
                    None
                  </button>
                  {TITLE_OPTIONS.map((option) => {
                    const unlocked = isCosmeticUnlocked(option.unlock, level?.level ?? 0, progress);
                    return (
                      <button
                        key={option.id}
                        onClick={() => (unlocked ? chooseTitle(option.id) : undefined)}
                        title={unlocked ? undefined : cosmeticRequirementLabel(option.unlock)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          !unlocked
                            ? "cursor-default border-[var(--border)] text-[var(--faint)] opacity-50"
                            : entry.title === option.id
                              ? "border-[var(--accent)] text-[var(--accent)]"
                              : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                        }`}
                      >
                        {unlocked ? option.label : `🔒 ${option.label}`}
                      </button>
                    );
                  })}
                </div>
                {titleSaveState === "saving" && <p className="text-xs text-[var(--faint)]">Saving…</p>}
                {titleSaveState === "saved" && <p className="text-xs text-[var(--muted)]">Saved.</p>}
                {titleSaveState === "error" && (
                  <p className="text-xs text-[var(--danger)]">{titleSaveError ?? "Couldn't save — try again."}</p>
                )}
              </div>
              )}

              {editTab === "banner" && (
              <div className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">Profile banner</h2>
                <p className="text-xs text-[var(--faint)]">
                  A wide strip of color behind your name and picture — most are free to pick; one is a prestige
                  reward for mastering every achievement category.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => chooseBanner(null)}
                    className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${
                      !entry.banner ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]" : "hover:bg-[var(--panel-soft)]"
                    }`}
                  >
                    <div className="h-10 w-16 rounded-md border border-[var(--border)] bg-[var(--panel)]" />
                    <span className="text-[10px] text-[var(--faint)]">None</span>
                  </button>
                  {BANNER_OPTIONS.map((option) => {
                    const unlocked = !option.unlock || isCosmeticUnlocked(option.unlock, level?.level ?? 0, progress);
                    return (
                      <button
                        key={option.id}
                        onClick={() => (unlocked ? chooseBanner(option.id) : undefined)}
                        title={unlocked ? undefined : option.unlock && cosmeticRequirementLabel(option.unlock)}
                        className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${
                          !unlocked
                            ? "cursor-default opacity-40"
                            : entry.banner === option.id
                              ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]"
                              : "hover:bg-[var(--panel-soft)]"
                        }`}
                      >
                        <div className="h-10 w-16 rounded-md" style={{ background: option.css }} />
                        <span className="text-[10px] text-[var(--faint)]">
                          {unlocked ? option.label : "🔒"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {bannerSaveState === "saving" && <p className="text-xs text-[var(--faint)]">Saving…</p>}
                {bannerSaveState === "saved" && <p className="text-xs text-[var(--muted)]">Saved.</p>}
                {bannerSaveState === "error" && (
                  <p className="text-xs text-[var(--danger)]">{bannerSaveError ?? "Couldn't save — try again."}</p>
                )}
              </div>
              )}

              {editTab === "name" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
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
                </div>

                <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
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
                </div>
              </div>
              )}
            </section>
          )}

          {!isSelf && headToHead && (
            <section>
              <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                Head-to-head
              </h2>
              <div className="grid grid-cols-3 gap-2">
                <StatTile label="Wins" value={headToHead.wins} />
                <StatTile label="Losses" value={headToHead.losses} />
                <StatTile label="Ties" value={headToHead.ties} />
              </div>
              <p className="mt-1.5 text-center text-[10px] text-[var(--faint)]">
                Across {headToHead.gamesTogether} multiplayer game{headToHead.gamesTogether === 1 ? "" : "s"} together
              </p>
            </section>
          )}

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
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">Your activity</h2>
                <span className="text-[10px] text-[var(--faint)]">Only you can see what&apos;s below here</span>
              </div>

              {privateLoading ? (
                <LoadingSpinner />
              ) : privateStatsError ? (
                <p className="text-sm text-[var(--danger)]">Couldn&apos;t load your stats — check your connection and try again.</p>
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
                            {Math.round(closestAchievement.progressFraction * 100)}% of the way to{" "}
                            {TIER_LABEL[closestAchievement.tier]} · {closestAchievement.familyTitle}
                          </p>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-soft)]">
                            <div
                              className="h-full rounded-full bg-[var(--accent)]"
                              style={{ width: `${Math.round(closestAchievement.progressFraction * 100)}%` }}
                            />
                          </div>
                        </div>
                        <Link href="/achievements" className="shrink-0 text-xs font-medium text-[var(--accent)] hover:underline">
                          View →
                        </Link>
                      </div>
                    </section>
                  )}

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
