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
//
// This file used to be ~2,400 lines doing five jobs at once (identity,
// social actions, cosmetic editing, private stats, and the public header —
// see CODEBASE_MAP.md's "profile page split" entry for the full story).
// It's now the orchestrator: four hooks own the data (usePlayerIdentity,
// usePlayerSocial, usePlayerPrivateData, usePlayerEditState, all in this
// directory), and the two biggest JSX blocks are their own components
// (EditProfileDialog, PlayerStatsSection). What's left here — the public
// header/banner, the report/block dialogs, the public stat row, and the
// trophy case — is the one piece that's genuinely shared between a self-
// view and someone else's, so it stays where the branching already is.

import { useRouter } from "next/navigation";
import { AchievementTier, MP_WIN_RATE_MIN_GAMES } from "@/achievements";
import { useAuth } from "../AuthContext";
import { usePlayerLevel } from "../PlayerLevelContext";
import { AchievementIcon } from "../components/AchievementIcons";
import { AvatarFrame } from "../components/AvatarFrame";
import { BackLink, BottomBackLink } from "../components/BackLink";
import { CenteredMessage } from "../components/CenteredMessage";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { EmojiOrBadge } from "../components/PremiumBadgeIcon";
import { ProfileBanner } from "../components/ProfileBanner";
import { formatRarity } from "../lib/achievementRarity";
import { findBannerOption } from "../lib/bannerPresets";
import { formatScore } from "../lib/formatScore";
import type { TranslationKey } from "../lib/i18n/keys";
import { useT } from "../lib/i18n/LocaleProvider";
import { AvatarInfo, displayNameFor, MAX_SHOWCASE_ITEMS, playerProfileHref } from "../lib/leaderboardStore";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ReportDialog } from "../components/ReportDialog";
import { findTitleOption } from "../lib/profileCosmetics";
import { buildProfileShareCardInput, formatWinRate, resolveShowcaseItem, ShowcaseItem, TOTAL_ACHIEVEMENTS } from "../lib/profileShareCard";
import { renderProfileShareCard } from "../lib/shareCard";
import { supabase } from "../lib/supabaseClient";
import { capitalize } from "../lib/text";
import { EditProfileDialog } from "./EditProfileDialog";
import { PlayerStatsSection } from "./PlayerStatsSection";
import { StatTile } from "./StatTile";
import { usePlayerEditState } from "./usePlayerEditState";
import { usePlayerIdentity } from "./usePlayerIdentity";
import { usePlayerPrivateData } from "./usePlayerPrivateData";
import { usePlayerSocial } from "./usePlayerSocial";
import { Suspense, useState } from "react";

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

function PlayerProfilePageInner() {
  const { configured, loading: authLoading, user } = useAuth();
  const { level } = usePlayerLevel();
  const router = useRouter();
  const { t, tPlural, locale } = useT();

  const { profileId, entry, setEntry, loading, loadError, isSelf } = usePlayerIdentity(user);
  const social = usePlayerSocial(user, profileId, isSelf);
  const privateData = usePlayerPrivateData(user, isSelf, entry, setEntry, level);
  const editState = usePlayerEditState(entry, setEntry, user, isSelf);

  // ── Share profile card ──────────────────────────────────────────────────
  // Not self-only — sharing a FRIEND's card is exactly as meaningful as
  // sharing your own, so this stays here rather than moving into either
  // self-only hook.
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
        if (data) freshEntry = data as typeof entry;
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
                onClick={() => editState.setEditingProfile((v) => !v)}
                aria-label={editState.editingProfile ? t("player.editProfile.done") : t("player.editProfile.edit")}
                title={editState.editingProfile ? t("player.editProfile.done") : t("player.editProfile.edit")}
                className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/20 text-white backdrop-blur-sm transition hover:bg-black/30"
              >
                <EditIcon />
              </button>
            ) : (
              social.related !== "related" && (
                <button
                  onClick={social.addFriend}
                  disabled={social.related === "requested"}
                  aria-label={social.related === "requested" ? t("player.friend.requestSent") : t("player.friend.add")}
                  title={social.related === "requested" ? t("player.friend.requestSent") : t("player.friend.add")}
                  className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/20 text-white backdrop-blur-sm transition hover:bg-black/30 disabled:opacity-60"
                >
                  {social.related === "requested" ? <PersonCheckIcon /> : <PersonAddIcon />}
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
                {!isSelf && user && !social.blockedNow && (
                  <>
                    <button
                      onClick={() => social.setReporting(true)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${onBanner ? "border-white/30 text-white/90 hover:bg-white/10" : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"}`}
                    >
                      {t("player.report.button")}
                    </button>
                    <button
                      onClick={() => social.setConfirmingBlock(true)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${onBanner ? "border-white/30 text-white/90 hover:bg-white/10" : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"}`}
                    >
                      {t("safety.menu.block")}
                    </button>
                  </>
                )}
              </div>
              {social.blockedNow && (
                <p className={`text-xs ${onBanner ? "text-white/90" : "text-[var(--muted)]"}`}>
                  {t("safety.block.done", { name: displayNameFor(entry) })}
                </p>
              )}
              {shareState === "shared" && (
                <p className={`text-xs ${onBanner ? "text-white/90" : "text-[var(--muted)]"}`}>{t("player.share.shared")}</p>
              )}
              {shareState === "error" && (
                <p className="text-xs text-[var(--danger)]">{t("player.share.error")}</p>
              )}

              {!isSelf && user && (
                <>
                  <ReportDialog
                    open={social.reporting}
                    targetUserId={profileId ?? ""}
                    targetName={displayNameFor(entry)}
                    context="profile"
                    onClose={() => social.setReporting(false)}
                    onBlockRequested={() => social.setConfirmingBlock(true)}
                  />
                  <ConfirmDialog
                    open={social.confirmingBlock}
                    danger
                    busy={social.blockBusy}
                    title={t("safety.block.confirmTitle", { name: displayNameFor(entry) })}
                    body={social.blockError ?? t("safety.block.confirmBody")}
                    confirmLabel={t("safety.menu.block")}
                    onConfirm={social.confirmBlock}
                    onCancel={() => {
                      social.setConfirmingBlock(false);
                      social.setBlockError(null);
                    }}
                  />
                </>
              )}
            </div>
          </ProfileBanner>

          {isSelf && (
            <EditProfileDialog entry={entry} editState={editState} privateData={privateData} />
          )}

          {!isSelf && social.headToHead && (
            <section>
              <h2 className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                {t("player.headToHead.heading")}
              </h2>
              <div className="grid grid-cols-3 gap-2">
                <StatTile label={t("player.headToHead.wins")} value={social.headToHead.wins} />
                <StatTile label={t("player.headToHead.losses")} value={social.headToHead.losses} />
                <StatTile label={t("player.headToHead.ties")} value={social.headToHead.ties} />
              </div>
              <p className="mt-1.5 text-center text-[10px] text-[var(--faint)]">
                {tPlural("player.headToHead.games", social.headToHead.gamesTogether, { count: social.headToHead.gamesTogether })}
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
                    <TrophyBadge key={item.key} item={item} rarityLabel={formatRarity(editState.rarity?.[item.key])} />
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
            <PlayerStatsSection
              privateData={privateData}
              level={level}
              user={user}
              mpRating={entry.mp_rating}
              mpRatedGames={entry.mp_rated_games}
            />
          )}
        </>
      )}

      <BottomBackLink fallback="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]" />
    </main>
  );
}

// usePlayerIdentity calls useSearchParams() (see that file's own doc for
// why — it has to be reactive to client-side navigation between two
// profiles, not a one-shot read), which requires a Suspense boundary
// somewhere above it.
export default function PlayerProfilePage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <PlayerProfilePageInner />
    </Suspense>
  );
}
