import { ReactNode } from "react";
import { findBannerOption } from "../lib/bannerPresets";

/** Wraps the profile header in a wide color strip — a banner, separate
 * from the avatar frame (see bannerPresets.ts's BANNER_OPTIONS). Renders
 * children in the page's normal panel background when there's no banner
 * chosen (or an unrecognized one), so this is a safe no-op wrapper by
 * default. */
export function ProfileBanner({ banner, children }: { banner: string | null; children: ReactNode }) {
  const option = findBannerOption(banner);
  return (
    <div
      className="rounded-2xl px-6 py-6"
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
