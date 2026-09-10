"use client";

import { type CSSProperties } from "react";
import { Card } from "@/types";
import { CardFace } from "./CardFace";

// A book of 7s and the front of a spade run — "books and runs" in one hand.
const FAN: Card[] = [
  { id: "hero-7h", suit: "hearts", rank: "7", isWild: false },
  { id: "hero-7d", suit: "diamonds", rank: "7", isWild: false },
  { id: "hero-7s", suit: "spades", rank: "7", isWild: false },
  { id: "hero-8s", suit: "spades", rank: "8", isWild: false },
  { id: "hero-9s", suit: "spades", rank: "9", isWild: false },
];

/**
 * A small fanned hand at the top of Home — the real CardFace cards, dealt
 * in once on load and then still. Gives the landing screen a face instead
 * of opening straight into a wall of buttons. Purely decorative
 * (aria-hidden). The fan geometry lives on the outer wrapper (static); the
 * one-time deal-in lives on the inner wrapper (`hero-deal`, gated by
 * prefers-reduced-motion in globals.css, where it resolves to the cards
 * simply being present).
 */
export function CardFanHero() {
  const mid = (FAN.length - 1) / 2;
  return (
    <div aria-hidden="true" className="pointer-events-none relative mx-auto mb-5 h-[112px] w-full max-w-[260px]">
      {FAN.map((card, i) => {
        const offset = i - mid;
        const outer: CSSProperties = {
          transform: `translateX(calc(-50% + ${offset * 40}px)) translateY(${Math.abs(offset) * 6}px) rotate(${offset * 6.5}deg)`,
          zIndex: i,
        };
        return (
          <div key={card.id} style={outer} className="absolute left-1/2 top-2 origin-bottom">
            <div className="hero-deal" style={{ animationDelay: `${i * 65}ms` }}>
              <div className="card-face h-[90px] w-[64px] overflow-hidden rounded-lg">
                <CardFace card={card} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
