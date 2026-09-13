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

/** Wraps the profile header in a wide color strip — a banner, separate
 * from the avatar frame (see bannerPresets.ts's BANNER_OPTIONS). Renders
 * children in the page's normal panel background when there's no banner
 * chosen (or an unrecognized one), so this is a safe no-op wrapper by
 * default. */
export function ProfileBanner({ banner, children }: { banner: string | null; children: ReactNode }) {
  const option = findBannerOption(banner);
  // "prismatic" gets a passing light-sweep (see globals.css's
  // .prismatic-foil) — the single apex reward reading as visibly a tier
  // above Grandmaster's own (static) conic-gradient banner, not just a
  // different color combination.
  const isPrismatic = banner === "prismatic";

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
      className={`relative rounded-2xl px-6 py-6 ${isPrismatic ? "prismatic-foil" : ""}`}
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
