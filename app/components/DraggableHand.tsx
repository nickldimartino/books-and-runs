"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Card } from "@/types";
import { PlayingCard } from "./PlayingCard";

interface DraggableHandProps {
  cards: Card[];
  selectedCardIds: string[];
  lastDrawnCardId: string | null;
  onCardClick: (card: Card) => void;
  onReorder: (cardIdsInOrder: string[]) => void;
}

const DRAG_THRESHOLD_PX = 8;

interface DragTracker {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  // Where within the card it was grabbed, so the ghost doesn't snap to be
  // centered under the pointer — it stays wherever the finger picked it up.
  grabOffsetX: number;
  grabOffsetY: number;
  width: number;
  height: number;
  dragging: boolean;
  order: string[];
}

/**
 * Renders the hand as a pointer-draggable list — tap a card to select it
 * (via onCardClick), or drag it to a new spot to reorder the hand. Uses raw
 * Pointer Events (not HTML5 drag-and-drop) so it works the same on touch
 * (iOS) and mouse. A small movement threshold disambiguates a tap from the
 * start of a drag.
 *
 * The dragged card is rendered as a fixed-position ghost that tracks the raw
 * pointer coordinates directly, decoupled from the flex list's own layout.
 * Reordering the underlying list mid-drag relocates cards within the flex
 * flow (so the gap follows your finger), but that must never feed back into
 * the ghost's position — otherwise a flex reflow and a delta-from-drag-start
 * transform compound, and the card can jump partway across the screen.
 */
export function DraggableHand({
  cards,
  selectedCardIds,
  lastDrawnCardId,
  onCardClick,
  onReorder,
}: DraggableHandProps) {
  const cardElRefs = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<DragTracker | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });
  const [order, setOrder] = useState<string[]>(() => cards.map((c) => c.id));

  // Resync local order when the hand's contents or committed order change
  // for reasons other than our own in-progress drag (draw, discard, staged
  // group, sort button, new round, etc).
  const cardIdsKey = cards.map((c) => c.id).join(",");
  const prevKeyRef = useRef(cardIdsKey);
  if (prevKeyRef.current !== cardIdsKey && !dragRef.current) {
    prevKeyRef.current = cardIdsKey;
    setOrder(cards.map((c) => c.id));
  }

  const byId = new Map(cards.map((c) => [c.id, c]));
  const orderedCards = order.map((id) => byId.get(id)).filter((c): c is Card => !!c);
  const draggedCard = dragId ? byId.get(dragId) ?? null : null;

  function closestIndex(x: number, y: number, excludeId: string, ord: string[]): number {
    let best = -1;
    let bestDist = Infinity;
    ord.forEach((id, i) => {
      if (id === excludeId) return;
      const el = cardElRefs.current.get(id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>, card: Card) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      id: card.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grabOffsetX: e.clientX - rect.left,
      grabOffsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      dragging: false,
      order: order.slice(),
    };
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>, card: Card) {
    const drag = dragRef.current;
    if (!drag || drag.id !== card.id) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.dragging = true;
      setDragId(card.id);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Capture is a nicety (keeps events routed here if the pointer
        // drifts off the element mid-drag) — safe to continue without it.
      }
    }

    setPointerPos({ x: e.clientX, y: e.clientY });

    const targetIndex = closestIndex(e.clientX, e.clientY, drag.id, drag.order);
    const currentIndex = drag.order.indexOf(drag.id);
    if (targetIndex !== -1 && targetIndex !== currentIndex) {
      const next = drag.order.slice();
      next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, drag.id);
      drag.order = next;
      setOrder(next);
    }
  }

  function endDrag(card: Card) {
    const drag = dragRef.current;
    if (!drag || drag.id !== card.id) return;
    dragRef.current = null;
    setDragId(null);
    if (drag.dragging) {
      onReorder(drag.order);
    } else {
      onCardClick(card);
    }
  }

  function handlePointerCancel(card: Card) {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragId(null);
    if (drag?.dragging) {
      // Interrupted mid-drag (e.g. system gesture) — revert to the last
      // committed order instead of keeping a half-applied reorder.
      setOrder(cards.map((c) => c.id));
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {orderedCards.map((card) => {
        const isDragging = dragId === card.id;
        return (
          <div
            key={card.id}
            ref={(el) => {
              if (el) cardElRefs.current.set(card.id, el);
              else cardElRefs.current.delete(card.id);
            }}
            role="button"
            tabIndex={0}
            onPointerDown={(e) => handlePointerDown(e, card)}
            onPointerMove={(e) => handlePointerMove(e, card)}
            onPointerUp={() => endDrag(card)}
            onPointerCancel={() => handlePointerCancel(card)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onCardClick(card);
              }
            }}
            style={{
              touchAction: "none",
              WebkitTouchCallout: "none",
              // Keep the dragged card's slot in the flow (so the gap it left
              // doesn't collapse and neighbors don't jump) but hide it —
              // the ghost below is what's actually visible while dragging.
              visibility: isDragging ? "hidden" : undefined,
            }}
            className="select-none cursor-grab"
          >
            <PlayingCard
              card={card}
              selected={selectedCardIds.includes(card.id)}
              isNew={card.id === lastDrawnCardId}
            />
          </div>
        );
      })}

      {draggedCard && dragRef.current && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: pointerPos.x - dragRef.current.grabOffsetX,
            top: pointerPos.y - dragRef.current.grabOffsetY,
            width: dragRef.current.width,
            height: dragRef.current.height,
            zIndex: 50,
            pointerEvents: "none",
            transform: "scale(1.08)",
            filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.4))",
          }}
        >
          <PlayingCard
            card={draggedCard}
            selected={selectedCardIds.includes(draggedCard.id)}
            isNew={draggedCard.id === lastDrawnCardId}
          />
        </div>
      )}
    </div>
  );
}
