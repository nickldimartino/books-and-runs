"use client";

import { Card } from "@/types";
import { PlayingCard } from "./PlayingCard";

interface BuyOfferGateProps {
  playerName: string;
  card: Card;
  onRespond: (accept: boolean) => void;
}

/**
 * Shown between a discard and the next player's turn when another player
 * (not the discarder, not the player who has normal free priority) has the
 * option to buy the top discard — taking it plus a penalty card from the
 * draw pile, without it becoming their turn.
 */
export function BuyOfferGate({ playerName, card, onRespond }: BuyOfferGateProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <p className="text-sm uppercase tracking-wide text-[var(--faint)]">Pass the device to</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--heading)]">{playerName}</h1>
      </div>

      <div className="flex flex-col items-center gap-3">
        <PlayingCard card={card} />
        <p className="max-w-xs text-sm text-[var(--muted)]">
          Buy this discard? You&apos;ll take it plus one penalty card from the draw pile.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => onRespond(false)}
          className="rounded-lg border border-[var(--border)] px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          No thanks
        </button>
        <button
          onClick={() => onRespond(true)}
          className="rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
        >
          Buy it
        </button>
      </div>
    </main>
  );
}
