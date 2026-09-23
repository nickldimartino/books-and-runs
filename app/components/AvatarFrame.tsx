import { ReactNode } from "react";
import { defaultRarityForUnlock, RARITY_VISUAL, rarityHasFoil } from "../lib/cosmeticRarity";
import { AVATAR_FRAME_COLOR, findAvatarFrameOption } from "../lib/profileCosmetics";

interface AvatarFrameProps {
  frame: string | null;
  size: number;
  children: ReactNode;
}

/** Wraps an avatar (photo or emoji) in a ring — a cosmetic entirely
 * separate from the avatar itself, unlocked the same way premium emoji
 * are (see profileCosmetics.ts's AVATAR_FRAME_OPTIONS). "grandmaster",
 * "prismatic", and "dealerstable" each get their own conic-gradient ring
 * instead of one flat color, escalating by rarity (cosmeticRarity.ts):
 * "grandmaster" is mythic — a tight 2-color violet/gold sweep with a
 * moderate foil shimmer (globals.css's .rarity-ring--mythic); "prismatic"
 * is the sole apex reward — the full 7-stop rainbow, plus a wider/slower
 * shimmer (.prismatic-foil) and a scattered-diamond overlay on the banner
 * version, so it reads as a tier above Grandmaster through genuinely
 * different visual complexity, not just a faster version of the same
 * gradient (the two used to share this exact rainbow motif — see
 * CODEBASE_MAP.md §9's Sept 2026 audit for why that changed). "dealerstable"
 * ("Rose Cut") layers a dense faceted conic gradient over an icy base in
 * one `background` string, plus its own foil sweep (.diamond-foil) tuned
 * icy-white, so the Creator-exclusive frame reads as a cut stone rather
 * than a colored ring. Renders children plain, no wrapper at all, when
 * there's no frame (or an unrecognized one). */
export function AvatarFrame({ frame, size, children }: AvatarFrameProps) {
  if (!frame) return <>{children}</>;
  const ringWidth = Math.max(2, Math.round(size * 0.06));
  const isGrandmaster = frame === "grandmaster";
  const isPrismatic = frame === "prismatic";
  const isDiamond = frame === "dealerstable";
  const background = isGrandmaster
    ? "conic-gradient(from 0deg, #a855f7, #f5c518, #a855f7)"
    : isPrismatic
      ? "conic-gradient(from 0deg, #ec4899, #a855f7, #6366f1, #06b6d4, #22c55e, #eab308, #f59e0b, #ec4899)"
      : isDiamond
        ? "conic-gradient(from 45deg at 50% 50%, rgba(255,255,255,0.95) 0 6%, rgba(180,205,215,0.25) 6% 19%, rgba(255,255,255,0.95) 19% 25%, rgba(180,205,215,0.25) 25% 38%, rgba(255,255,255,0.95) 38% 44%, rgba(180,205,215,0.25) 44% 57%, rgba(255,255,255,0.95) 57% 63%, rgba(180,205,215,0.25) 63% 76%, rgba(255,255,255,0.95) 76% 82%, rgba(180,205,215,0.25) 82% 95%, rgba(255,255,255,0.95) 95% 100%), radial-gradient(circle, #f3f9fc, #aebfc9 60%, #5c7c8c 100%)"
        : (AVATAR_FRAME_COLOR[frame] ?? "transparent");
  // Every other frame that's rare enough to shimmer at all (Specialist,
  // Iron Will, Virtuoso, Aurora Crown, Unbroken, Undefeated — epic/mythic
  // per cosmeticRarity.ts) gets the same shared .foil-sweep treatment as
  // Grandmaster, over its own flat color, instead of staying a plain solid
  // ring like every common/uncommon/rare color pick.
  const option = !isGrandmaster && !isPrismatic && !isDiamond ? findAvatarFrameOption(frame) : null;
  const rarity = option ? (option.rarity ?? defaultRarityForUnlock(option.unlock)) : null;
  const hasRarityFoil = !!rarity && rarityHasFoil(rarity);
  const foilClass = isGrandmaster
    ? "foil-sweep rarity-ring--mythic"
    : isPrismatic
      ? "prismatic-foil"
      : isDiamond
        ? "diamond-foil"
        : hasRarityFoil
          ? `foil-sweep ${RARITY_VISUAL[rarity!].ringClass}`
          : "";
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full ${foilClass}`}
      style={{ width: size + ringWidth * 2, height: size + ringWidth * 2, background }}
    >
      {children}
    </span>
  );
}
