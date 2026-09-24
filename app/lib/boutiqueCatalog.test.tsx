import { describe, expect, it } from "vitest";
import { PREMIUM_EMOJI_OPTIONS } from "./avatarPresets";
import { BANNER_OPTIONS } from "./bannerPresets";
import { SIGNATURE_CARD_BACKS } from "./cardBackStore";
import { CARD_FACES } from "./cardFaceStore";
import { CosmeticUnlockRule } from "./cosmeticUnlocks";
import { AVATAR_FRAME_OPTIONS, TITLE_OPTIONS } from "./profileCosmetics";

// `source: "boutique"` marks an item as meant to eventually be a real
// purchase — gated behind the "boutique" CosmeticUnlockRule kind
// (creator-only for now, see cosmeticUnlocks.ts's own doc on why that's a
// distinct kind from creatorOnly). The two fields need to agree exactly:
// every boutique item is gated by that kind and nothing else, and nothing
// non-boutique uses that kind (it would be unreachable for anyone but the
// creator with no way to ever change that, unlike a real Boutique item
// whose gate is meant to loosen once payments exist).
describe("`source: \"boutique\"` and `unlock: { kind: \"boutique\" }` always agree", () => {
  const catalogs: { name: string; entries: readonly { unlock?: CosmeticUnlockRule; source?: "boutique" }[] }[] = [
    { name: "PREMIUM_EMOJI_OPTIONS (badge)", entries: PREMIUM_EMOJI_OPTIONS },
    { name: "AVATAR_FRAME_OPTIONS (frame)", entries: AVATAR_FRAME_OPTIONS },
    { name: "TITLE_OPTIONS (title)", entries: TITLE_OPTIONS },
    { name: "BANNER_OPTIONS (banner)", entries: BANNER_OPTIONS },
    { name: "CARD_FACES (card face)", entries: CARD_FACES },
    { name: "SIGNATURE_CARD_BACKS (card back)", entries: SIGNATURE_CARD_BACKS },
  ];

  for (const { name, entries } of catalogs) {
    it(name, () => {
      const mismatched = entries.filter((e) => (e.source === "boutique") !== (e.unlock?.kind === "boutique"));
      expect(mismatched).toEqual([]);
    });
  }
});
