import { findPremiumEmojiOption, LEVEL_MEDAL_COLOR, PremiumEmojiOption } from "../lib/avatarPresets";
import { ACHIEVEMENT_ICON_PROPS, AchievementIcon } from "./AchievementIcons";

// Custom line-art for the premium avatar emoji (see avatarPresets.ts's
// PREMIUM_EMOJI_OPTIONS) — replaces the plain Unicode glyph with hand-drawn
// icons in the same style as the achievement system's own (AchievementIcons.tsx),
// rather than a generic system emoji. The 9 category-mastery rewards reuse
// that exact category icon (a mastery reward for, say, Multiplayer earns
// the same people-icon already used for every Multiplayer achievement) —
// only the 4 level-milestone rewards needed a new icon at all, since
// nothing already represented "a level milestone."

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
