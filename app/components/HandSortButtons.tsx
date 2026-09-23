import { SortMode } from "../lib/handSort";

// The "Sort by suit / Sort by rank" button pair in the hand drawer — pixel-
// identical between solo/pass-and-play (game/page.tsx) and multiplayer
// (multiplayer/play/page.tsx), just wired to each screen's own local-only
// sortHand callback (see handSort.ts — never reaches the server in either
// mode).
const CLASS_NAME = "rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]";

export function HandSortButtons({ onSort }: { onSort: (mode: SortMode) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <button
        onClick={() => onSort("suit")}
        title="Group same-suit cards together — good for spotting runs"
        className={CLASS_NAME}
      >
        Sort by suit
      </button>
      <button
        onClick={() => onSort("rank")}
        title="Group same-rank cards together — good for spotting books"
        className={CLASS_NAME}
      >
        Sort by rank
      </button>
    </div>
  );
}
