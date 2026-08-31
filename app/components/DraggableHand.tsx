"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
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
  const enterDelaysRef = useRef(new Map<string, number>());
  const handRootRef = useRef<HTMLDivElement | null>(null);
  // null until the first measurement — distinguishes "the hand just mounted
  // for the first time" (nothing to slide from yet) from "the order changed
  // again" (see the FLIP effect below).
  const prevRectsRef = useRef<Map<string, DOMRect> | null>(null);
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

  // Each card's card-enter stagger delay is assigned once, the moment its id
  // is first seen, and reused for as long as it stays in the hand — NOT
  // recomputed from its current index on every render. It used to be
  // `index * 40ms` recalculated fresh every time (see git history), which
  // seemed harmless (a CSS animation-delay does nothing to an element that
  // isn't (re)starting the animation) but that assumption breaks the moment
  // the *value* changes on an element whose card-enter animation is already
  // playing or has already finished: mutating animation-delay via this
  // custom property can make the browser un-finish and replay it. Since a
  // sort/reorder changes almost every card's index, it was recomputing this
  // delay for almost every card on every reorder — and any card whose old
  // vs. new delay happened to straddle "now" would visibly pop back out and
  // re-enter, unrelated to whether it actually changed position. Caching by
  // id sidesteps that entirely: an already-mounted card's delay never
  // changes again, so reordering can never retrigger it. A genuinely new id
  // (dealt, drawn) still gets a fresh delay, staggered against only the
  // *other* new ids arriving in this same render — the normal case is one
  // drawn card with nothing else new, which resolves to 0ms (fade in right
  // away); a whole fresh hand (new round, pass-and-play reveal) has every id
  // new together, since that scenario remounts this whole component (see
  // the key game/page.tsx puts on it) with a blank cache, reproducing the
  // original "dealt one after another" cascade.
  const enterDelays = enterDelaysRef.current;
  for (const id of enterDelays.keys()) {
    if (!byId.has(id)) enterDelays.delete(id);
  }
  let freshCount = 0;
  for (const card of cards) {
    if (!enterDelays.has(card.id)) {
      enterDelays.set(card.id, freshCount * 40);
      freshCount++;
    }
  }

  // Uniform reorder animation: whenever the visual order actually changes —
  // a sort button, a drag-drop, or the two combined — every card still in
  // the hand slides smoothly from its old spot to its new one via one
  // shared FLIP transition, entirely separate from card-enter (that's a
  // *mount* animation for a genuinely new card; reusing/disturbing it for a
  // plain reorder was the actual cause of two related bugs users reported:
  //   - some cards visibly "blinking" on sort: a dealt hand's cards fade in
  //     staggered by up to ~500ms+, so a sort fired quickly after dealing
  //     could catch a later card's card-enter still genuinely mid-fade —
  //     reordering just teleported its DOM node with nothing settling that
  //     fade first, so it kept fading in at its *new* spot, reading as a
  //     flash rather than a slide.
  //   - the very first card never blinking: it's the one card guaranteed
  //     (0ms delay) to have already finished fading by any plausible
  //     reaction time — safe by luck, not by any real handling.
  // Forcibly finishing every still-running card-enter before measuring for
  // FLIP (below) means every card starts this slide from the exact same
  // fully-settled state — first card or last, sorted seconds after dealing
  // or minutes later.
  //
  // Deliberately skipped entirely while a drag is actively in progress
  // (dragRef.current set): moveTo() below calls setOrder on essentially
  // every pointermove as cards swap live under the finger, which is many
  // times more often than a single sort click — this same FLIP math applied
  // that often measures cards mid-transition from the *previous* swap and
  // inverts from there, and each successive swap compounds on the last,
  // visibly launching cards to wildly wrong positions well before they'd
  // ever finish easing into place. A live drag already gives its own
  // real-time feedback (the swapped cards' new flex slots track the pointer
  // immediately, same as before this animation existed) — actually easing
  // that would just add lag against a finger that's still moving. Still
  // updating prevRectsRef below either way, so the moment the drag ends
  // (dragRef.current cleared) this has an accurate baseline again — the
  // *next* reorder (a sort click, or the drop's own final settle, which by
  // then already matches the live preview so has nothing left to animate)
  // still gets the real slide.
  useLayoutEffect(() => {
    const prevRects = prevRectsRef.current;
    const newRects = new Map<string, DOMRect>();
    cardElRefs.current.forEach((el, id) => newRects.set(id, el.getBoundingClientRect()));

    if (prevRects && !dragRef.current) {
      handRootRef.current?.querySelectorAll<HTMLElement>(".card-enter").forEach((el) => {
        el.getAnimations().forEach((anim) => {
          if (anim.playState === "running") anim.finish();
        });
      });

      newRects.forEach((newRect, id) => {
        const oldRect = prevRects.get(id);
        if (!oldRect) return; // genuinely new this render — card-enter handles it, not this
        const dx = oldRect.left - newRect.left;
        const dy = oldRect.top - newRect.top;
        if (!dx && !dy) return;
        const el = cardElRefs.current.get(id);
        if (!el) return;
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        void el.offsetHeight; // force layout so the "invert" above is actually committed before the next frame clears it
        requestAnimationFrame(() => {
          el.style.transition = "transform 0.22s ease-out";
          el.style.transform = "";
        });
      });
    }

    prevRectsRef.current = newRects;
    // Deliberately keyed on `order` alone (not `cards`/`byId`, which change
    // reference on every render) — this should only run when the hand's
    // visual position actually changes, not on every unrelated re-render
    // (selecting a card, a badge toggling, etc). Everything else this effect
    // reads is a ref, which react-hooks/exhaustive-deps already excludes.
  }, [order]);

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
    // A card grabbed right after a sort/reorder could still be mid-slide
    // from the FLIP transition above — snap any leftover transform/transition
    // off every card right now, so the live drag (which deliberately skips
    // that animation entirely, see the effect above) starts from a clean,
    // untransformed layout rather than inheriting some in-flight offset.
    cardElRefs.current.forEach((el) => {
      el.style.transition = "none";
      el.style.transform = "";
    });
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
    <div ref={handRootRef} className="flex flex-wrap gap-2">
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
            style={
              {
                touchAction: "none",
                WebkitTouchCallout: "none",
                // Keep the dragged card's slot in the flow (so the gap it left
                // doesn't collapse and neighbors don't jump) but hide it —
                // the ghost below is what's actually visible while dragging.
                visibility: isDragging ? "hidden" : undefined,
                // Read by .card-enter's own animation-delay (see globals.css
                // and enterDelaysRef above) — cached per card id rather than
                // derived from `index` so a later reorder can't change it.
                "--card-enter-delay": `${enterDelays.get(card.id) ?? 0}ms`,
              } as CSSProperties
            }
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
