import type { User } from "@supabase/supabase-js";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { fetchAchievementRarity, RarityMap } from "../lib/achievementRarity";
import type { PremiumEmojiOption } from "../lib/avatarPresets";
import { InvalidAvatarFileError, uploadAvatarPhoto } from "../lib/avatarUpload";
import {
  CosmeticLockedError,
  DisplayNameTakenError,
  isDisplayNameAvailable,
  LeaderboardEntry,
  revertToEmojiAvatar,
  updateLeaderboardAvatarEmoji,
  updateLeaderboardAvatarFrame,
  updateLeaderboardAvatarPhoto,
  updateLeaderboardBadge,
  updateLeaderboardBanner,
  updateLeaderboardBio,
  updateLeaderboardDisplayName,
  updateLeaderboardTitle,
} from "../lib/leaderboardStore";
import { ContentRejectedError, contentRejectionKey } from "../lib/safetyStore";
import { useT } from "../lib/i18n/LocaleProvider";
import { translateError } from "../lib/i18n/serverErrors";
import { supabase } from "../lib/supabaseClient";

type SaveState = "idle" | "saving" | "saved" | "error";
export type EditTab = "picture" | "badge" | "trophies" | "frame" | "title" | "banner" | "boutique" | "name";

/**
 * Every "you can change this about your own profile" concern: which editor
 * tab is open, and the save-state/handler for each individually-saved field
 * (display name, bio, avatar, frame, title, banner, badge). Nothing here
 * reads or writes anything BUT `entry` — no fetch of its own, no unlock
 * checks (that's usePlayerPrivateData's `unlockCtx`, passed into
 * EditProfileDialog alongside this hook's return value) — so it stays
 * meaningful even called on a signed-out/other-profile render (every
 * handler below already no-ops without `user`).
 */
export function usePlayerEditState(entry: LeaderboardEntry | null, setEntry: (updater: (prev: LeaderboardEntry | null) => LeaderboardEntry | null) => void, user: User | null, isSelf: boolean) {
  const { t } = useT();

  const [editingProfile, setEditingProfile] = useState(false);
  const [editTab, setEditTab] = useState<EditTab>("picture");

  // A Boutique purchase's "Equip now"/"Equip" link (see app/boutique's
  // equipHrefFor) lands here as `?edit=1&tab=<tab>` — jump straight to the
  // right tab, already expanded, instead of making someone re-find it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const validTabs = ["picture", "badge", "trophies", "frame", "title", "banner", "boutique", "name"] as const;
    if (params.get("edit") === "1") setEditingProfile(true);
    if (tab && (validTabs as readonly string[]).includes(tab)) setEditTab(tab as EditTab);
  }, []);

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
      } else if (err instanceof ContentRejectedError) {
        setNameError(t(contentRejectionKey(err.issue, "name")));
      } else {
        console.error("Failed to save display name:", err);
      }
      setNameSaveState("error");
    }
  }

  // ── Self-editing: bio ──────────────────────────────────────────────────
  const [bioInput, setBioInput] = useState("");
  const [bioSaveState, setBioSaveState] = useState<SaveState>("idle");
  const [bioError, setBioError] = useState<string | null>(null);

  useEffect(() => {
    if (entry && isSelf) setBioInput(entry.bio ?? "");
  }, [entry, isSelf]);

  async function handleSaveBio(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    setBioSaveState("saving");
    setBioError(null);
    try {
      const trimmed = bioInput.trim();
      await updateLeaderboardBio(supabase, user.id, trimmed.length > 0 ? trimmed : null);
      setEntry((prev) => (prev ? { ...prev, bio: trimmed || null } : prev));
      setBioSaveState("saved");
    } catch (err) {
      if (err instanceof ContentRejectedError) {
        setBioError(t(contentRejectionKey(err.issue, "bio")));
      } else {
        console.error("Failed to save bio:", err);
      }
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

  return {
    editingProfile,
    setEditingProfile,
    editTab,
    setEditTab,
    rarity,
    nameInput,
    setNameInput,
    nameSaveState,
    nameError,
    nameAvailability,
    handleSaveName,
    bioInput,
    setBioInput,
    bioSaveState,
    bioError,
    handleSaveBio,
    avatarTab,
    setAvatarTab,
    pendingEmoji,
    pendingColor,
    avatarSaveState,
    photoState,
    photoError,
    fileInputRef,
    chooseEmoji,
    chooseColor,
    handlePhotoChosen,
    handleUseEmojiInstead,
    frameSaveState,
    frameSaveError,
    frameInfo,
    setFrameInfo,
    chooseFrame,
    titleSaveState,
    titleSaveError,
    titleInfo,
    setTitleInfo,
    chooseTitle,
    bannerSaveState,
    bannerSaveError,
    bannerInfo,
    setBannerInfo,
    chooseBanner,
    badgeSaveState,
    badgeSaveError,
    badgeInfo,
    setBadgeInfo,
    chooseBadge,
  };
}

export type PlayerEditState = ReturnType<typeof usePlayerEditState>;
export type { PremiumEmojiOption };
