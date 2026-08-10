"use client";

import { Card } from "@/types";

const SUIT_SYMBOL: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
  joker: "★",
};

const RED_SUITS = new Set(["hearts", "diamonds"]);

interface PlayingCardProps {
  card: Card;
  selected?: boolean;
  faceDown?: boolean;
  small?: boolean;
  isNew?: boolean;
  onClick?: () => void;
}

// Renders as a <div>, never a <button> — callers (draw pile, discard pile,
// table melds) already wrap cards in their own <button>, and buttons can't
// legally nest.
export function PlayingCard({ card, selected, faceDown, small, isNew, onClick }: PlayingCardProps) {
  const size = small ? "h-14 w-10 text-xs" : "h-20 w-14 text-sm";

  if (faceDown) {
    return (
      <div
        className={`${size} shrink-0 rounded-lg border-2 border-amber-200/30 bg-emerald-800`}
      />
    );
  }

  const isRed = RED_SUITS.has(card.suit);
  const colorClass = card.isWild ? "wild" : isRed ? "red" : "";
  const label = card.rank === "JOKER" ? "JKR" : card.rank;

  return (
    <div className="relative shrink-0">
      {isNew && (
        <span className="absolute -top-1.5 -right-1.5 z-10 rounded-full bg-sky-400 px-1 text-[9px] font-bold leading-tight text-emerald-950 shadow">
          NEW
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
        className={`card-face ${colorClass} ${size} flex flex-col items-center justify-center gap-0.5 font-bold transition ${
          onClick ? "cursor-pointer hover:-translate-y-1" : "cursor-default"
        } ${selected ? "-translate-y-2 ring-2 ring-amber-400" : ""} ${
          isNew ? "ring-2 ring-sky-400" : ""
        }`}
      >
        <span>{label}</span>
        <span className="text-base leading-none">{SUIT_SYMBOL[card.suit]}</span>
      </div>
    </div>
  );
}
