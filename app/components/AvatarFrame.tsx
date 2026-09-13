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
 * different color. "dealerstable" ("Rose Cut") layers a dense faceted
 * conic gradient over an icy base in one `background` string, plus the
 * same foil sweep as its own accent color (.diamond-foil), so the
 * Creator-exclusive frame reads as a cut stone rather than a colored
 * ring. Renders children plain, no wrapper at all, when there's no frame
 * (or an unrecognized one). */
export function AvatarFrame({ frame, size, children }: AvatarFrameProps) {
  if (!frame) return <>{children}</>;
  const ringWidth = Math.max(2, Math.round(size * 0.06));
  const isPrismatic = frame === "prismatic";
  const isDiamond = frame === "dealerstable";
  const background =
    frame === "grandmaster"
      ? "conic-gradient(from 0deg, #f43f5e, #f59e0b, #eab308, #22c55e, #06b6d4, #6366f1, #a855f7, #f43f5e)"
      : isPrismatic
        ? "conic-gradient(from 0deg, #ec4899, #a855f7, #6366f1, #06b6d4, #22c55e, #eab308, #f59e0b, #ec4899)"
        : isDiamond
          ? "conic-gradient(from 45deg at 50% 50%, rgba(255,255,255,0.95) 0 6%, rgba(180,205,215,0.25) 6% 19%, rgba(255,255,255,0.95) 19% 25%, rgba(180,205,215,0.25) 25% 38%, rgba(255,255,255,0.95) 38% 44%, rgba(180,205,215,0.25) 44% 57%, rgba(255,255,255,0.95) 57% 63%, rgba(180,205,215,0.25) 63% 76%, rgba(255,255,255,0.95) 76% 82%, rgba(180,205,215,0.25) 82% 95%, rgba(255,255,255,0.95) 95% 100%), radial-gradient(circle, #f3f9fc, #aebfc9 60%, #5c7c8c 100%)"
          : (AVATAR_FRAME_COLOR[frame] ?? "transparent");
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full ${isPrismatic ? "prismatic-foil" : isDiamond ? "diamond-foil" : ""}`}
      style={{ width: size + ringWidth * 2, height: size + ringWidth * 2, background }}
    >
      {children}
    </span>
  );
}
