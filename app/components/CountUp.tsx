"use client";

// A number that counts up from 0 to `value` — the round-summary score tally.
// Duration scales with Game speed; under Reduce motion (or "Instant") it just
// shows the final value. The real number is always in the DOM for screen
// readers (aria-label), so the animation is purely visual.

import { useEffect, useState } from "react";
import { prefersReducedMotion, scaleMs } from "../lib/motion";

const BASE_MS = 700;

export function CountUp({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const ms = scaleMs(BASE_MS);
    if (prefersReducedMotion() || ms <= 0 || value <= 0) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span aria-label={`${prefix}${value}`}>
      {prefix}
      {shown}
    </span>
  );
}
