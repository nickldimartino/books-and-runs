import { RankInfo } from "../lib/rank";

/** A colored pill for a computed rank tier (see rank.ts) — "Unranked" (no
 * tier yet) renders as a muted, uncolored pill rather than being hidden,
 * so it still reads as "here's your status" instead of a gap. */
export function RankBadge({ rank, className = "" }: { rank: RankInfo; className?: string }) {
  if (!rank.tier) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-[var(--panel-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--faint)] ${className}`}
      >
        Unranked
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white ${className}`}
      style={{ backgroundColor: rank.tier.color }}
    >
      {rank.tier.label}
    </span>
  );
}
