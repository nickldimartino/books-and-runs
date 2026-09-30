"use client";

// The "extra stuff around the navigation screens" half of automated holiday
// theming (see app/lib/holidayTheme.ts for the theme-color half). A handful
// of small, semi-transparent emoji pinned to the far left/right edges of the
// viewport for the same 7-day-before/7-day-after window the table theme
// itself follows — never the real content column (every page's own padding
// starts well past where these sit), so there's nothing for them to cover.
// `pointer-events: none` throughout and `aria-hidden` — purely decorative,
// never a tap target and never announced.
//
// Deliberately absent from the two actual play surfaces (/game,
// /multiplayer/play) — precision taps near the hand/discard pile are exactly
// where "doesn't hinder on-screen actions" earns the most scrutiny, and
// those screens already read as more "the table" than "the app around it."
// Everywhere else (Home, Settings, New Game, How to Play, sign-in, profile,
// etc.) is fair game.

import { usePathname } from "next/navigation";
import { CSSProperties, useEffect, useState } from "react";
import { activeHoliday, HolidayId } from "../lib/holidayTheme";

const DECORATIONS: Record<HolidayId, string[]> = {
  valentines: ["\u{1F49D}", "\u{1F339}", "\u{1F48C}"],
  stpatricks: ["\u{1F340}", "\u{2618}\u{FE0F}"],
  easter: ["\u{1F430}", "\u{1F95A}"],
  july4th: ["\u{1F386}", "\u{1F387}"],
  halloween: ["\u{1F383}", "\u{1F987}", "\u{1F47B}"],
  thanksgiving: ["\u{1F983}", "\u{1F341}"],
  hanukkah: ["\u{1F54E}", "\u{2726}"],
  christmas: ["\u{1F384}", "\u{1F385}", "❄️"],
  newyears: ["\u{1F389}", "\u{1F942}"],
};

// Fixed px offsets from the left/right edge (never percentages) so these
// stay clear of real content at every width, including the 375px mobile
// layout this app targets — content padding is always well past 40px.
const SLOTS: { side: "left" | "right"; top: string; offsetPx: number; rotate: number }[] = [
  { side: "left", top: "22%", offsetPx: 10, rotate: -12 },
  { side: "right", top: "18%", offsetPx: 14, rotate: 10 },
  { side: "left", top: "48%", offsetPx: 18, rotate: 8 },
  { side: "right", top: "55%", offsetPx: 8, rotate: -6 },
  { side: "left", top: "76%", offsetPx: 12, rotate: 14 },
  { side: "right", top: "82%", offsetPx: 16, rotate: -10 },
];

const HIDDEN_ROUTES = ["/game", "/multiplayer/play"];

export function HolidayDecorations() {
  const pathname = usePathname();
  const [emoji, setEmoji] = useState<string[] | null>(null);

  useEffect(() => {
    const active = activeHoliday(new Date());
    setEmoji(active ? DECORATIONS[active.id] : null);
  }, []);

  if (!emoji || HIDDEN_ROUTES.some((route) => pathname?.startsWith(route))) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {SLOTS.map((slot, i) => (
        <span
          key={i}
          className="holiday-decoration absolute select-none text-xl opacity-45 sm:text-2xl"
          style={
            {
              top: slot.top,
              [slot.side]: `${slot.offsetPx}px`,
              "--holiday-decoration-rotate": `${slot.rotate}deg`,
              animationDelay: `${i * 0.6}s`,
            } as CSSProperties
          }
        >
          {emoji[i % emoji.length]}
        </span>
      ))}
    </div>
  );
}
