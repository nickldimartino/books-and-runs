import { ReactNode } from "react";
import { AVATAR_FRAME_COLOR } from "../lib/profileCosmetics";

interface AvatarFrameProps {
  frame: string | null;
  size: number;
  children: ReactNode;
}

/** Wraps an avatar (photo or emoji) in a ring — a cosmetic entirely
 * separate from the avatar itself, unlocked the same way premium emoji
 * are (see profileCosmetics.ts's AVATAR_FRAME_OPTIONS). "grandmaster" and
 * "prismatic" each get a conic-gradient ring instead of one flat color;
 * "prismatic" additionally gets a passing light-sweep (see globals.css's
 * .prismatic-foil, the same technique the Trophy Case's expert-tier medals
 * already use — see .trophy-foil), so the single hardest reward in the
 * game reads as visibly a tier above Grandmaster's static foil, not just a
 * different color. Renders children plain, no wrapper at all, when
 * there's no frame (or an unrecognized one). */
export function AvatarFrame({ frame, size, children }: AvatarFrameProps) {
  if (!frame) return <>{children}</>;
  const ringWidth = Math.max(2, Math.round(size * 0.06));
  const isPrismatic = frame === "prismatic";
  const background =
    frame === "grandmaster"
      ? "conic-gradient(from 0deg, #f43f5e, #f59e0b, #eab308, #22c55e, #06b6d4, #6366f1, #a855f7, #f43f5e)"
      : isPrismatic
        ? "conic-gradient(from 0deg, #ec4899, #a855f7, #6366f1, #06b6d4, #22c55e, #eab308, #f59e0b, #ec4899)"
        : (AVATAR_FRAME_COLOR[frame] ?? "transparent");
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full ${isPrismatic ? "prismatic-foil" : ""}`}
      style={{ width: size + ringWidth * 2, height: size + ringWidth * 2, background }}
    >
      {children}
    </span>
  );
}
