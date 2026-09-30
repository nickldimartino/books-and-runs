"use client";

// The "Edit profile" tabbed panel — one job: let the signed-in account
// change how their own profile looks (picture, badge, trophy case, frame,
// title, banner, Boutique items, name/bio). Split out of page.tsx, which
// used to be five jobs in one 2,400-line file (see CODEBASE_MAP.md); this
// piece owns none of its own data-fetching — `editState`
// (usePlayerEditState) and the relevant slice of `privateData`
// (usePlayerPrivateData) are threaded in as props exactly as the parent
// page already has them, so nothing about WHEN anything fetches changed.

import Link from "next/link";
import { EmptyState } from "../components/EmptyState";
import { AchievementIcon } from "../components/AchievementIcons";
import { AvatarFrame } from "../components/AvatarFrame";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { PremiumBadgeIcon } from "../components/PremiumBadgeIcon";
import { BoutiqueAvatarIcon } from "../components/BoutiqueAvatarIcon";
import {
  COLOR_OPTIONS,
  BOUTIQUE_AVATAR_EMOJI_OPTIONS,
  EMOJI_OPTIONS,
  isPremiumEmojiUnlocked,
  PREMIUM_EMOJI_OPTIONS,
} from "../lib/avatarPresets";
import { BANNER_OPTIONS } from "../lib/bannerPresets";
import { isCosmeticUnlocked } from "../lib/cosmeticUnlocks";
import { cosmeticRequirementText } from "../lib/cosmeticRequirementText";
import { LOCKED_ITEM_CLASS, lockedCaption } from "../lib/cosmeticLockStyle";
import { defaultRarityForUnlock, RARITY_TEXT_ACCENT } from "../lib/cosmeticRarity";
import type { TranslationKey } from "../lib/i18n/keys";
import { useT } from "../lib/i18n/LocaleProvider";
import { AvatarInfo, LeaderboardEntry, MAX_BIO_LENGTH, MAX_DISPLAY_NAME_LENGTH, MAX_SHOWCASE_ITEMS, showcaseKeyFor } from "../lib/leaderboardStore";
import { AVATAR_FRAME_OPTIONS, TITLE_OPTIONS } from "../lib/profileCosmetics";
import { itemSkuFor } from "../lib/storeSku";
import { capitalize } from "../lib/text";
import type { PlayerEditState } from "./usePlayerEditState";
import type { PlayerPrivateData } from "./usePlayerPrivateData";

// Medal-ring colors for the trophy case — bronze/silver/gold/platinum/
// diamond, matching the beginner→expert tier language used everywhere else
// in the achievement system.
const TIER_RING_COLOR: Record<string, string> = {
  beginner: "#CD7F32",
  easy: "#B0B8C1",
  medium: "#F5C518",
  hard: "#4FD1C5",
  expert: "#38BDF8",
};

export function EditProfileDialog({
  entry,
  editState,
  privateData,
}: {
  entry: LeaderboardEntry;
  editState: PlayerEditState;
  privateData: Pick<
    PlayerPrivateData,
    "unlockCtx" | "pickableTrophies" | "privateLoading" | "showcaseSelection" | "showcaseSaveState" | "toggleShowcaseItem" | "saveShowcase"
  >;
}) {
  const { t, tPlural } = useT();
  const req = (rule: Parameters<typeof cosmeticRequirementText>[2]) => cosmeticRequirementText(t, tPlural, rule);
  const { unlockCtx, pickableTrophies, privateLoading, showcaseSelection, showcaseSaveState, toggleShowcaseItem, saveShowcase } = privateData;
  const {
    editingProfile,
    editTab,
    setEditTab,
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
  } = editState;

  if (!editingProfile) return null;

  const avatarInfo: AvatarInfo = {
    kind: entry.avatar_kind,
    emoji: entry.avatar_emoji,
    color: entry.avatar_color,
    photoPath: entry.avatar_photo_path,
  };

  return (
    // ── Edit profile (self only, collapsed by default) — tabbed so
    // only one editor is open at a time; Trophies sits second, not
    // last, since curating your showcase is at least as common a
    // reason to open this as changing your picture. ──
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
                    : t("player.badge.lockedAriaLabel", { emoji: option.emoji, requirement: (option.unlock ? req(option.unlock) : t("player.badge.free")) })
                }
                title={unlocked ? undefined : (option.unlock ? req(option.unlock) : t("player.badge.free"))}
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
              <span>— {(shown.unlock ? req(shown.unlock) : t("player.badge.free"))}</span>
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
                  if (option.unlock) setFrameInfo(`${option.label} — ${req(option.unlock)}`);
                }}
                title={unlocked ? undefined : option.unlock && req(option.unlock)}
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
                  if (option.unlock) setTitleInfo(`${option.label} — ${req(option.unlock)}`);
                }}
                title={unlocked || !option.unlock ? undefined : req(option.unlock)}
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
                  if (option.unlock) setBannerInfo(`${option.label} — ${req(option.unlock)}`);
                }}
                title={unlocked ? undefined : option.unlock && req(option.unlock)}
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
        const boutiquePictures = BOUTIQUE_AVATAR_EMOJI_OPTIONS;
        const boutiqueFrames = AVATAR_FRAME_OPTIONS.filter((o) => o.source === "boutique");
        const boutiqueTitles = TITLE_OPTIONS.filter((o) => o.source === "boutique");
        const boutiqueBanners = BANNER_OPTIONS.filter((o) => o.source === "boutique");
        const isEmpty =
          boutiqueBadges.length === 0 &&
          boutiquePictures.length === 0 &&
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
                    const requirement = req(option.unlock!);
                    const className = `relative grid aspect-square w-11 place-items-center rounded-lg text-[var(--heading)] transition ${
                      !unlocked
                        ? `bg-[var(--panel-soft)] ${LOCKED_ITEM_CLASS}`
                        : entry.badge === option.emoji
                          ? "bg-[var(--accent)]/20 ring-2 ring-[var(--accent)]"
                          : "bg-[var(--panel-soft)] hover:bg-[var(--panel)]"
                    }`;
                    const content = (
                      <>
                        <PremiumBadgeIcon option={option} className="block h-2/3 w-2/3" />
                        {!unlocked && (
                          <span
                            aria-hidden="true"
                            className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-[var(--bg)] text-[8px] leading-none"
                          >
                            🔒
                          </span>
                        )}
                      </>
                    );
                    // A locked Boutique item is now a real thing to
                    // go buy, not a dead end — tapping it deep-links
                    // into the store instead of doing nothing.
                    return unlocked ? (
                      <button
                        key={option.emoji}
                        onClick={() => chooseBadge(option.emoji)}
                        aria-label={t("player.badge.useEmoji", { emoji: option.emoji })}
                        className={className}
                      >
                        {content}
                      </button>
                    ) : (
                      <Link
                        key={option.emoji}
                        href={`/boutique?item=${itemSkuFor("badge", option.emoji)}`}
                        aria-label={`${t("player.badge.lockedAriaLabel", { emoji: option.emoji, requirement })} — ${t("boutique.getInBoutique")}`}
                        title={`${requirement} — ${t("boutique.getInBoutique")}`}
                        className={className}
                      >
                        {content}
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}
            {boutiquePictures.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("player.boutique.pictures")}</h3>
                <div className="flex flex-wrap gap-2">
                  {boutiquePictures.map((option) => {
                    const unlocked = isCosmeticUnlocked(option.unlock, unlockCtx);
                    const equipped = entry.avatar_kind === "emoji" && entry.avatar_emoji === option.emoji;
                    const requirement = req(option.unlock);
                    const className = `relative grid aspect-square w-11 place-items-center rounded-full text-[var(--heading)] transition ${
                      !unlocked
                        ? `bg-[var(--panel-soft)] ${LOCKED_ITEM_CLASS}`
                        : equipped
                          ? "bg-[var(--accent)]/20 ring-2 ring-[var(--accent)]"
                          : "bg-[var(--panel-soft)] hover:bg-[var(--panel)]"
                    }`;
                    const content = (
                      <>
                        <BoutiqueAvatarIcon option={option} className="block h-2/3 w-2/3" />
                        {!unlocked && (
                          <span
                            aria-hidden="true"
                            className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-[var(--bg)] text-[8px] leading-none"
                          >
                            🔒
                          </span>
                        )}
                      </>
                    );
                    return unlocked ? (
                      <button
                        key={option.emoji}
                        onClick={() => chooseEmoji(option.emoji)}
                        aria-label={t("player.picture.useEmoji", { emoji: option.emoji })}
                        className={className}
                      >
                        {content}
                      </button>
                    ) : (
                      <Link
                        key={option.emoji}
                        href={`/boutique?item=${itemSkuFor("avatar_emoji", option.emoji)}`}
                        aria-label={`${t("player.picture.useEmoji", { emoji: option.emoji })}: ${requirement} — ${t("boutique.getInBoutique")}`}
                        title={`${requirement} — ${t("boutique.getInBoutique")}`}
                        className={className}
                      >
                        {content}
                      </Link>
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
                    const className = `flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${
                      !unlocked
                        ? LOCKED_ITEM_CLASS
                        : entry.avatar_frame === option.id
                          ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]"
                          : "hover:bg-[var(--panel-soft)]"
                    }`;
                    const content = (
                      <>
                        <AvatarFrame frame={option.id} size={44}>
                          <PlayerAvatar avatar={avatarInfo} updatedAt={entry.updated_at} size={44} />
                        </AvatarFrame>
                        <span className="text-[10px] text-[var(--faint)]">{lockedCaption(option.label, unlocked)}</span>
                      </>
                    );
                    return unlocked ? (
                      <button key={option.id} onClick={() => chooseFrame(option.id)} className={className}>
                        {content}
                      </button>
                    ) : (
                      <Link
                        key={option.id}
                        href={`/boutique?item=${itemSkuFor("avatar_frame", option.id)}`}
                        title={`${req(option.unlock!)} — ${t("boutique.getInBoutique")}`}
                        className={className}
                      >
                        {content}
                      </Link>
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
                    const className = `rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      !unlocked
                        ? `border-[var(--border)] text-[var(--faint)] ${LOCKED_ITEM_CLASS}`
                        : entry.title === option.id
                          ? "border-[var(--accent)] text-[var(--accent)]"
                          : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                    }`;
                    return unlocked ? (
                      <button key={option.id} onClick={() => chooseTitle(option.id)} className={className}>
                        {lockedCaption(option.label, unlocked)}
                      </button>
                    ) : (
                      <Link
                        key={option.id}
                        href={`/boutique?item=${itemSkuFor("title", option.id)}`}
                        title={`${req(option.unlock!)} — ${t("boutique.getInBoutique")}`}
                        className={className}
                      >
                        {lockedCaption(option.label, unlocked)}
                      </Link>
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
                    const className = `flex flex-col items-center gap-1 rounded-lg p-1.5 transition ${
                      !unlocked
                        ? LOCKED_ITEM_CLASS
                        : entry.banner === option.id
                          ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]"
                          : "hover:bg-[var(--panel-soft)]"
                    }`;
                    const content = (
                      <>
                        <div className="h-10 w-16 rounded-md" style={{ background: option.css }} />
                        <span className="text-[10px] text-[var(--faint)]">{lockedCaption(option.label, unlocked)}</span>
                      </>
                    );
                    return unlocked ? (
                      <button key={option.id} onClick={() => chooseBanner(option.id)} className={className}>
                        {content}
                      </button>
                    ) : (
                      <Link
                        key={option.id}
                        href={`/boutique?item=${itemSkuFor("banner", option.id)}`}
                        title={`${req(option.unlock!)} — ${t("boutique.getInBoutique")}`}
                        className={className}
                      >
                        {content}
                      </Link>
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
        {bioSaveState === "error" && (
          <p className="text-xs text-[var(--danger)]">{bioError ?? t("common.error")}</p>
        )}
        </div>
      </div>
      )}
    </section>
  );
}
