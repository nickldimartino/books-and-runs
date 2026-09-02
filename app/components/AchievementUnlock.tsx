import { AchievementInstance, tierNumber } from "@/achievements";
import { AchievementIcon } from "./AchievementIcons";
import { formatAchievementProgress } from "../lib/achievementFormat";

export interface AchievementUnlockItem {
  achievement: AchievementInstance;
  /** ACHIEVEMENT_TIER_XP[achievement.tier] — passed in rather than looked
   * up here so this stays a pure presentation component with no dependency
   * on leveling.ts. */
  xp: number;
}

/**
 * The single shared presentation for "you just unlocked this achievement" —
 * used verbatim by both RoundSummary (mid-game, after any round that
 * crosses a tier threshold) and GameOverScreen (whatever's left over from
 * the final round). Same event, same look, wherever it fires. Each row is a
 * <details> disclosure (the tap-to-expand pattern already used elsewhere in
 * this app — Home's "More" section, Settings' InfoDetails) that reveals the
 * same "X / threshold unit" requirement text the Achievements page itself
 * shows, so "what did I just unlock, and what did it take" is always one
 * tap away, not something you have to go find on a different page.
 */
export function AchievementUnlockList({ items }: { items: AchievementUnlockItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map(({ achievement: a, xp }) => (
        <li key={`${a.familyId}-${a.tier}`}>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-[var(--heading)] [&::-webkit-details-marker]:hidden">
              <AchievementIcon category={a.category} className="h-5 w-5 shrink-0 text-[var(--accent)]" />
              <span className="min-w-0 flex-1 truncate">
                {a.familyTitle} {tierNumber(a.tier)}
              </span>
              <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">+{xp} XP</span>
              <span
                aria-hidden="true"
                className="shrink-0 text-xs text-[var(--faint)] transition group-open:rotate-180"
              >
                ▼
              </span>
            </summary>
            <p className="mt-1 pl-7 text-xs text-[var(--faint)]">{formatAchievementProgress(a)}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}

/**
 * The full card — heading plus the list above — both RoundSummary and
 * GameOverScreen render as-is rather than each wrapping AchievementUnlockList
 * in their own bespoke box, so the container itself (not just each row)
 * looks identical regardless of which screen is showing it.
 */
export function AchievementUnlockCard({ items, heading }: { items: AchievementUnlockItem[]; heading: string }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl bg-[var(--accent)]/10 p-4 text-left">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">{heading}</h2>
      <div className="mt-2">
        <AchievementUnlockList items={items} />
      </div>
    </div>
  );
}
