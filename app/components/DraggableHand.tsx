"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Card } from "@/types";
import { cardLabel, PlayingCard } from "./PlayingCard";

interface DraggableHandProps {
  cards: Card[];
  selectedCardIds: string[];
  lastDrawnCardId: string | null;
  onCardClick: (card: Card) => void;
  onReorder: (cardIdsInOrder: string[]) => void;
  // Card IDs that could currently be laid off onto some meld on the table —
  // see the "Highlight possible lay-offs" Settings toggle.
  layoffEligibleIds?: Set<string>;
}

// Drag engages on whichever comes first: holding roughly still for
// LONG_PRESS_MS, or moving past BIG_MOVE_PX right away. A pure small-distance
// threshold doesn't work on touch — real touch input has enough jitter that a
// deliberate slow drag can stay under a few pixels of *net* displacement for
// a while, so a small threshold alone causes real drags to get misread as a
// tap release instead.
const LONG_PRESS_MS = 180;
const BIG_MOVE_PX = 18;

interface DragTracker {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  // Where within the card it was grabbed, so the ghost doesn't snap to be
  // centered under the pointer — it stays wherever the finger picked it up.
  grabOffsetX: number;
  grabOffsetY: number;
  width: number;
  height: number;
  dragging: boolean;
  order: string[];
  holdTimer: ReturnType<typeof setTimeout>;
  detach: () => void;
}

/**
 * Renders the hand as a pointer-draggable list — tap a card to select it
 * (via onCardClick), or press-and-drag it to a new spot to reorder the hand.
 * Uses raw Pointer Events (not HTML5 drag-and-drop) so it works the same on
 * touch (iOS) and mouse.
 *
 * Once a drag engages, move/up/cancel are tracked via listeners on
 * `document` rather than handlers on the dragged card's own element. The
 * dragged card is `visibility: hidden` while dragging (see below), and
 * hidden elements don't receive pointer events through normal hit-testing —
 * only `setPointerCapture` would keep events routed to it, and that isn't
 * reliably available on every mobile browser. Without it, a pointerup could
 * land on whatever sibling is now under the finger (siblings physically
 * shift during a live reorder) instead of the dragged card, which never
 * resolves the drag — the card stays stuck mid-air. Document-level
 * listeners don't depend on hit-testing at all, so this can't happen.
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
  layoffEligibleIds,
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

  // Includes the dragged card's own (still-laid-out, merely hidden) slot as
  // a candidate — otherwise the very first move after engaging a drag always
  // "wins" against whichever neighbor happens to be marginally closer, since
  // there'd be nothing to beat. Including it means a swap only fires once
  // the pointer actually crosses the midpoint into a neighbor's slot.
  function closestIndex(x: number, y: number, ord: string[]): number {
    let best = -1;
    let bestDist = Infinity;
    ord.forEach((id, i) => {
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

  function engageDrag(card: Card) {
    const drag = dragRef.current;
    if (!drag || drag.id !== card.id || drag.dragging) return;
    drag.dragging = true;
    setDragId(card.id);
    setPointerPos({ x: drag.lastX, y: drag.lastY });
  }

  function moveTo(card: Card, x: number, y: number) {
    const drag = dragRef.current;
    if (!drag || drag.id !== card.id) return;
    drag.lastX = x;
    drag.lastY = y;

    if (!drag.dragging) {
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      if (Math.hypot(dx, dy) < BIG_MOVE_PX) return;
      clearTimeout(drag.holdTimer);
      engageDrag(card);
    }

    setPointerPos({ x, y });

    const targetIndex = closestIndex(x, y, drag.order);
    const currentIndex = drag.order.indexOf(drag.id);
    if (targetIndex !== -1 && targetIndex !== currentIndex) {
      const next = drag.order.slice();
      next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, drag.id);
      drag.order = next;
      setOrder(next);
    }
  }

  function finishDrag(card: Card) {
    const drag = dragRef.current;
    if (!drag || drag.id !== card.id) return;
    clearTimeout(drag.holdTimer);
    dragRef.current = null;
    setDragId(null);
    if (drag.dragging) {
      onReorder(drag.order);
    } else {
      onCardClick(card);
    }
  }

  function cancelDrag(card: Card) {
    const drag = dragRef.current;
    if (!drag || drag.id !== card.id) return;
    clearTimeout(drag.holdTimer);
    dragRef.current = null;
    setDragId(null);
    if (drag.dragging) {
      // Interrupted mid-drag (e.g. system gesture) — revert to the last
      // committed order instead of keeping a half-applied reorder.
      setOrder(cards.map((c) => c.id));
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>, card: Card) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Defensively close out any previous drag whose listeners never got a
    // chance to detach (the exact failure mode this file used to have).
    dragRef.current?.detach();

    const rect = e.currentTarget.getBoundingClientRect();
    const pointerId = e.pointerId;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      moveTo(card, ev.clientX, ev.clientY);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      detach();
      finishDrag(card);
    };
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      detach();
      cancelDrag(card);
    };
    function detach() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);

    dragRef.current = {
      id: card.id,
      pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      grabOffsetX: e.clientX - rect.left,
      grabOffsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      dragging: false,
      order: order.slice(),
      holdTimer: setTimeout(() => engageDrag(card), LONG_PRESS_MS),
      detach,
    };
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
            aria-label={cardLabel(card)}
            aria-pressed={selectedCardIds.includes(card.id)}
            onPointerDown={(e) => handlePointerDown(e, card)}
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
              canLayOff={layoffEligibleIds?.has(card.id)}
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
            canLayOff={layoffEligibleIds?.has(draggedCard.id)}
          />
        </div>
      )}
    </div>
  );
}
