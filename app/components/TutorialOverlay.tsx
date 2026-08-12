"use client";

import { useLayoutEffect, useState } from "react";
import { TutorialStep } from "../lib/tutorialSteps";

interface TutorialOverlayProps {
  step: TutorialStep;
  stepIndex: number;
  totalSteps: number;
  onContinue: () => void;
  onSkip: () => void;
}

const PAD = 8;
const TOOLTIP_WIDTH = 280;
const GAP = 8;

/**
 * A spotlight tour overlay: dims the whole screen except a cutout around the
 * current step's target element (found via `[data-tutorial="<target>"]` on
 * the real game UI underneath), with a tooltip bubble explaining what to do.
 * Four separate strips fill the dimmed area rather than one big div with a
 * CSS box-shadow "hole" — box-shadow alone is purely visual and wouldn't
 * actually block clicks outside the cutout, and blocking those is the whole
 * point (it's what keeps the tour in order). The cutout itself is just empty
 * space, so taps reach the real element underneath it untouched.
 */
export function TutorialOverlay({ step, stepIndex, totalSteps, onContinue, onSkip }: TutorialOverlayProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!step.target) {
      setRect(null);
      return;
    }
    const targets = Array.isArray(step.target) ? step.target : [step.target];
    function measure() {
      const rects = targets
        .map((t) => document.querySelector(`[data-tutorial="${t}"]`))
        .filter((el): el is Element => !!el)
        .map((el) => el.getBoundingClientRect());
      if (rects.length === 0) return null;
      // The union of every named target's box — a step whose instructions
      // span two separate sections needs both spotlighted at once, not just
      // whichever one it's centered on.
      return {
        top: Math.min(...rects.map((r) => r.top)),
        left: Math.min(...rects.map((r) => r.left)),
        bottom: Math.max(...rects.map((r) => r.bottom)),
        right: Math.max(...rects.map((r) => r.right)),
      };
    }
    function recompute() {
      const union = measure();
      if (!union) {
        setRect(null);
        return;
      }
      // A target sitting outside the current scroll position leaves the
      // tooltip nowhere valid to render — for a wide union (e.g. the hand
      // plus the "Build your meld" section for the book/run steps) this is
      // routine, not an edge case, so correct for it every time rather than
      // relying on the player to already happen to be scrolled right.
      const margin = 24;
      if (union.top < margin || union.bottom > window.innerHeight - margin) {
        const centerDocY = window.scrollY + (union.top + union.bottom) / 2;
        window.scrollTo({ top: Math.max(0, centerDocY - window.innerHeight / 2), behavior: "instant" });
        // getBoundingClientRect() right after scrollTo() isn't guaranteed to
        // reflect the new scroll position yet — measuring again next frame,
        // instead of immediately, avoids locking the spotlight onto
        // pre-scroll coordinates.
        requestAnimationFrame(() => {
          const settled = measure();
          if (!settled) return;
          setRect(new DOMRect(settled.left, settled.top, settled.right - settled.left, settled.bottom - settled.top));
        });
        return;
      }
      setRect(new DOMRect(union.left, union.top, union.right - union.left, union.bottom - union.top));
    }
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    // Catches layout shifts recompute's own listeners can't — e.g. the hand
    // shrinking as cards get staged into a meld group while this step is up.
    const observer = new MutationObserver(recompute);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
      observer.disconnect();
    };
  }, [step.target]);

  const isGated = step.gate.type !== "tap";

  if (!rect) {
    // No target (or target not found yet) — a plain centered modal.
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6">
        <TutorialCard
          step={step}
          stepIndex={stepIndex}
          totalSteps={totalSteps}
          isGated={isGated}
          onContinue={onContinue}
          onSkip={onSkip}
          style={{ position: "relative", width: TOOLTIP_WIDTH }}
        />
      </div>
    );
  }

  const cutoutTop = rect.top - PAD;
  const cutoutLeft = rect.left - PAD;
  const cutoutWidth = rect.width + PAD * 2;
  const cutoutHeight = rect.height + PAD * 2;
  const cutoutBottom = cutoutTop + cutoutHeight;
  const cutoutRight = cutoutLeft + cutoutWidth;

  const spaceBelow = window.innerHeight - cutoutBottom;
  const placeBelow = spaceBelow > 200 || spaceBelow > cutoutTop;
  let tooltipLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
  tooltipLeft = Math.max(12, Math.min(tooltipLeft, window.innerWidth - TOOLTIP_WIDTH - 12));

  return (
    // pointer-events-none on the root is the actual fix here: a
    // `fixed inset-0` box intercepts clicks anywhere in its box by default,
    // even over the "empty" cutout where no child paints anything — hit
    // testing follows the box model, not visible pixels. Without this, the
    // cutout looks open but a real tap there never reaches the button
    // underneath. Each strip (and the card) opts back in with
    // pointer-events-auto so they still block/respond as intended.
    <div className="fixed inset-0 z-[100] pointer-events-none" aria-live="polite">
      {/* Four dimmed strips framing the cutout — these are what actually
          block clicks outside the spotlighted element. */}
      <div
        className="fixed inset-x-0 top-0 bg-black/70 pointer-events-auto"
        style={{ height: Math.max(0, cutoutTop) }}
      />
      <div
        className="fixed inset-x-0 bottom-0 bg-black/70 pointer-events-auto"
        style={{ top: Math.min(window.innerHeight, cutoutBottom) }}
      />
      <div
        className="fixed bg-black/70 pointer-events-auto"
        style={{ top: cutoutTop, height: cutoutHeight, left: 0, width: Math.max(0, cutoutLeft) }}
      />
      <div
        className="fixed bg-black/70 pointer-events-auto"
        style={{ top: cutoutTop, height: cutoutHeight, left: Math.min(window.innerWidth, cutoutRight), right: 0 }}
      />

      {/* Glowing ring around the target — no pointer-events, purely visual. */}
      <div
        className="tutorial-ring pointer-events-none fixed rounded-lg ring-2 ring-[var(--accent)]"
        style={{ top: cutoutTop, left: cutoutLeft, width: cutoutWidth, height: cutoutHeight }}
      />

      <TutorialCard
        step={step}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        isGated={isGated}
        onContinue={onContinue}
        onSkip={onSkip}
        style={{
          position: "fixed",
          width: TOOLTIP_WIDTH,
          left: tooltipLeft,
          top: placeBelow ? cutoutBottom + GAP : undefined,
          bottom: placeBelow ? undefined : window.innerHeight - cutoutTop + GAP,
        }}
        caret={placeBelow ? "up" : "down"}
        caretLeft={Math.max(16, Math.min(rect.left + rect.width / 2 - tooltipLeft, TOOLTIP_WIDTH - 16))}
      />
    </div>
  );
}

function TutorialCard({
  step,
  stepIndex,
  totalSteps,
  isGated,
  onContinue,
  onSkip,
  style,
  caret,
  caretLeft,
}: {
  step: TutorialStep;
  stepIndex: number;
  totalSteps: number;
  isGated: boolean;
  onContinue: () => void;
  onSkip: () => void;
  style: React.CSSProperties;
  caret?: "up" | "down";
  caretLeft?: number;
}) {
  return (
    <div
      style={style}
      className="pointer-events-auto flex flex-col gap-3 rounded-xl bg-[var(--panel)] p-4 shadow-2xl"
    >
      {caret && (
        <div
          className="absolute h-3 w-3 rotate-45 bg-[var(--panel)]"
          style={{
            left: caretLeft,
            top: caret === "up" ? -6 : undefined,
            bottom: caret === "down" ? -6 : undefined,
          }}
        />
      )}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)]">
          Step {stepIndex + 1} of {totalSteps}
        </span>
        <button onClick={onSkip} className="text-[10px] font-medium text-[var(--faint)] hover:text-[var(--muted)]">
          Skip tutorial
        </button>
      </div>
      <div>
        <h3 className="text-sm font-bold text-[var(--heading)]">{step.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{step.body}</p>
      </div>
      {isGated ? (
        <p className="text-xs font-medium text-[var(--accent)]">↑ Go ahead and try it</p>
      ) : (
        <button
          onClick={onContinue}
          className="self-end rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)]"
        >
          Got it →
        </button>
      )}
    </div>
  );
}
