"use client";

import { Card } from "@/types";
import type { TranslationKey } from "../lib/i18n/keys";
import { CardFace } from "./CardFace";
import { useT } from "../lib/i18n/LocaleProvider";

// Exported so HandPreviewBar.tsx's mini fanned cards can reuse the exact
// same suit glyphs / red-suit rule as the real card face, rather than a
// second copy that could quietly drift out of sync with this one.
export const SUIT_SYMBOL: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
  joker: "★",
};

export const RED_SUITS = new Set(["hearts", "diamonds"]);

const RANK_KEY: Partial<Record<string, string>> = {
  A: "card.rank.ace",
  K: "card.rank.king",
  Q: "card.rank.queen",
  J: "card.rank.jack",
  JOKER: "card.joker",
};

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

// Screen readers otherwise only get the rank/suit symbols' raw text content
// as a card's accessible name, which doesn't reliably announce as anything
// meaningful (e.g. a suit glyph isn't guaranteed to read as "hearts"). Takes
// `t` rather than calling useT() itself since this is a plain function, not
// a component/hook — called from several different components' own render
// and effect bodies (game/page.tsx, DraggableHand.tsx).
export function cardLabel(card: Card, t: T): string {
  const rankKey = RANK_KEY[card.rank];
  const rank = rankKey ? t(rankKey as TranslationKey) : card.rank;
  if (card.suit === "joker") return rank;
  const suit = t(`card.suit.${card.suit}` as TranslationKey);
  return card.isWild ? t("card.labelWild", { rank, suit }) : t("card.label", { rank, suit });
}

interface PlayingCardProps {
  card: Card;
  selected?: boolean;
  faceDown?: boolean;
  small?: boolean;
  isNew?: boolean;
  onClick?: () => void;
  // For a wild card laid down within a run, the rank it's standing in for
  // (e.g. "7") — shown as a small badge since an unlabeled wild in a run is
  // otherwise genuinely ambiguous (could be either neighboring gap).
  standInRank?: string;
  // This card (in hand, or the top of the discard pile) could currently be
  // laid off onto some meld already on the table — see the "Highlight
  // possible lay-offs" Settings toggle.
  canLayOff?: boolean;
}

// Renders as a <div>, never a <button> — callers (draw pile, discard pile,
// table melds) already wrap cards in their own <button>, and buttons can't
// legally nest.
export function PlayingCard({
  card,
  selected,
  faceDown,
  small,
  isNew,
  onClick,
  standInRank,
  canLayOff,
}: PlayingCardProps) {
  const { t } = useT();
  const size = small ? "h-14 w-10 text-xs" : "h-20 w-14 text-sm";

  if (faceDown) {
    return (
      <div
        className={`card-back ${size} shrink-0 rounded-lg border-2 border-[var(--accent)]/30 bg-[var(--elevated)]`}
      />
    );
  }

  const isRed = RED_SUITS.has(card.suit);
  const colorClass = card.isWild ? "wild" : isRed ? "red" : "";

  return (
    <div className="relative shrink-0">
      {/* These three badges all get card-enter too (inheriting the exact
          same --card-enter-delay as the card face below, set on this
          shared wrapper) — without it they rendered instantly at full
          opacity while the card face they're attached to was still 0.22s
          into fading/scaling in, so the badge visibly appeared *before*
          the card it's describing did. */}
      {isNew && (
        <span className="card-enter absolute -top-1.5 -right-1.5 z-10 rounded-full bg-[var(--highlight)] px-1 text-[11px] font-bold leading-tight text-[var(--on-accent)] shadow">
          {t("card.newBadge")}
        </span>
      )}
      {canLayOff && (
        <span
          title={t("card.canLayOffTitle")}
          // Wild cards' own face is already a pale gold close to --accent, so
          // the badge needs a light ring around it to stay visible there —
          // --card-bg is a near-white constant across every theme, unlike
          // --panel/--bg which flip dark/light per theme.
          className="card-enter absolute -top-1.5 -left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold leading-none text-[var(--on-accent)] shadow ring-2 ring-[var(--card-bg)]"
        >
          ↓
        </span>
      )}
      {standInRank && (
        <span className="card-enter absolute -bottom-1.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--highlight)] px-1.5 text-[11px] font-bold leading-tight text-[var(--on-accent)] shadow">
          as {standInRank}
        </span>
      )}
      <div
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        className={`card-face card-enter ${colorClass} ${size} overflow-hidden transition will-change-transform ${
          onClick ? "cursor-pointer hover:-translate-y-1" : "cursor-default"
        } ${selected ? "card-lifted -translate-y-2 ring-2 ring-[var(--accent)]" : ""} ${
          isNew ? "ring-2 ring-[var(--highlight)]" : ""
        }`}
      >
        <CardFace card={card} />
      </div>
    </div>
  );
}
