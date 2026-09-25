"use client";

// A fixed-position overlay that animates a card "flying" from one spot on
// the board to another — hand → table when you meld, discard pile → hand
// when someone draws, and so on. The game screen holds a ref to it and
// calls `fly([{ card, from, to, delay }])` with screen rects; this layer
// renders throwaway `PlayingCard` clones that tween across and clean
// themselves up. Purely cosmetic: it carries no game state, and it no-ops
// entirely under `prefers-reduced-motion`.

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Card } from "@/types";
import { PlayingCard } from "./PlayingCard";

const FLIGHT_MS = 380;

interface Point {
  x: number;
  y: number;
}

interface FlightSpec {
  card: Card;
  /** Element (or its rect) the card leaves from. */
  from: HTMLElement | DOMRect | null;
  /** Element (or its rect) the card lands on. */
  to: HTMLElement | DOMRect | null;
  /** Stagger, ms — used to fan out the cards of a meld. */
  delay?: number;
  /** Face-down while in flight (a blind draw from the pile). */
  faceDown?: boolean;
}

interface Flight {
  id: number;
  card: Card;
  faceDown: boolean;
  from: Point;
  to: Point;
  delay: number;
}

export interface CardFlightHandle {
  /** Animate one or more cards from A to B. No-ops under
   * prefers-reduced-motion, or if either anchor is missing. */
  fly: (specs: FlightSpec[]) => void;
}

function centerOf(target: HTMLElement | DOMRect | null): Point | null {
  if (!target) return null;
  const r = target instanceof HTMLElement ? target.getBoundingClientRect() : target;
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * A fixed overlay that flies a card clone from one on-screen anchor to
 * another — the connective tissue for draw (pile → hand), discard (hand →
 * pile), and meld (hand → table). Mounted once by the game board, driven
 * imperatively via a ref so the board doesn't need to be split around a
 * context provider. The clone is the real PlayingCard at its normal size,
 * translated centre-to-centre; source and destination cards are all the
 * same size in this game, so no scaling is needed.
 */
export const CardFlightLayer = forwardRef<CardFlightHandle>(function CardFlightLayer(_props, ref) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const nextId = useRef(0);

  const fly = useCallback((specs: FlightSpec[]) => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const added: Flight[] = [];
    for (const spec of specs) {
      const from = centerOf(spec.from);
      const to = centerOf(spec.to);
      if (!from || !to) continue;
      added.push({
        id: nextId.current++,
        card: spec.card,
        faceDown: !!spec.faceDown,
        from,
        to,
        delay: spec.delay ?? 0,
      });
    }
    if (added.length === 0) return;

    setFlights((f) => [...f, ...added]);
    const life = Math.max(...added.map((a) => a.delay)) + FLIGHT_MS + 120;
    window.setTimeout(() => {
      const ids = new Set(added.map((a) => a.id));
      setFlights((f) => f.filter((x) => !ids.has(x.id)));
    }, life);
  }, []);

  useImperativeHandle(ref, () => ({ fly }), [fly]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]" aria-hidden="true">
      {flights.map((fl) => (
        <FlightCard key={fl.id} flight={fl} />
      ))}
    </div>
  );
});

function FlightCard({ flight }: { flight: Flight }) {
  const [arrived, setArrived] = useState(false);

  useLayoutEffect(() => {
    // two frames so the browser paints the start position before the
    // transition to the end position begins
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setArrived(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  const p = arrived ? flight.to : flight.from;
  const style: CSSProperties = {
    position: "fixed",
    left: 0,
    top: 0,
    // the PlayingCard's normal footprint is 56×80 (h-20 w-14) — offset by
    // half so the translate lands the card's centre on the anchor's centre
    transform: `translate(${p.x - 28}px, ${p.y - 40}px) rotate(${arrived ? 0 : -4}deg)`,
    transition: arrived
      ? `transform ${FLIGHT_MS}ms cubic-bezier(0.33, 0, 0.2, 1) ${flight.delay}ms, opacity 140ms ease ${
          flight.delay + FLIGHT_MS - 120
        }ms`
      : "none",
    opacity: arrived ? 0 : 1,
    filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.4))",
  };

  return (
    <div style={style}>
      <PlayingCard card={flight.card} faceDown={flight.faceDown} />
    </div>
  );
}
