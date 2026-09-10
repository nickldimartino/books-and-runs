"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Card, Rank, Suit } from "@/types";
import { CardFace } from "./CardFace";
import { RED_SUITS } from "./PlayingCard";

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// A deterministic hand for the server render and the first client render
// (so hydration matches) — a book of 7s and the front of a spade run,
// "books and runs" in one hand. A random one is dealt in right after mount.
const DEFAULT_FAN: Card[] = [
  { id: "hero-7h", suit: "hearts", rank: "7", isWild: false },
  { id: "hero-7d", suit: "diamonds", rank: "7", isWild: false },
  { id: "hero-7s", suit: "spades", rank: "7", isWild: false },
  { id: "hero-8s", suit: "spades", rank: "8", isWild: false },
  { id: "hero-9s", suit: "spades", rank: "9", isWild: false },
];

/** Five distinct cards (no jokers — they read oddly in a decorative fan),
 * a new set each page load. */
function randomFan(): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  while (out.length < 5) {
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
    const key = `${rank}${suit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `hero-${key}`, suit, rank, isWild: rank === "2" });
  }
  return out;
}

/**
 * A small fanned hand at the top of Home — real CardFace cards, a fresh
 * random five dealt in on each load, then still. Gives the landing screen
 * a face instead of opening straight into a wall of buttons. Purely
 * decorative (aria-hidden). Fan geometry lives on the outer wrapper
 * (static); the deal-in lives on the inner wrapper (`hero-deal`, gated by
 * prefers-reduced-motion in globals.css to the cards simply being present).
 */
export function CardFanHero() {
  const [fan, setFan] = useState<Card[]>(DEFAULT_FAN);

  // After mount only — Math.random() during render would mismatch the
  // static server HTML. Changing the cards changes their keys, which
  // remounts them and replays the deal-in, so the swap reads as the hand
  // being dealt rather than a flicker.
  useEffect(() => setFan(randomFan()), []);

  const mid = (fan.length - 1) / 2;
  return (
    <div aria-hidden="true" className="pointer-events-none relative mx-auto mb-5 h-[112px] w-full max-w-[260px]">
      {fan.map((card, i) => {
        const offset = i - mid;
        const outer: CSSProperties = {
          transform: `translateX(calc(-50% + ${offset * 40}px)) translateY(${Math.abs(offset) * 6}px) rotate(${offset * 6.5}deg)`,
          zIndex: i,
        };
        return (
          <div key={card.id} style={outer} className="absolute left-1/2 top-2 origin-bottom">
            <div className="hero-deal" style={{ animationDelay: `${i * 65}ms` }}>
              {/* card-face's colour token drives CardFace's currentColor —
                  same red/wild/black rule PlayingCard applies. */}
              <div
                className={`card-face ${
                  card.isWild ? "wild" : RED_SUITS.has(card.suit) ? "red" : ""
                } h-[90px] w-[64px] overflow-hidden rounded-lg`}
              >
                <CardFace card={card} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
