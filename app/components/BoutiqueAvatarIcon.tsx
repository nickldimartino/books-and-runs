import { BoutiqueAvatarEmojiOption } from "../lib/avatarPresets";
import { IconElement } from "../lib/achievementIconPaths";
import {
  BEAVER_ELEMENTS,
  CHIPMUNK_ELEMENTS,
  CROCODILE_ELEMENTS,
  EAGLE_ELEMENTS,
  FLAMINGO_ELEMENTS,
  HEDGEHOG_ELEMENTS,
  OTTER_ELEMENTS,
  PARROT_ELEMENTS,
  SEAL_ELEMENTS,
  SHARK_ELEMENTS,
  SLOTH_ELEMENTS,
  SNAIL_ELEMENTS,
  SQUID_ELEMENTS,
  TURTLE_ELEMENTS,
  WHALE_ELEMENTS,
} from "../lib/avatarPictureIconPaths";

// Custom line-art for the 15 Boutique avatar PICTURES (see
// avatarPictureIconPaths.ts's own header for why this is a separate system
// from PremiumBadgeIcon.tsx/rarityBadgeIconPaths.ts, not a reskin of it).
// Exported (only) so boutiqueVisuals.test.tsx can assert every boutique
// avatar picture has a real, distinct entry here — the exact gap that let
// 15 boutique badges ship with no custom icon at all (see
// rarityBadgeIconPaths.ts's own history).
export const BOUTIQUE_AVATAR_ICON_ELEMENTS: Partial<Record<string, IconElement[]>> = {
  "🐢": TURTLE_ELEMENTS,
  "🐌": SNAIL_ELEMENTS,
  "🦥": SLOTH_ELEMENTS,
  "🦔": HEDGEHOG_ELEMENTS,
  "🐿️": CHIPMUNK_ELEMENTS,
  "🦦": OTTER_ELEMENTS,
  "🦫": BEAVER_ELEMENTS,
  "🦭": SEAL_ELEMENTS,
  "🦜": PARROT_ELEMENTS,
  "🦩": FLAMINGO_ELEMENTS,
  "🐊": CROCODILE_ELEMENTS,
  "🐳": WHALE_ELEMENTS,
  "🦈": SHARK_ELEMENTS,
  "🦑": SQUID_ELEMENTS,
  "🦅": EAGLE_ELEMENTS,
};

// Deliberately bolder/simpler than ACHIEVEMENT_ICON_PROPS's 1.5 stroke — a
// badge only ever renders at icon-slot size, but this is a whole profile
// PICTURE shown as small as a 28px avatar chip (Friends/Daily Deal
// leaderboard rows) as well as a 96px Profile header, so the linework needs
// to survive being shrunk much further than any badge does.
const BOUTIQUE_AVATAR_ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function renderAvatarElement(el: IconElement, i: number) {
  switch (el.kind) {
    case "path":
      return <path key={i} d={el.d} />;
    case "circle":
      return (
        <circle key={i} cx={el.cx} cy={el.cy} r={el.r} {...(el.filled ? { fill: "currentColor", stroke: "none" } : {})} />
      );
    case "rect":
      return <rect key={i} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx} />;
  }
}

/** Renders `option`'s custom line-art icon. Always used in place of the raw
 * emoji character for a boutique avatar picture — the one place this
 * decision is made, so PlayerAvatar, the Boutique store preview, and the
 * Edit Profile picture picker can't render the same purchase three
 * different ways. `size` is the icon's own pixel box (typically ~60-65% of
 * the avatar circle it sits inside — see PlayerAvatar.tsx); omit it to fill
 * the parent via `className` instead (e.g. Tailwind's `h-2/3 w-2/3`, the
 * same convention PremiumBadgeIcon.tsx's picker usage already follows). */
export function BoutiqueAvatarIcon({
  option,
  size,
  className,
}: {
  option: BoutiqueAvatarEmojiOption;
  size?: number;
  className?: string;
}) {
  const elements = BOUTIQUE_AVATAR_ICON_ELEMENTS[option.emoji];
  if (!elements) return null; // shouldn't happen — every id has an entry, guarded by boutiqueVisuals.test.tsx
  return (
    <svg
      {...BOUTIQUE_AVATAR_ICON_PROPS}
      className={className}
      style={size ? { width: size, height: size } : undefined}
      aria-hidden="true"
    >
      {elements.map(renderAvatarElement)}
    </svg>
  );
}
