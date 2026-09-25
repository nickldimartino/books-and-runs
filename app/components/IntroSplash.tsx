"use client";

// A short "deal" animation the very first time someone enters the site in a
// browser session — the console-boot moment before the home screen. It only
// runs when the data-intro inline script in layout.tsx armed it (first
// visit to "/", not a refresh, not prefers-reduced-motion), so this
// component renders nothing visible on every other load. Tapping skips it.

import { useEffect, useState, type CSSProperties } from "react";
import { useT } from "../lib/i18n/LocaleProvider";

const SEEN_KEY = "booksAndRuns:introSeen";
const DURATION_MS = 2650;

// A book (three ♠) and the front of a run (♥ ♦ ♣ …) — "books and runs" dealt
// across the screen. `dx/dy` fan them into a dealer's arc; `rot` tilts each.
const CARDS = [
  { s: "♠", dx: -150, dy: 34, rot: -16, red: 0 },
  { s: "♠", dx: -100, dy: 12, rot: -11, red: 0 },
  { s: "♠", dx: -50, dy: -2, rot: -5, red: 0 },
  { s: "♥", dx: 0, dy: -8, rot: 0, red: 1 },
  { s: "♦", dx: 50, dy: -2, rot: 5, red: 1 },
  { s: "♣", dx: 100, dy: 12, rot: 11, red: 0 },
  { s: "♥", dx: 150, dy: 34, rot: 16, red: 1 },
];

export function IntroSplash() {
  const { t } = useT();
  // Server-rendered *present* (hidden by CSS unless public/init.js armed
  // html[data-intro]) rather than mounted after hydration: the splash title
  // is the page's largest paint on a first visit, so it has to be in the
  // static HTML for LCP to be measured from first paint instead of from
  // "JS downloaded + hydrated" (that was ~2-3 s on a slow phone). The
  // effect below only removes it once it's over or when it was never armed.
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (document.documentElement.getAttribute("data-intro") !== "1") {
      setDone(true);
      return;
    }
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode — worst case the intro replays next navigation */
    }
    // The CSS animation started at first paint, not now — hydration may land
    // well after that on a slow connection, so only wait out what's left of
    // the timeline (the ::before cover must not outlive the animation).
    let painted = 0;
    try {
      painted = performance.getEntriesByName("first-paint")[0]?.startTime ?? 0;
    } catch {
      /* no paint timing — assume the timeline started at navigation */
    }
    const remaining = Math.max(250, painted + DURATION_MS - performance.now());
    const timer = setTimeout(finish, remaining);
    return () => clearTimeout(timer);
  }, []);

  function finish() {
    setDone(true);
    document.documentElement.removeAttribute("data-intro");
  }

  if (done) return null;

  return (
    <div className="intro-splash" role="presentation" onClick={finish}>
      <div className="intro-inner">
        <div className="intro-stage" aria-hidden="true">
          {CARDS.map((c, i) => (
            <div
              key={i}
              className="intro-card"
              data-red={c.red}
              style={
                {
                  // deal stagger; the sweep-out delay is fixed in the CSS
                  animationDelay: `${i * 55}ms, 1950ms`,
                  "--dx": `${c.dx}px`,
                  "--dy": `${c.dy}px`,
                  "--rot": `${c.rot}deg`,
                } as CSSProperties
              }
            >
              {c.s}
            </div>
          ))}
        </div>
        <p className="intro-title">Books &amp; Runs</p>
        <p className="intro-tap">{t("home.tapToSkip")}</p>
      </div>
    </div>
  );
}
