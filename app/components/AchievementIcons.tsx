import { AchievementCategory } from "@/achievements";
import { ACHIEVEMENT_ICON_ELEMENTS, IconElement } from "../lib/achievementIconPaths";

// One simple line-art icon per AchievementCategory (see achievements.ts for
// why categories are coarser than the 40 individual families) — inline SVG
// in the same thin-stroke, currentColor style already established by the
// Settings page's circled-"i" info icon, deliberately not emoji, matching
// this app's existing icon language everywhere else.
// Exported so PremiumBadgeIcon.tsx's own new icon (the level-milestone
// medal) matches this exactly, rather than a close-but-drifting copy.
export const ACHIEVEMENT_ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// The actual path/circle/rect data lives in achievementIconPaths.ts, shared
// with shareCard.ts's canvas renderer (canvas has no SVG renderer of its
// own, so it replays this same data as Path2D draws) — this function is
// just the JSX-rendering side of it.
function renderElement(el: IconElement, i: number) {
  switch (el.kind) {
    case "path":
      return <path key={i} d={el.d} />;
    case "circle":
      return (
        <circle
          key={i}
          cx={el.cx}
          cy={el.cy}
          r={el.r}
          {...(el.filled ? { fill: "currentColor", stroke: "none" } : {})}
        />
      );
    case "rect":
      return <rect key={i} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx} />;
  }
}

export function AchievementIcon({
  category,
  className,
}: {
  category: AchievementCategory;
  className?: string;
}) {
  return (
    <span className={className} aria-hidden="true">
      <svg {...ACHIEVEMENT_ICON_PROPS}>{ACHIEVEMENT_ICON_ELEMENTS[category].map(renderElement)}</svg>
    </span>
  );
}
