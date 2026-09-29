"use client";

// A player's profile picture — an uploaded photo, or an emoji on a colored
// circle when they haven't set one (same "avatar" concept the AI opponents
// already use, aiPersonas.ts, just with a background color since a human
// only ever needs one). Used on the profile page and next to a name
// anywhere it links there (Leaderboard, Friends).

import { AvatarInfo, avatarPhotoUrlFor } from "../lib/leaderboardStore";
import { DEFAULT_COLOR, DEFAULT_EMOJI, findBoutiqueAvatarEmojiOption } from "../lib/avatarPresets";
import { supabase } from "../lib/supabaseClient";
import { BoutiqueAvatarIcon } from "./BoutiqueAvatarIcon";

interface PlayerAvatarProps {
  avatar?: AvatarInfo | null;
  /** The row's `updated_at`, passed through as a cache-buster for a photo
   * avatar — see avatarPhotoUrlFor's own doc. Irrelevant for an emoji
   * avatar, safe to omit. */
  updatedAt?: string | null;
  size?: number;
  className?: string;
}

export function PlayerAvatar({ avatar, updatedAt, size = 40, className = "" }: PlayerAvatarProps) {
  if (avatar?.kind === "photo" && avatar.photoPath && supabase) {
    const url = avatarPhotoUrlFor(supabase, avatar.photoPath, updatedAt);
    return (
      // Per-account Storage URL, not a static asset next/image's optimizer applies to.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  const emoji = avatar?.emoji ?? DEFAULT_EMOJI;
  const color = avatar?.color ?? DEFAULT_COLOR;
  // A purchased Boutique avatar picture gets its own hand-drawn line-art
  // instead of the raw emoji character — see BoutiqueAvatarIcon.tsx's own
  // doc for why (the exact same "plain glyph, no exclusivity" problem the
  // 15 boutique badges had). The 46 free EMOJI_OPTIONS are untouched: they
  // aren't a purchase, so there's no exclusivity problem to solve for them.
  const boutiquePicture = findBoutiqueAvatarEmojiOption(emoji);
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full text-white ${className}`}
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.55, lineHeight: 1 }}
    >
      {boutiquePicture ? <BoutiqueAvatarIcon option={boutiquePicture} size={size * 0.62} /> : emoji}
    </span>
  );
}
