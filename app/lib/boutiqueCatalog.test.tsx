import { describe, expect, it } from "vitest";
import { PREMIUM_EMOJI_OPTIONS } from "./avatarPresets";
import { BANNER_OPTIONS } from "./bannerPresets";
import { SIGNATURE_CARD_BACKS } from "./cardBackStore";
import { CARD_FACES } from "./cardFaceStore";
import { AVATAR_FRAME_OPTIONS, TITLE_OPTIONS } from "./profileCosmetics";

// `source: "boutique"` marks an item as deliberately, permanently free
// (auto-unlocked while there's no real paywall yet) — it should never
// appear alongside a real `unlock` rule, which would be a genuine
// contradiction: is it earned or isn't it? (Plenty of *other* items have
// neither field at all — the free color swatches/emoji that have always
// been free-by-design, nothing to do with the boutique track — that's a
// separate, legitimate, unmarked case this test isn't trying to police.)
describe("no catalog entry claims to be both earned and boutique", () => {
  const catalogs: { name: string; entries: readonly { unlock?: unknown; source?: "boutique" }[] }[] = [
    { name: "PREMIUM_EMOJI_OPTIONS (badge)", entries: PREMIUM_EMOJI_OPTIONS },
    { name: "AVATAR_FRAME_OPTIONS (frame)", entries: AVATAR_FRAME_OPTIONS },
    { name: "TITLE_OPTIONS (title)", entries: TITLE_OPTIONS },
    { name: "BANNER_OPTIONS (banner)", entries: BANNER_OPTIONS },
    { name: "CARD_FACES (card face)", entries: CARD_FACES },
    { name: "SIGNATURE_CARD_BACKS (card back)", entries: SIGNATURE_CARD_BACKS },
  ];

  for (const { name, entries } of catalogs) {
    it(name, () => {
      const contradictory = entries.filter((e) => !!e.unlock && e.source === "boutique");
      expect(contradictory).toEqual([]);
    });
  }
});
