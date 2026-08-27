import { AchievementCategory } from "@/achievements";

// One simple line-art icon per AchievementCategory (see achievements.ts for
// why categories are coarser than the 40 individual families) — inline SVG
// in the same thin-stroke, currentColor style already established by the
// Settings page's circled-"i" info icon, deliberately not emoji, matching
// this app's existing icon language everywhere else.
const SHARED_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Account-level stats (Tablehand, Champion, Sharpshooter, Consistent) — a trophy. */
function TrophyIcon() {
  return (
    <svg {...SHARED_PROPS}>
      <path d="M7 4h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V4Z" />
      <path d="M7 5H4a3 3 0 0 0 3 4" />
      <path d="M17 5h3a3 3 0 0 1-3 4" />
      <path d="M12 12v3.5" />
      <path d="M9 19.5h6" />
      <path d="M10 15.5h4l1 4H9l1-4Z" />
    </svg>
  );
}

/** Wins against each AI difficulty (Rival: Beginner..Expert AI) — crossed swords. */
function CrossedSwordsIcon() {
  return (
    <svg {...SHARED_PROPS}>
      <path d="M4.5 19.5 18 6" />
      <path d="M15 6h3v3" />
      <circle cx="4.5" cy="19.5" r="1" fill="currentColor" stroke="none" />
      <path d="M19.5 19.5 6 6" />
      <path d="M9 6H6v3" />
      <circle cx="19.5" cy="19.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Melding (Bookworm, Runner, Wild Card, Purist, ...) — two overlapping cards. */
function MeldedCardsIcon() {
  return (
    <svg {...SHARED_PROPS}>
      <rect x="3" y="6" width="10" height="14" rx="1.5" />
      <rect x="11" y="4" width="10" height="14" rx="1.5" />
    </svg>
  );
}

/** Laying off (Offloader, Generous, Team Player, Decisive) — a card dropping onto a pile. */
function LayOffIcon() {
  return (
    <svg {...SHARED_PROPS}>
      <rect x="7" y="2" width="10" height="12" rx="1.5" />
      <path d="M12 16.5v4" />
      <path d="M9 17.5l3 3 3-3" />
    </svg>
  );
}

/** Draw/discard economy (Gambler, Scavenger, Lucky Draw, Declutterer) — a card with a refresh cycle. */
function DrawDiscardIcon() {
  return (
    <svg {...SHARED_PROPS}>
      <rect x="3" y="6" width="9" height="13" rx="1.3" />
      <path d="M15 8a5 5 0 1 1-1.3 8.4" />
      <path d="M17.7 12.2l-2.4-.4.4-2.4" />
    </svg>
  );
}

/** Going out (Round Winner, Clean Sweep, Just in Time, No Rummy, Flawless) — a finish flag. */
function FlagIcon() {
  return (
    <svg {...SHARED_PROPS}>
      <path d="M6 21V4" />
      <path d="M6 4h13l-3 4 3 4H6" />
    </svg>
  );
}

/** Per-contract completion (2 Books Regular ... The Hardest Round) — a checked clipboard. */
function ClipboardIcon() {
  return (
    <svg {...SHARED_PROPS}>
      <rect x="5" y="4" width="14" height="17" rx="1.5" />
      <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" />
      <path d="M9 13l2 2 4-4" />
    </svg>
  );
}

/** Table composition (Around the Table, Solo Act, Full House, Marathoner) — seats around a table. */
function TableIcon() {
  return (
    <svg {...SHARED_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <circle cx="4" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

const ICON_BY_CATEGORY: Record<AchievementCategory, () => React.JSX.Element> = {
  accountStats: TrophyIcon,
  aiRivals: CrossedSwordsIcon,
  melding: MeldedCardsIcon,
  layingOff: LayOffIcon,
  drawDiscard: DrawDiscardIcon,
  goingOut: FlagIcon,
  contracts: ClipboardIcon,
  tableComposition: TableIcon,
};

export function AchievementIcon({
  category,
  className,
}: {
  category: AchievementCategory;
  className?: string;
}) {
  const Icon = ICON_BY_CATEGORY[category];
  return (
    <span className={className} aria-hidden="true">
      <Icon />
    </span>
  );
}
