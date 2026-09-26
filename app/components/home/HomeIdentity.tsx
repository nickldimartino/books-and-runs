"use client";

// The signed-in identity: avatar, display name, level and a real XP progress
// bar. Two shapes — `chip` (a slim pill for Home's top bar) and `card` (the
// roomier version with the next cosmetic reward, used on the Progress hub).
// Replaced the old level pill (whose XP detail was a hover-only tooltip,
// unusable on touch) and the account e-mail line under the title. The whole
// thing links to the profile.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LevelProgress } from "@/leveling";
import { PlayerAvatar } from "../PlayerAvatar";
import { useT } from "../../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../../lib/i18n/keys";
import { nextLevelUnlocks } from "../../lib/allCosmetics";
import {
  AvatarInfo,
  fetchAvatarsFor,
  fetchOwnDisplayName,
  nameOf,
  playerProfileHref,
} from "../../lib/leaderboardStore";
import { identityIsFresh, readIdentity, writeIdentity } from "../../lib/identityCache";
import { supabase } from "../../lib/supabaseClient";

export function HomeIdentity({
  userId,
  level,
  loading,
  variant = "card",
}: {
  userId: string;
  level: LevelProgress | null;
  loading: boolean;
  variant?: "chip" | "card";
}) {
  const { t } = useT();
  // Seeded from the last known identity so navigating between pages doesn't
  // flash the default avatar/name while the fetch below revalidates it.
  const [name, setName] = useState<string | null>(() => readIdentity(userId)?.name ?? null);
  const [avatar, setAvatar] = useState<AvatarInfo | null>(() => readIdentity(userId)?.avatar ?? null);

  useEffect(() => {
    if (!supabase || identityIsFresh(userId)) return;
    const client = supabase;
    let cancelled = false;
    Promise.all([fetchOwnDisplayName(client, userId), fetchAvatarsFor(client, [userId])])
      .then(([displayName, avatars]) => {
        writeIdentity(userId, { name: displayName, avatar: avatars[userId] ?? null });
        if (cancelled) return;
        setName(displayName);
        setAvatar(avatars[userId] ?? null);
      })
      .catch((err) => console.error("Failed to load Home identity:", err));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const compact = variant === "chip";

  // Same skeleton height as the loaded chip so the page doesn't jump.
  if (!level && compact) {
    return <div className="h-10 w-40 animate-pulse rounded-full bg-[var(--panel)]" />;
  }
  if (!level) {
    return loading ? (
      <div className="h-[76px] w-full animate-pulse rounded-xl bg-[var(--panel)]" />
    ) : null;
  }

  const pct = Math.round(Math.min(1, Math.max(0, level.progressFraction)) * 100);
  const xpText = t("home.xpToLevel", { into: level.xpIntoLevel, span: level.xpSpanForLevel, next: level.level + 1 });

  if (compact) {
    return (
      <Link
        href={playerProfileHref(userId)}
        title={xpText}
        className="flex h-10 min-w-0 max-w-[13.5rem] items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] py-1 pl-1 pr-3 text-left transition hover:bg-[var(--panel-soft)]"
      >
        <PlayerAvatar avatar={avatar} size={32} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-1.5">
            <span className="truncate text-xs font-semibold text-[var(--heading)]">{name ?? nameOf(userId, null)}</span>
            <span className="shrink-0 text-[10px] font-semibold text-[var(--accent)]">{t("home.levelN", { level: level.level })}</span>
          </span>
          <span
            role="progressbar"
            aria-label={xpText}
            aria-valuemin={0}
            aria-valuemax={level.xpSpanForLevel}
            aria-valuenow={level.xpIntoLevel}
            className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-[var(--border)]"
          >
            <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
          </span>
          <span className="sr-only">{xpText}</span>
        </span>
      </Link>
    );
  }

  const next = nextLevelUnlocks(level.level);
  const first = next?.items[0];
  const reward = first
    ? t(`home.reward.${first.kind}` as TranslationKey, { name: first.name })
    : null;

  return (
    <Link
      href={playerProfileHref(userId)}
      className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-left transition hover:bg-[var(--panel-soft)]"
    >
      <PlayerAvatar avatar={avatar} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-[var(--heading)]">{name ?? nameOf(userId, null)}</span>
          <span className="shrink-0 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">
            {t("home.levelN", { level: level.level })}
          </span>
        </span>
        <span
          role="progressbar"
          aria-label={t("home.xpToLevel", { into: level.xpIntoLevel, span: level.xpSpanForLevel, next: level.level + 1 })}
          aria-valuemin={0}
          aria-valuemax={level.xpSpanForLevel}
          aria-valuenow={level.xpIntoLevel}
          className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]"
        >
          <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
        </span>
        <span className="mt-1 block text-[11px] text-[var(--muted)]">
          {t("home.xpToLevel", { into: level.xpIntoLevel, span: level.xpSpanForLevel, next: level.level + 1 })}
        </span>
        {next && reward && (
          <span className="block truncate text-[11px] text-[var(--faint)]">
            {next.items.length > 1
              ? t("home.nextRewardMore", { level: next.level, reward, count: next.items.length - 1 })
              : t("home.nextReward", { level: next.level, reward })}
          </span>
        )}
      </span>
    </Link>
  );
}
