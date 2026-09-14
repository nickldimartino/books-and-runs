import { ReactNode } from "react";
import { findBannerOption } from "../lib/bannerPresets";

/** One gem cabochon on the Dealer's Table banner's wood band — see
 * globals.css's .gem-stone/.gem-<color> for the actual look. */
function GemStone({ color, corner }: { color: "sapphire" | "ruby" | "emerald" | "amethyst" | "diamond"; corner?: string }) {
  return <span className={`gem-stone gem-${color} ${corner ? `corner ${corner}` : ""}`} />;
}

const TOP_EDGE_GEMS = ["ruby", "emerald", "amethyst", "diamond", "sapphire", "ruby", "emerald", "amethyst", "diamond", "sapphire"] as const;
const BOTTOM_EDGE_GEMS = ["sapphire", "diamond", "amethyst", "emerald", "ruby", "sapphire", "diamond", "amethyst", "emerald", "ruby"] as const;
const LEFT_EDGE_GEMS = ["emerald", "diamond", "ruby", "amethyst", "sapphire", "emerald"] as const;
const RIGHT_EDGE_GEMS = ["ruby", "diamond", "emerald", "sapphire", "amethyst", "ruby"] as const;

/** Scattered across the whole Prismatic banner (top%/left%/size in px) —
 * clustered toward the margins so the centered avatar/name column stays
 * legible, but reaching corner-to-corner rather than framing just a
 * border, so "the apex reward" reads as a tier above Grandmaster's own
 * (otherwise near-identical) rotating rainbow gradient. */
const PRISMATIC_DIAMONDS: readonly { top: number; left: number; size: number }[] = [
  { top: 8, left: 6, size: 10 },
  { top: 22, left: 4, size: 8 },
  { top: 38, left: 8, size: 11 },
  { top: 55, left: 3, size: 9 },
  { top: 72, left: 7, size: 10 },
  { top: 88, left: 5, size: 8 },
  { top: 10, left: 92, size: 9 },
  { top: 26, left: 96, size: 11 },
  { top: 44, left: 89, size: 8 },
  { top: 60, left: 94, size: 10 },
  { top: 78, left: 90, size: 9 },
  { top: 92, left: 95, size: 8 },
  { top: 6, left: 30, size: 8 },
  { top: 4, left: 50, size: 10 },
  { top: 9, left: 68, size: 8 },
  { top: 92, left: 35, size: 8 },
  { top: 95, left: 65, size: 9 },
];

/** Wraps the profile header in a wide color strip — a banner, separate
 * from the avatar frame (see bannerPresets.ts's BANNER_OPTIONS). Renders
 * children in the page's normal panel background when there's no banner
 * chosen (or an unrecognized one), so this is a safe no-op wrapper by
 * default. */
export function ProfileBanner({ banner, children }: { banner: string | null; children: ReactNode }) {
  const option = findBannerOption(banner);

  // "prismatic" — the single apex reward (every category mastered, Level
  // 250, and a 30-day Daily Deal streak, all at once) — used to be almost
  // the same rotating-rainbow banner as "grandmaster" (mastering every
  // category alone), differing only by a passing light-sweep. It's now
  // diamond-studded corner to corner on top of that same rainbow base, so
  // it reads as a clearly rarer tier rather than a slightly-shinier
  // repaint of Grandmaster.
  if (banner === "prismatic") {
    return (
      <div
        className="prismatic-foil relative overflow-hidden rounded-2xl px-6 py-6"
        style={{ background: `linear-gradient(rgba(0,0,0,0.32), rgba(0,0,0,0.32)), ${option!.css}` }}
      >
        {children}
        <div className="prismatic-diamonds">
          {PRISMATIC_DIAMONDS.map((d, i) => (
            <span
              key={i}
              className="gem-stone gem-diamond"
              style={{ position: "absolute", top: `${d.top}%`, left: `${d.left}%`, width: d.size, height: d.size }}
            />
          ))}
        </div>
      </div>
    );
  }

  // "dealerstable" is real layered DOM (wood band studded with gem
  // cabochons, wrapping a dark felt table), not a single `background`
  // string like every other banner — bannerPresets.ts's `css` for this id
  // only feeds the free-swatch picker preview and the share-card PNG
  // fallback. See globals.css's .dealers-table-* rules for the look.
  if (banner === "dealerstable") {
    return (
      <div className="dealers-table-banner">
        <div className="dealers-table-felt relative px-6 py-6">{children}</div>
        <div className="dealers-table-gems">
          <div className="dealers-table-edge top">
            {TOP_EDGE_GEMS.map((c, i) => <GemStone key={i} color={c} />)}
          </div>
          <div className="dealers-table-edge bottom">
            {BOTTOM_EDGE_GEMS.map((c, i) => <GemStone key={i} color={c} />)}
          </div>
          <div className="dealers-table-edge left">
            {LEFT_EDGE_GEMS.map((c, i) => <GemStone key={i} color={c} />)}
          </div>
          <div className="dealers-table-edge right">
            {RIGHT_EDGE_GEMS.map((c, i) => <GemStone key={i} color={c} />)}
          </div>
          <GemStone color="diamond" corner="tl" />
          <GemStone color="diamond" corner="tr" />
          <GemStone color="diamond" corner="bl" />
          <GemStone color="diamond" corner="br" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-2xl px-6 py-6"
      style={{
        // A dark scrim under every banner guarantees the header's own
        // white-on-banner text (see player/page.tsx's onBanner branch)
        // stays legible regardless of which gradient's stops happen to
        // land where — some (e.g. "ice") lighten sharply toward one edge.
        background: option ? `linear-gradient(rgba(0,0,0,0.32), rgba(0,0,0,0.32)), ${option.css}` : "var(--panel)",
      }}
    >
      {children}
    </div>
  );
}
