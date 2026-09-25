"use client";

import { useT } from "../lib/i18n/LocaleProvider";
import { SortMode } from "../lib/handSort";

// The "Sort by suit / Sort by rank" button pair in the hand drawer — pixel-
// identical between solo/pass-and-play (game/page.tsx) and multiplayer
// (multiplayer/play/page.tsx), just wired to each screen's own local-only
// sortHand callback (see handSort.ts — never reaches the server in either
// mode).
const CLASS_NAME = "rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]";

export function HandSortButtons({ onSort }: { onSort: (mode: SortMode) => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <button onClick={() => onSort("suit")} title={t("hand.sortBySuitHint")} className={CLASS_NAME}>
        {t("hand.sortBySuit")}
      </button>
      <button onClick={() => onSort("rank")} title={t("hand.sortByRankHint")} className={CLASS_NAME}>
        {t("hand.sortByRank")}
      </button>
    </div>
  );
}
