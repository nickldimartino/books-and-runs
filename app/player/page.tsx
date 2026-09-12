"use client";

// A player's public profile — reachable by clicking a name on the
// Leaderboard or Friends page (see leaderboardStore.ts's playerProfileHref).
// Shows the same public snapshot the Leaderboard already exposes
// (leaderboard_entries — any signed-in account can read any row, see
// migration 0006) as a proper profile card instead of a table row: avatar,
// display name, bio, level, and every stat column. Viewing your own profile
// (?id matches the signed-in user) additionally shows the editor for all of
// it — display name, bio, and avatar (emoji+color, or an uploaded photo) —
// which is why this page, not the Account page, is where those live now.
//
// A query param, not a dynamic route segment: this app is a static export
// (next.config.ts), and the Friends page's own `?add=CODE` link already
// uses the same pattern.

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import {
  ACHIEVEMENT_FAMILIES,
  ACHIEVEMENT_TIERS,
  MP_WIN_RATE_MIN_GAMES,
  WIN_RATE_MIN_GAMES,
} from "@/achievements";
import { useAuth } from "../AuthContext";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { COLOR_OPTIONS, EMOJI_OPTIONS } from "../lib/avatarPresets";
import { InvalidAvatarFileError, uploadAvatarPhoto } from "../lib/avatarUpload";
import { getFriendRequests, getFriends, sendFriendRequest } from "../lib/friendsStore";
import {
  AvatarInfo,
  DisplayNameTakenError,
  LeaderboardEntry,
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  displayNameFor,
  isDisplayNameAvailable,
  reportProfilePhoto,
  revertToEmojiAvatar,
  syncLeaderboardStats,
  updateLeaderboardAvatarEmoji,
  updateLeaderboardAvatarPhoto,
  updateLeaderboardBio,
  updateLeaderboardDisplayName,
} from "../lib/leaderboardStore";
import { formatScore } from "../lib/formatScore";
import { supabase } from "../lib/supabaseClient";

const TOTAL_ACHIEVEMENTS = ACHIEVEMENT_FAMILIES.length * ACHIEVEMENT_TIERS.length;

type SaveState = "idle" | "saving" | "saved" | "error";

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

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-center">
      <p className="text-lg font-bold tabular-nums text-[var(--heading)]">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--faint)]">{label}</p>
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

  async function saveEmojiAvatar() {
    if (!supabase || !user || !pendingEmoji || !pendingColor) return;
    setAvatarSaveState("saving");
    try {
      await updateLeaderboardAvatarEmoji(supabase, user.id, pendingEmoji, pendingColor);
      setEntry((prev) =>
        prev ? { ...prev, avatar_kind: "emoji", avatar_emoji: pendingEmoji, avatar_color: pendingColor } : prev
      );
      setAvatarSaveState("saved");
    } catch (err) {
      console.error("Failed to save avatar:", err);
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
          <PageTip id="player-profile" title="Your public profile">
            {isSelf
              ? "This is what other players see on the Leaderboard and Friends list. Pick an emoji-and-color avatar or upload a photo, add a bio, and set a display name below — names are unique, so the game checks it's not already taken before saving."
              : "Every signed-in player has one of these — tap a name anywhere (Leaderboard, Friends) to open it. Add them as a friend right from here."}
          </PageTip>

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

          {isSelf && (
            <>
              <section className="flex flex-col gap-3 border-t border-[var(--border)] pt-6">
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
                    {avatarSaveState === "error" && <p className="text-xs text-[var(--danger)]">Couldn&apos;t save — try again.</p>}
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

              <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-6">
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

              <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-6">
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
