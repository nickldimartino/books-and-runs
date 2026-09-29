import { findPremiumEmojiOption, LEVEL_MEDAL_COLOR, PremiumEmojiOption } from "../lib/avatarPresets";
import {
  AURORA_CROWN_ELEMENTS,
  APEX_STARBURST_ELEMENTS,
  BOW_ELEMENTS,
  CARD_FAN_ELEMENTS,
  CRYSTAL_BALL_ELEMENTS,
  DAILY_FIRE_ELEMENTS,
  DYNAMITE_ELEMENTS,
  ECLIPSE_ELEMENTS,
  EVIL_EYE_ELEMENTS,
  FIREWORK_ELEMENTS,
  FORGE_ELEMENTS,
  MAHJONG_TILE_ELEMENTS,
  NOVA_ELEMENTS,
  ORNATE_KEY_ELEMENTS,
  OWL_ELEMENTS,
  SCALES_ELEMENTS,
  SLOT_MACHINE_ELEMENTS,
  STREAK_ELEMENTS,
  SUNGLASSES_ELEMENTS,
  TOP_HAT_ELEMENTS,
  TUMBLER_ELEMENTS,
  UFO_ELEMENTS,
  VICTORY_LAP_ELEMENTS,
  VIOLIN_ELEMENTS,
} from "../lib/rarityBadgeIconPaths";
import { IconElement } from "../lib/achievementIconPaths";
import { ACHIEVEMENT_ICON_PROPS, AchievementIcon } from "./AchievementIcons";

// Custom line-art for the premium avatar emoji (see avatarPresets.ts's
// PREMIUM_EMOJI_OPTIONS) — replaces the plain Unicode glyph with hand-drawn
// icons in the same style as the achievement system's own (AchievementIcons.tsx),
// rather than a generic system emoji. The 9 category-mastery rewards reuse
// that exact category icon (a mastery reward for, say, Multiplayer earns
// the same people-icon already used for every Multiplayer achievement).
// The 4 level-milestone rewards get MedalIcon below. The Epic/Mythic/Apex
// "flex" rewards each get their own distinct silhouette (rarityBadgeIconPaths.ts)
// instead of reusing MedalIcon recolored — see cosmeticRarity.ts's own doc
// for why a shape, not just a color, is what makes a rarer reward actually
// read as rarer.
// Exported (only) so boutiqueVisuals.test.tsx can assert every boutique
// badge has an entry here — the exact gap that shipped 15 boutique badges
// with no custom icon at all (see this file's own header comment).
export const RARITY_BADGE_ELEMENTS: Partial<Record<string, IconElement[]>> = {
  "🧭": ECLIPSE_ELEMENTS,
  "⚔️": FORGE_ELEMENTS,
  "🏵️": NOVA_ELEMENTS,
  "🌌": AURORA_CROWN_ELEMENTS,
  "🏮": DAILY_FIRE_ELEMENTS,
  "🏆": VICTORY_LAP_ELEMENTS,
  "💫": APEX_STARBURST_ELEMENTS,
  "⚖️": SCALES_ELEMENTS,
  "📈": STREAK_ELEMENTS,
  // Boutique (15) — see rarityBadgeIconPaths.ts's own doc on this block.
  "🎻": VIOLIN_ELEMENTS,
  "🗝️": ORNATE_KEY_ELEMENTS,
  "🎩": TOP_HAT_ELEMENTS,
  "🕶️": SUNGLASSES_ELEMENTS,
  "🥃": TUMBLER_ELEMENTS,
  "🧨": DYNAMITE_ELEMENTS,
  "🧿": EVIL_EYE_ELEMENTS,
  "🏹": BOW_ELEMENTS,
  "🦉": OWL_ELEMENTS,
  "🛸": UFO_ELEMENTS,
  "🎰": SLOT_MACHINE_ELEMENTS,
  "🀄": MAHJONG_TILE_ELEMENTS,
  "🎆": FIREWORK_ELEMENTS,
  "🎴": CARD_FAN_ELEMENTS,
  "🔮": CRYSTAL_BALL_ELEMENTS,
};

function renderRarityElement(el: IconElement, i: number) {
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

/** Level milestones (🥉🥈🥇💎) — a hanging medal: two ribbon tails into a
 * disc. Unlike the category icons (plain currentColor line art), the
 * disc itself is filled with the milestone's own color (bronze/silver/
 * gold/diamond, see LEVEL_MEDAL_COLOR) — the one visual difference between
 * the four, since they'd otherwise all render as the same shape regardless
 * of which avatar background color the account happens to have picked. */
function MedalIcon({ fill }: { fill: string }) {
  return (
    <svg {...ACHIEVEMENT_ICON_PROPS} fill="none">
      <path d="M9 3.5 6.5 10" />
      <path d="M15 3.5 17.5 10" />
      <circle cx="12" cy="14" r="6" fill={fill} />
      <circle cx="12" cy="14" r="2.25" />
    </svg>
  );
}

export function PremiumBadgeIcon({ option, className }: { option: PremiumEmojiOption; className?: string }) {
  if (option.unlock?.kind === "categoryMastered") {
    return <AchievementIcon category={option.unlock.category} className={className} />;
  }
  const rarityElements = RARITY_BADGE_ELEMENTS[option.emoji];
  if (rarityElements) {
    return (
      <span className={className} aria-hidden="true">
        <svg {...ACHIEVEMENT_ICON_PROPS}>{rarityElements.map(renderRarityElement)}</svg>
      </span>
    );
  }
  return (
    <span className={className} aria-hidden="true">
      <MedalIcon fill={LEVEL_MEDAL_COLOR[option.emoji] ?? "currentColor"} />
    </span>
  );
}

/** Renders `emoji` as its custom badge icon when it's a premium option,
 * otherwise as the plain emoji character — the one place this decision is
 * made, so PlayerAvatar and the Edit Profile picker can't render the same
 * emoji two different ways. */
export function EmojiOrBadge({ emoji, className }: { emoji: string; className?: string }) {
  const premium = findPremiumEmojiOption(emoji);
  if (premium) return <PremiumBadgeIcon option={premium} className={className} />;
  return <span className={className}>{emoji}</span>;
}
