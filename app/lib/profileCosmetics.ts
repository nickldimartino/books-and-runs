// Avatar frames and nameplate titles, alongside the premium avatar emoji
// badge (avatarPresets.ts), sharing the same unlock system
// (cosmeticUnlocks.ts) and the same server-side enforcement (migration
// 0028's cosmetic_unlocks table + trigger). Keep both catalogs here in
// sync with that migration if either ever changes.
//
// Frames are deliberately NOT level-gated (migration 0032) — they used to
// require the exact same level milestones as the badge's own 🥉🥈🥇💎,
// two systems saying the same thing about a person's level on the same
// card. The badge is the one place level shows up now; frames are just a
// color to pick, free from the start — "grandmaster" is the one
// exception, earned by mastering every achievement category instead,
// a different kind of flex than a level number.

import { CosmeticRarity } from "./cosmeticRarity";
import { CosmeticUnlockRule } from "./cosmeticUnlocks";

interface AvatarFrameOption {
  id: string;
  label: string;
  /** Absent for a free pick — only "grandmaster", the Epic/Mythic/
   * Prismatic/Creator set, and Boutique items have one. */
  unlock?: CosmeticUnlockRule;
  /** Visual-weight tier — absent means "derive it from `unlock`" via
   * cosmeticRarity.ts's defaultRarityForUnlock. */
  rarity?: CosmeticRarity;
  /** Set only on items that would eventually be purchasable — gated behind
   * `unlock: { kind: "boutique" }` (creator-only for now, a real purchase
   * later), surfaced together in the Boutique tab instead of this
   * category's own list. */
  source?: "boutique";
}

/** A ring drawn around the whole avatar (photo or emoji), independent of
 * which emoji/color/photo is inside it — see AvatarFrame.tsx. "none" isn't
 * listed here since it's just the absence of a frame (avatar_frame: null),
 * not a pickable option of its own. */
export const AVATAR_FRAME_OPTIONS: readonly AvatarFrameOption[] = [
  { id: "amber", label: "Amber" },
  { id: "mist", label: "Mist" },
  { id: "citrine", label: "Citrine" },
  { id: "sky", label: "Sky" },
  { id: "crimson", label: "Crimson" },
  { id: "coral", label: "Coral" },
  { id: "emerald", label: "Emerald" },
  { id: "forest", label: "Forest" },
  { id: "teal", label: "Teal" },
  { id: "cobalt", label: "Cobalt" },
  { id: "indigo", label: "Indigo" },
  { id: "violet", label: "Violet" },
  { id: "magenta", label: "Magenta" },
  { id: "rose", label: "Rose" },
  { id: "slate", label: "Slate" },
  { id: "onyx", label: "Onyx" },
  { id: "grandmaster", label: "Grandmaster", unlock: { kind: "allCategoriesMastered" } },
  // Epic/Mythic/Prismatic — see cosmeticUnlocks.ts's own doc for the new
  // rule kinds. Each id matches a same-named title/banner/badge — one
  // named reward per milestone, not four separately-tuned cosmetics.
  { id: "specialist", label: "Specialist", unlock: { kind: "categoriesMasteredCount", count: 3 } },
  { id: "virtuoso", label: "Virtuoso", unlock: { kind: "categoriesMasteredCount", count: 6 } },
  { id: "ascendant", label: "Ascendant", unlock: { kind: "level", level: 250 } },
  { id: "ironwill", label: "Iron Will", unlock: { kind: "gamesPlayed", count: 500 } },
  { id: "unbroken", label: "Unbroken", unlock: { kind: "dailyDealStreak", days: 30 } },
  { id: "undefeated", label: "Undefeated", unlock: { kind: "weeklyChallengeStreak", weeks: 12 } },
  // "prismatic" gets an animated conic ring (see AvatarFrame.tsx), the
  // same treatment as grandmaster but reserved for the single hardest
  // reward in the game.
  { id: "prismatic", label: "Complete", unlock: { kind: "complete" } },
  // Frame + banner only (see bannerPresets.ts) — no title or badge; the
  // existing "Creator" pill next to the name already covers that ground,
  // so a redundant earned-badge/title pair would just say the same thing
  // twice.
  { id: "dealerstable", label: "Dealer's Table", unlock: { kind: "creatorOnly" } },
  // Phase 3's 2 new epic-tier named rewards (avatarPresets.ts's ⚖️/📈) —
  // same "one reward, matching frame/title/banner" shape as Specialist/
  // Iron Will above.
  { id: "steadyhand", label: "Steady Hand", unlock: { kind: "averageScoreUnder", score: 70, minGames: 15 } },
  { id: "hotstreak", label: "Hot Streak", unlock: { kind: "mpWinStreak", streak: 8 } },
  // Boutique — see avatarPresets.ts's own doc on the "boutique" rule kind.
  // 15 total, every color (AVATAR_FRAME_COLOR below) unique from the 16
  // free flat colors above and from every earned tier's own color. Rarity
  // spans the full common→apex ladder (store.md) rather than the flat
  // "unset" (defaulting to rare) every item launched with.
  { id: "ashwood", label: "Ashwood", rarity: "common", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "ashwood" } },
  { id: "copperline", label: "Copperline", rarity: "common", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "copperline" } },
  { id: "jade", label: "Jade", rarity: "uncommon", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "jade" } },
  { id: "duskgrove", label: "Dusk Grove", rarity: "uncommon", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "duskgrove" } },
  { id: "seaglass", label: "Sea Glass", rarity: "uncommon", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "seaglass" } },
  { id: "opal", label: "Opal", rarity: "rare", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "opal" } },
  { id: "cinderglow", label: "Cinder Glow", rarity: "rare", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "cinderglow" } },
  { id: "garnetvein", label: "Garnet Vein", rarity: "rare", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "garnetvein" } },
  { id: "stormpewter", label: "Storm Pewter", rarity: "rare", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "stormpewter" } },
  { id: "obsidianrim", label: "Obsidian Rim", rarity: "epic", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "obsidianrim" } },
  { id: "winterpearl", label: "Winter Pearl", rarity: "epic", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "winterpearl" } },
  { id: "verdigris", label: "Verdigris", rarity: "epic", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "verdigris" } },
  { id: "aurumveil", label: "Aurum Veil", rarity: "mythic", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "aurumveil" } },
  { id: "amethystfrost", label: "Amethyst Frost", rarity: "mythic", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "amethystfrost" } },
  { id: "voidhalo", label: "Void Halo", rarity: "apex", source: "boutique", unlock: { kind: "boutique", category: "avatar_frame", itemId: "voidhalo" } },
];

/** Solid ring colors for each frame — "grandmaster" instead gets a
 * rotating conic gradient (see AvatarFrame.tsx) rather than one flat
 * color, since it's the single rarest cosmetic in the whole system. */
export const AVATAR_FRAME_COLOR: Record<string, string> = {
  amber: "#CD7F32",
  mist: "#B0B8C1",
  citrine: "#F5C518",
  sky: "#38BDF8",
  crimson: "#DC2626",
  coral: "#FB7185",
  emerald: "#10B981",
  forest: "#15803D",
  teal: "#14B8A6",
  cobalt: "#2563EB",
  indigo: "#6366F1",
  violet: "#8B5CF6",
  magenta: "#D946EF",
  rose: "#F43F5E",
  slate: "#64748B",
  onyx: "#1E293B",
  // Epic/Mythic/Prismatic solid colors — "prismatic" gets its own animated
  // conic ring in AvatarFrame.tsx (same mechanism as grandmaster); this
  // entry is only the flat fallback the share card's canvas uses (a static
  // PNG can't show rotation anyway — see shareCard.ts, same simplification
  // already applied to grandmaster there).
  //
  // Each of these five matches its own same-named banner's palette
  // (bannerPresets.ts) instead of a generic tier color — Ascendant used to
  // render as plain gold (indistinguishable from the free "citrine"), for
  // instance, despite its "Aurora Crown" banner being indigo-to-pink; now
  // the frame and banner actually read as one reward. That also clears up
  // what had become a pile of near-identical greys/golds/purples sitting
  // next to their free equivalents in the picker (specialist vs. violet,
  // virtuoso vs. mist, ascendant vs. citrine, ironwill vs. mist/slate).
  specialist: "#4C1D95",
  virtuoso: "#E9A8F9",
  ascendant: "#C4B5FD",
  ironwill: "#52525B",
  unbroken: "#F97316",
  undefeated: "#FACC15",
  prismatic: "#EC4899",
  // "dealerstable" ("Rose Cut" — see AvatarFrame.tsx) gets a faceted icy
  // conic gradient live; this is only the flat fallback the share card's
  // canvas uses, same simplification already applied to grandmaster/
  // prismatic there.
  dealerstable: "#DCEEF5",
  // Steady Hand/Hot Streak — same "match the sibling banner's palette"
  // reasoning as the five above.
  steadyhand: "#7DD3FC",
  hotstreak: "#F59E0B",
  // Boutique.
  opal: "#C9A0DC",
  jade: "#00A86B",
  aurumveil: "#B8860B",
  obsidianrim: "#2B1B3D",
  seaglass: "#7FCDCD",
  copperline: "#B87333",
  duskgrove: "#3B5249",
  ashwood: "#8B7D6B",
  cinderglow: "#E25822",
  winterpearl: "#A8C0D6",
  // Boutique — the 5 new frames added alongside the rarity expansion
  // (store.md).
  garnetvein: "#7A1F3D",
  stormpewter: "#5C6B73",
  verdigris: "#5B8C7B",
  amethystfrost: "#9D7FBF",
  voidhalo: "#2D0A4E",
};

export function findAvatarFrameOption(id: string | null): AvatarFrameOption | null {
  if (!id) return null;
  return AVATAR_FRAME_OPTIONS.find((f) => f.id === id) ?? null;
}

interface TitleOption {
  id: string;
  label: string;
  /** Absent for a free pick — every gated title, including Boutique items,
   * carries one. */
  unlock?: CosmeticUnlockRule;
  /** Visual-weight tier — absent means "derive it from `unlock`" via
   * cosmeticRarity.ts's defaultRarityForUnlock. */
  rarity?: CosmeticRarity;
  /** Set only on items that would eventually be purchasable — gated behind
   * `unlock: { kind: "boutique" }` (creator-only for now, a real purchase
   * later), surfaced together in the Boutique tab instead of this
   * category's own list. */
  source?: "boutique";
}

/** Shown under the display name (see player/page.tsx) — a short earned
 * flair, same spirit as a premium emoji or frame but as text instead of an
 * image. */
export const TITLE_OPTIONS: readonly TitleOption[] = [
  { id: "rising_star", label: "Rising Star", unlock: { kind: "level", level: 10 } },
  { id: "card_shark", label: "Card Shark", unlock: { kind: "level", level: 25 } },
  { id: "high_roller", label: "High Roller", unlock: { kind: "level", level: 50 } },
  { id: "living_legend", label: "Living Legend", unlock: { kind: "level", level: 100 } },
  {
    id: "statistician",
    label: "Statistician",
    unlock: { kind: "categoryMastered", category: "accountStats", categoryLabel: "Account Stats" },
  },
  {
    id: "ace_hunter",
    label: "Ace Hunter",
    unlock: { kind: "categoryMastered", category: "aiRivals", categoryLabel: "AI Rivals" },
  },
  {
    id: "meld_master",
    label: "Meld Master",
    unlock: { kind: "categoryMastered", category: "melding", categoryLabel: "Melding" },
  },
  {
    id: "the_enabler",
    label: "The Enabler",
    unlock: { kind: "categoryMastered", category: "layingOff", categoryLabel: "Laying Off" },
  },
  {
    id: "deck_whisperer",
    label: "Deck Whisperer",
    unlock: { kind: "categoryMastered", category: "drawDiscard", categoryLabel: "Draw & Discard" },
  },
  {
    id: "clean_sweeper",
    label: "Clean Sweeper",
    unlock: { kind: "categoryMastered", category: "goingOut", categoryLabel: "Going Out" },
  },
  {
    id: "contract_killer",
    label: "Contract Killer",
    unlock: { kind: "categoryMastered", category: "contracts", categoryLabel: "Contracts" },
  },
  {
    id: "table_captain",
    label: "Table Captain",
    unlock: { kind: "categoryMastered", category: "tableComposition", categoryLabel: "Table Composition" },
  },
  {
    id: "multiplayer_monarch",
    label: "Multiplayer Monarch",
    unlock: { kind: "categoryMastered", category: "multiplayer", categoryLabel: "Multiplayer" },
  },
  { id: "grandmaster", label: "Grandmaster", unlock: { kind: "allCategoriesMastered" } },
  // Epic/Mythic/Prismatic — matching id to the same-named frame/banner/badge.
  { id: "specialist", label: "Specialist", unlock: { kind: "categoriesMasteredCount", count: 3 } },
  { id: "virtuoso", label: "Virtuoso", unlock: { kind: "categoriesMasteredCount", count: 6 } },
  { id: "ascendant", label: "Ascendant", unlock: { kind: "level", level: 250 } },
  { id: "ironwill", label: "Iron Will", unlock: { kind: "gamesPlayed", count: 500 } },
  { id: "unbroken", label: "Unbroken", unlock: { kind: "dailyDealStreak", days: 30 } },
  { id: "undefeated", label: "Undefeated", unlock: { kind: "weeklyChallengeStreak", weeks: 12 } },
  { id: "prismatic", label: "Complete", unlock: { kind: "complete" } },
  { id: "steadyhand", label: "Steady Hand", unlock: { kind: "averageScoreUnder", score: 70, minGames: 15 } },
  { id: "hotstreak", label: "Hot Streak", unlock: { kind: "mpWinStreak", streak: 8 } },
  // Boutique — see avatarPresets.ts's own doc on the "boutique" rule kind.
  // 15 total, every label unique from every other title in this list. Rarity
  // spans the full common→apex ladder (store.md) rather than the flat
  // "unset" (defaulting to rare) every item launched with.
  { id: "night_owl", label: "Night Owl", rarity: "common", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "night_owl" } },
  { id: "backroom_regular", label: "Backroom Regular", rarity: "common", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "backroom_regular" } },
  { id: "the_bluffer", label: "The Bluffer", rarity: "uncommon", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "the_bluffer" } },
  { id: "silk_road", label: "Silk Road", rarity: "uncommon", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "silk_road" } },
  { id: "velvet_hand", label: "Velvet Hand", rarity: "uncommon", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "velvet_hand" } },
  { id: "midnight_dealer", label: "Midnight Dealer", rarity: "rare", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "midnight_dealer" } },
  { id: "the_fixer", label: "The Fixer", rarity: "rare", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "the_fixer" } },
  { id: "the_sharp", label: "The Sharp", rarity: "rare", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "the_sharp" } },
  { id: "last_call", label: "Last Call", rarity: "rare", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "last_call" } },
  { id: "the_collector", label: "The Collector", rarity: "epic", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "the_collector" } },
  { id: "gilded_tongue", label: "Gilded Tongue", rarity: "epic", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "gilded_tongue" } },
  { id: "quiet_storm", label: "Quiet Storm", rarity: "epic", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "quiet_storm" } },
  { id: "diamond_cut", label: "Diamond Cut", rarity: "mythic", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "diamond_cut" } },
  { id: "smoke_and_mirrors", label: "Smoke and Mirrors", rarity: "mythic", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "smoke_and_mirrors" } },
  { id: "table_legend", label: "Table Legend", rarity: "apex", source: "boutique", unlock: { kind: "boutique", category: "title", itemId: "table_legend" } },
];

export function findTitleOption(id: string | null): TitleOption | null {
  if (!id) return null;
  return TITLE_OPTIONS.find((t) => t.id === id) ?? null;
}
